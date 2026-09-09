package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** One grouped filter surface; large facets open searchable secondary pickers. */
final class UnifiedLibraryFilterDialog {
    interface Apply { void apply(UnifiedLibraryFilter.Spec spec); }
    private UnifiedLibraryFilterDialog(){}

    static void show(Activity activity,UnifiedLibraryFilter.Spec current,UnifiedLibraryFilter.Facets facets,Apply apply){
        UnifiedLibraryFilter.Spec working=current.copy();
        ScrollView scroll=new ScrollView(activity);LinearLayout root=new LinearLayout(activity);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(Ui.dp(activity,18),Ui.dp(activity,8),Ui.dp(activity,18),Ui.dp(activity,12));scroll.addView(root);

        section(root,activity,"可用位置");
        CheckBox phone=box(activity,"手机已下载",working.sources.contains(UnifiedLibraryFilter.Source.PHONE));
        CheckBox desktop=box(activity,"电脑已下载",working.sources.contains(UnifiedLibraryFilter.Source.DESKTOP));
        CheckBox webdav=box(activity,"WebDAV 云端",working.sources.contains(UnifiedLibraryFilter.Source.WEBDAV));
        root.addView(phone);root.addView(desktop);root.addView(webdav);

        section(root,activity,"收藏与书架");
        CheckBox favorite=box(activity,"仅收藏",working.favoriteOnly);CheckBox shelf=box(activity,"仅书架内",working.shelfOnly);root.addView(favorite);root.addView(shelf);

        section(root,activity,"作者 / 标签 / 分类");
        Button authors=facetButton(activity,"作者",working.authors.size());Button tags=facetButton(activity,"标签",working.tags.size());Button categories=facetButton(activity,"分类",working.categories.size());root.addView(authors);root.addView(tags);root.addView(categories);
        authors.setOnClickListener(v->showFacetPicker(activity,"选择作者",facets.authors,working.authors,()->authors.setText(facetLabel("作者",working.authors.size()))));
        tags.setOnClickListener(v->showFacetPicker(activity,"选择标签",facets.tags,working.tags,()->tags.setText(facetLabel("标签",working.tags.size()))));
        categories.setOnClickListener(v->showFacetPicker(activity,"选择分类",facets.categories,working.categories,()->categories.setText(facetLabel("分类",working.categories.size()))));

        TextView tagRule=Ui.text(activity,"多标签匹配",13,Ui.MUTED,true);tagRule.setPadding(0,Ui.dp(activity,8),0,0);root.addView(tagRule);
        RadioGroup tagMode=new RadioGroup(activity);tagMode.setOrientation(LinearLayout.HORIZONTAL);RadioButton any=radio(activity,"任意标签");RadioButton all=radio(activity,"全部标签");tagMode.addView(any,new RadioGroup.LayoutParams(0,-2,1));tagMode.addView(all,new RadioGroup.LayoutParams(0,-2,1));(working.tagMode==UnifiedLibraryFilter.TagMode.ALL?all:any).setChecked(true);root.addView(tagMode);

        section(root,activity,"连载状态");
        RadioGroup finishedGroup=new RadioGroup(activity);finishedGroup.setOrientation(LinearLayout.HORIZONTAL);RadioButton finishedAny=radio(activity,"全部");RadioButton ongoing=radio(activity,"连载");RadioButton finished=radio(activity,"完结");finishedGroup.addView(finishedAny,new RadioGroup.LayoutParams(0,-2,1));finishedGroup.addView(ongoing,new RadioGroup.LayoutParams(0,-2,1));finishedGroup.addView(finished,new RadioGroup.LayoutParams(0,-2,1));if(working.finished==null)finishedAny.setChecked(true);else if(working.finished)finished.setChecked(true);else ongoing.setChecked(true);root.addView(finishedGroup);

        section(root,activity,"排序");
        RadioGroup sortGroup=new RadioGroup(activity);sortGroup.setOrientation(LinearLayout.VERTICAL);RadioButton latest=radio(activity,"最近更新");RadioButton title=radio(activity,"标题");RadioButton author=radio(activity,"作者");sortGroup.addView(latest);sortGroup.addView(title);sortGroup.addView(author);if(working.sort==UnifiedLibraryFilter.Sort.TITLE)title.setChecked(true);else if(working.sort==UnifiedLibraryFilter.Sort.AUTHOR)author.setChecked(true);else latest.setChecked(true);root.addView(sortGroup);

        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle("筛选与排序").setView(scroll).setNegativeButton("取消",null).setNeutralButton("清除全部",null).setPositiveButton("应用",null).create();
        dialog.setOnShowListener(ignored->{
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v->{working.clear();apply.apply(working);dialog.dismiss();});
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
                working.sources.clear();if(phone.isChecked())working.sources.add(UnifiedLibraryFilter.Source.PHONE);if(desktop.isChecked())working.sources.add(UnifiedLibraryFilter.Source.DESKTOP);if(webdav.isChecked())working.sources.add(UnifiedLibraryFilter.Source.WEBDAV);
                working.favoriteOnly=favorite.isChecked();working.shelfOnly=shelf.isChecked();working.tagMode=all.isChecked()?UnifiedLibraryFilter.TagMode.ALL:UnifiedLibraryFilter.TagMode.ANY;
                working.finished=finished.isChecked()?Boolean.TRUE:ongoing.isChecked()?Boolean.FALSE:null;
                working.sort=title.isChecked()?UnifiedLibraryFilter.Sort.TITLE:author.isChecked()?UnifiedLibraryFilter.Sort.AUTHOR:UnifiedLibraryFilter.Sort.LATEST;
                apply.apply(working);dialog.dismiss();
            });
        });
        dialog.show();
    }

    private static void showFacetPicker(Activity activity,String title,List<UnifiedLibraryFilter.Facet> facets,Set<String> target,Runnable done){
        Set<String> selected=new LinkedHashSet<>(target);LinearLayout root=new LinearLayout(activity);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(Ui.dp(activity,16),Ui.dp(activity,8),Ui.dp(activity,16),0);
        EditText search=new EditText(activity);search.setSingleLine(true);search.setHint("搜索");root.addView(search);
        ScrollView scroll=new ScrollView(activity);LinearLayout list=new LinearLayout(activity);list.setOrientation(LinearLayout.VERTICAL);scroll.addView(list);root.addView(scroll,new LinearLayout.LayoutParams(-1,Ui.dp(activity,430)));
        Runnable render=()->renderFacetList(activity,list,facets,selected,search.getText().toString());render.run();
        search.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int st,int c,int a){}public void onTextChanged(CharSequence s,int st,int before,int count){render.run();}public void afterTextChanged(Editable e){}});
        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle(title).setView(root).setNegativeButton("取消",null).setNeutralButton("清空",null).setPositiveButton("确定",null).create();
        dialog.setOnShowListener(ignored->{
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v->{selected.clear();render.run();});
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{target.clear();target.addAll(selected);done.run();dialog.dismiss();});
        });dialog.show();
    }

    private static void renderFacetList(Activity activity,LinearLayout list,List<UnifiedLibraryFilter.Facet> facets,Set<String> selected,String raw){
        list.removeAllViews();String query=raw==null?"":raw.trim().toLowerCase(Locale.ROOT);int shown=0;
        for(UnifiedLibraryFilter.Facet facet:facets){if(!query.isEmpty()&&!facet.value.toLowerCase(Locale.ROOT).contains(query))continue;if(shown++>=160)break;CheckBox box=box(activity,facet.value+"  ·  "+facet.count,selected.contains(facet.value));box.setOnCheckedChangeListener((button,checked)->{if(checked)selected.add(facet.value);else selected.remove(facet.value);});list.addView(box);}
        if(shown==0)list.addView(Ui.text(activity,"没有匹配项",13,Ui.MUTED,false));else if(shown>160)list.addView(Ui.text(activity,"仅显示前 160 项，请继续输入关键词缩小范围",12,Ui.MUTED,false));
    }

    private static void section(LinearLayout root,Activity activity,String label){TextView text=Ui.text(activity,label,15,Ui.TEXT,true);text.setPadding(0,Ui.dp(activity,14),0,Ui.dp(activity,3));root.addView(text);}
    private static CheckBox box(Activity activity,String label,boolean checked){CheckBox box=new CheckBox(activity);box.setText(label);box.setTextColor(Ui.TEXT);box.setChecked(checked);return box;}
    private static RadioButton radio(Activity activity,String label){RadioButton button=new RadioButton(activity);button.setText(label);button.setTextColor(Ui.TEXT);button.setId(View.generateViewId());return button;}
    private static Button facetButton(Activity activity,String label,int count){Button button=new Button(activity);button.setAllCaps(false);button.setTextColor(Ui.PRIMARY);button.setText(facetLabel(label,count));return button;}
    private static String facetLabel(String label,int count){return count>0?label+" · 已选 "+count:label+" · 选择";}
}
