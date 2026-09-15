package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.*;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Progressive-disclosure library filter. Sorting is intentionally owned by the Library toolbar. */
final class UnifiedLibraryFilterDialog {
    interface Apply { void apply(UnifiedLibraryFilter.Spec spec); }
    private UnifiedLibraryFilterDialog(){}

    static void show(Activity activity,UnifiedLibraryFilter.Spec current,UnifiedLibraryFilter.Facets facets,Apply apply){
        UnifiedLibraryFilter.Spec working=current.copy();working.favoriteOnly=false;
        LinearLayout root=new LinearLayout(activity);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(Ui.dp(activity,18),Ui.dp(activity,4),Ui.dp(activity,18),Ui.dp(activity,8));
        section(root,activity,"常用筛选");
        CheckBox shelf=box(activity,"仅书架内",working.shelfOnly);root.addView(shelf);
        Button authors=facetButton(activity,"作者",working.authors.size());Button tags=facetButton(activity,"标签",working.tags.size());Button categories=facetButton(activity,"分类",working.categories.size());root.addView(authors);root.addView(tags);root.addView(categories);
        authors.setOnClickListener(v->showFacetPicker(activity,"选择作者",facets.authors,working.authors,()->authors.setText(facetLabel("作者",working.authors.size()))));
        tags.setOnClickListener(v->showFacetPicker(activity,"选择标签",facets.tags,working.tags,()->tags.setText(facetLabel("标签",working.tags.size()))));
        categories.setOnClickListener(v->showFacetPicker(activity,"选择分类",facets.categories,working.categories,()->categories.setText(facetLabel("分类",working.categories.size()))));
        Button more=facetButton(activity,"更多筛选",advancedCount(working));root.addView(more);more.setOnClickListener(v->showAdvanced(activity,working,()->more.setText(facetLabel("更多筛选",advancedCount(working)))));

        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle("筛选").setView(root).setNegativeButton("取消",null).setNeutralButton("清除",null).setPositiveButton("应用",null).create();
        dialog.setOnShowListener(ignored->{dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v->{UnifiedLibraryFilter.Sort sort=working.sort;working.clear();working.sort=sort;apply.apply(working);dialog.dismiss();});dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{working.favoriteOnly=false;working.shelfOnly=shelf.isChecked();apply.apply(working);dialog.dismiss();});});dialog.show();
    }

    private static int advancedCount(UnifiedLibraryFilter.Spec spec){int n=0;if(!spec.locations.isEmpty())n++;if(!spec.providers.isEmpty())n++;if(spec.finished!=null)n++;if(spec.tagMode==UnifiedLibraryFilter.TagMode.ALL)n++;return n;}
    private static void showAdvanced(Activity activity,UnifiedLibraryFilter.Spec working,Runnable done){
        ScrollView scroll=new ScrollView(activity);LinearLayout root=new LinearLayout(activity);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(Ui.dp(activity,18),0,Ui.dp(activity,18),Ui.dp(activity,8));scroll.addView(root);
        section(root,activity,"可读取位置");CheckBox phone=box(activity,"手机已下载",working.locations.contains(UnifiedLibraryFilter.Location.PHONE));CheckBox desktop=box(activity,"电脑已下载",working.locations.contains(UnifiedLibraryFilter.Location.DESKTOP));CheckBox webdav=box(activity,"WebDAV",working.locations.contains(UnifiedLibraryFilter.Location.WEBDAV));CheckBox online=box(activity,"在线可读",working.locations.contains(UnifiedLibraryFilter.Location.ONLINE));root.addView(phone);root.addView(desktop);root.addView(webdav);root.addView(online);
        section(root,activity,"在线来源");CheckBox pica=box(activity,"Pica",working.providers.contains(UnifiedLibraryFilter.Provider.PICA));CheckBox eh=box(activity,"E-Hentai",working.providers.contains(UnifiedLibraryFilter.Provider.EH));CheckBox exh=box(activity,"ExHentai · 可选扩展",working.providers.contains(UnifiedLibraryFilter.Provider.EXH));root.addView(pica);root.addView(eh);root.addView(exh);
        section(root,activity,"连载状态");RadioGroup finishedGroup=new RadioGroup(activity);finishedGroup.setOrientation(LinearLayout.HORIZONTAL);RadioButton finishedAny=radio(activity,"全部");RadioButton ongoing=radio(activity,"连载");RadioButton finished=radio(activity,"完结");finishedGroup.addView(finishedAny,new RadioGroup.LayoutParams(0,-2,1));finishedGroup.addView(ongoing,new RadioGroup.LayoutParams(0,-2,1));finishedGroup.addView(finished,new RadioGroup.LayoutParams(0,-2,1));if(working.finished==null)finishedAny.setChecked(true);else if(working.finished)finished.setChecked(true);else ongoing.setChecked(true);root.addView(finishedGroup);
        section(root,activity,"多标签匹配");RadioGroup tagMode=new RadioGroup(activity);tagMode.setOrientation(LinearLayout.HORIZONTAL);RadioButton any=radio(activity,"任意标签");RadioButton all=radio(activity,"全部标签");tagMode.addView(any,new RadioGroup.LayoutParams(0,-2,1));tagMode.addView(all,new RadioGroup.LayoutParams(0,-2,1));(working.tagMode==UnifiedLibraryFilter.TagMode.ALL?all:any).setChecked(true);root.addView(tagMode);
        new AlertDialog.Builder(activity).setTitle("更多筛选").setView(scroll).setNegativeButton("取消",null).setPositiveButton("确定",(d,w)->{working.locations.clear();if(phone.isChecked())working.locations.add(UnifiedLibraryFilter.Location.PHONE);if(desktop.isChecked())working.locations.add(UnifiedLibraryFilter.Location.DESKTOP);if(webdav.isChecked())working.locations.add(UnifiedLibraryFilter.Location.WEBDAV);if(online.isChecked())working.locations.add(UnifiedLibraryFilter.Location.ONLINE);working.providers.clear();if(pica.isChecked())working.providers.add(UnifiedLibraryFilter.Provider.PICA);if(eh.isChecked())working.providers.add(UnifiedLibraryFilter.Provider.EH);if(exh.isChecked())working.providers.add(UnifiedLibraryFilter.Provider.EXH);working.finished=finished.isChecked()?Boolean.TRUE:ongoing.isChecked()?Boolean.FALSE:null;working.tagMode=all.isChecked()?UnifiedLibraryFilter.TagMode.ALL:UnifiedLibraryFilter.TagMode.ANY;done.run();}).show();
    }

    private static void showFacetPicker(Activity activity,String title,List<UnifiedLibraryFilter.Facet> facets,Set<String> target,Runnable done){
        Set<String> selected=new LinkedHashSet<>(target);LinearLayout root=new LinearLayout(activity);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(Ui.dp(activity,16),Ui.dp(activity,8),Ui.dp(activity,16),0);EditText search=new EditText(activity);search.setSingleLine(true);search.setHint("搜索");Ui.styleField(search,activity);root.addView(search);ScrollView scroll=new ScrollView(activity);LinearLayout list=new LinearLayout(activity);list.setOrientation(LinearLayout.VERTICAL);scroll.addView(list);root.addView(scroll,new LinearLayout.LayoutParams(-1,Ui.dp(activity,430)));Runnable render=()->renderFacetList(activity,list,facets,selected,search.getText().toString());render.run();search.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int st,int c,int a){}public void onTextChanged(CharSequence s,int st,int before,int count){render.run();}public void afterTextChanged(Editable e){}});AlertDialog dialog=new AlertDialog.Builder(activity).setTitle(title).setView(root).setNegativeButton("取消",null).setNeutralButton("清空",null).setPositiveButton("确定",null).create();dialog.setOnShowListener(ignored->{dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v->{selected.clear();render.run();});dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{target.clear();target.addAll(selected);done.run();dialog.dismiss();});});dialog.show();
    }
    private static void renderFacetList(Activity activity,LinearLayout list,List<UnifiedLibraryFilter.Facet> facets,Set<String> selected,String raw){list.removeAllViews();String query=raw==null?"":raw.trim().toLowerCase(Locale.ROOT);int shown=0;boolean truncated=false;for(UnifiedLibraryFilter.Facet facet:facets){if(!query.isEmpty()&&!facet.value.toLowerCase(Locale.ROOT).contains(query))continue;if(shown>=160){truncated=true;break;}shown++;CheckBox box=box(activity,facet.value+"  ·  "+facet.count,selected.contains(facet.value));box.setOnCheckedChangeListener((button,checked)->{if(checked)selected.add(facet.value);else selected.remove(facet.value);});list.addView(box);}if(shown==0)list.addView(Ui.text(activity,"没有匹配项",13,Ui.MUTED,false));else if(truncated)list.addView(Ui.text(activity,"结果较多，请继续输入关键词",12,Ui.MUTED,false));}
    private static void section(LinearLayout root,Activity activity,String label){TextView text=Ui.text(activity,label,15,Ui.TEXT,true);text.setPadding(0,Ui.dp(activity,12),0,Ui.dp(activity,2));root.addView(text);}
    private static CheckBox box(Activity activity,String label,boolean checked){CheckBox box=new CheckBox(activity);box.setText(label);box.setTextColor(Ui.TEXT);box.setChecked(checked);return box;}
    private static RadioButton radio(Activity activity,String label){RadioButton button=new RadioButton(activity);button.setText(label);button.setTextColor(Ui.TEXT);button.setId(View.generateViewId());return button;}
    private static Button facetButton(Activity activity,String label,int count){Button button=Ui.button(activity,facetLabel(label,count),null,true);button.setTextColor(Ui.PRIMARY);return button;}
    private static String facetLabel(String label,int count){return count>0?label+" · "+count:label;}
}
