package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;

/** One comic card per comicId. Source details remain attributes behind a single entry. */
final class UnifiedComicGridAdapter extends BaseAdapter {
    interface Click { void open(UnifiedCatalogStore.Entry entry); }
    private final Activity activity;private final List<UnifiedCatalogStore.Entry> items;private boolean opening;
    UnifiedComicGridAdapter(Activity activity,List<UnifiedCatalogStore.Entry> items,Click ignored){this.activity=activity;this.items=items;}
    @Override public int getCount(){return items.size();}
    @Override public UnifiedCatalogStore.Entry getItem(int position){return items.get(position);}
    @Override public long getItemId(int position){return position;}

    @Override public View getView(int position,View reuse,ViewGroup parent){
        Holder holder;if(reuse==null){LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);card.setPadding(Ui.dp(activity,5),Ui.dp(activity,5),Ui.dp(activity,5),Ui.dp(activity,9));card.setBackground(Ui.rounded(Color.WHITE,14,activity));ImageView cover=new ImageView(activity);cover.setScaleType(ImageView.ScaleType.CENTER_CROP);card.addView(cover,new LinearLayout.LayoutParams(-1,Ui.dp(activity,218)));TextView title=Ui.text(activity,"",14.5f,Ui.TEXT,true);title.setMaxLines(2);title.setPadding(0,Ui.dp(activity,7),0,0);card.addView(title);TextView meta=Ui.text(activity,"",11.5f,Ui.MUTED,false);meta.setMaxLines(2);meta.setPadding(0,Ui.dp(activity,2),0,0);card.addView(meta);TextView tags=Ui.text(activity,"",10.5f,Ui.PRIMARY,false);tags.setMaxLines(1);tags.setPadding(0,Ui.dp(activity,3),0,0);card.addView(tags);holder=new Holder(card,cover,title,meta,tags);card.setTag(holder);reuse=card;}else holder=(Holder)reuse.getTag();
        UnifiedCatalogStore.Entry item=getItem(position);holder.title.setText(item.title);holder.meta.setText(item.displayAuthor()+" · "+availability(item));String tagLine=tagLine(item);holder.tags.setText(tagLine);holder.tags.setVisibility(tagLine.isEmpty()?View.GONE:View.VISIBLE);View cardView=reuse;reuse.setEnabled(true);reuse.setAlpha(1f);reuse.setOnClickListener(v->{if(opening)return;opening=true;cardView.setAlpha(.62f);cardView.setEnabled(false);Intent intent=new Intent(activity,UnifiedComicDetailActivity.class);intent.putExtra("comicId",item.id);intent.putExtra("title",item.title);intent.putExtra("author",item.displayAuthor());activity.startActivity(intent);});CoverRepository.load(activity,holder.cover,item,0xffebe8ef);return reuse;
    }
    private String availability(UnifiedCatalogStore.Entry item){List<String> values=new ArrayList<>();if(item.phoneDownloaded)values.add("手机");if(item.desktopDownloaded)values.add("电脑");if(item.remoteAvailable)values.add("云端");if(item.picaAvailable)values.add("在线");if(values.isEmpty())values.add("仅元数据");if(item.favorite)values.add("收藏");if(item.inShelf)values.add("书架");return join(values," · ");}
    private String tagLine(UnifiedCatalogStore.Entry item){if(item.tags.isEmpty())return "";StringBuilder out=new StringBuilder();for(int i=0;i<item.tags.size()&&i<3;i++){if(i>0)out.append(" · ");out.append(item.tags.get(i));}return out.toString();}
    private String join(List<String> values,String separator){StringBuilder out=new StringBuilder();for(String value:values){if(out.length()>0)out.append(separator);out.append(value);}return out.toString();}
    void close(){opening=false;}
    private static final class Holder{final LinearLayout root;final ImageView cover;final TextView title,meta,tags;Holder(LinearLayout root,ImageView cover,TextView title,TextView meta,TextView tags){this.root=root;this.cover=cover;this.title=title;this.meta=meta;this.tags=tags;}}
}
