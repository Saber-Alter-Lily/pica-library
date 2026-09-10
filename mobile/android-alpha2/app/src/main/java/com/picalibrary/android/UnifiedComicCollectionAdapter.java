package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.recyclerview.widget.RecyclerView;
import java.util.ArrayList;
import java.util.List;

/** Shared collection renderer for Library and Shelves. */
final class UnifiedComicCollectionAdapter extends RecyclerView.Adapter<UnifiedComicCollectionAdapter.Holder> {
    static final int MODE_LIST=0, MODE_GRID_LARGE=2, MODE_GRID_MEDIUM=3, MODE_GRID_SMALL=5;
    interface Open { void open(UnifiedCatalogStore.Entry entry); }
    private final Activity activity;
    private final List<UnifiedCatalogStore.Entry> items=new ArrayList<>();
    private final Open open;
    private int mode;

    UnifiedComicCollectionAdapter(Activity activity,int mode,List<UnifiedCatalogStore.Entry> initial,Open open){this.activity=activity;this.mode=normalizeMode(mode);this.open=open;replace(initial);}
    static int normalizeMode(int value){return value==MODE_LIST||value==MODE_GRID_LARGE||value==MODE_GRID_MEDIUM||value==MODE_GRID_SMALL?value:MODE_GRID_MEDIUM;}
    int mode(){return mode;}
    void setMode(int value){int next=normalizeMode(value);if(next==mode)return;mode=next;notifyDataSetChanged();}
    void replace(List<UnifiedCatalogStore.Entry> next){items.clear();if(next!=null)items.addAll(next);notifyDataSetChanged();}
    @Override public int getItemCount(){return items.size();}
    @Override public int getItemViewType(int position){return mode;}

    @Override public Holder onCreateViewHolder(ViewGroup parent,int type){
        boolean list=type==MODE_LIST;LinearLayout card=new LinearLayout(activity);card.setOrientation(list?LinearLayout.HORIZONTAL:LinearLayout.VERTICAL);card.setGravity(Gravity.TOP);card.setPadding(Ui.dp(activity,list?10:5),Ui.dp(activity,list?9:5),Ui.dp(activity,list?10:5),Ui.dp(activity,list?9:8));card.setBackground(Ui.rounded(Ui.SURFACE,14,activity));
        RecyclerView.LayoutParams outer=new RecyclerView.LayoutParams(-1,-2);int gap=Ui.dp(activity,type==MODE_GRID_SMALL?3:6);outer.setMargins(gap,gap,gap,gap);card.setLayoutParams(outer);
        ImageView cover=new ImageView(activity);cover.setScaleType(ImageView.ScaleType.CENTER_CROP);cover.setBackgroundColor(Ui.PLACEHOLDER);
        if(list)card.addView(cover,new LinearLayout.LayoutParams(Ui.dp(activity,82),Ui.dp(activity,116)));else card.addView(cover,new LinearLayout.LayoutParams(-1,coverHeight(type)));
        LinearLayout copy=new LinearLayout(activity);copy.setOrientation(LinearLayout.VERTICAL);copy.setPadding(list?Ui.dp(activity,12):0,list?0:Ui.dp(activity,6),0,0);TextView title=Ui.text(activity,"",titleSize(type),Ui.TEXT,true);title.setMaxLines(type==MODE_GRID_SMALL?2:3);copy.addView(title);TextView author=Ui.text(activity,"",metaSize(type),Ui.MUTED,false);author.setMaxLines(1);copy.addView(author);TextView tags=Ui.text(activity,"",tagSize(type),Ui.PRIMARY,false);tags.setMaxLines(list?2:1);copy.addView(tags);TextView state=Ui.text(activity,"",tagSize(type),Ui.MUTED,false);state.setMaxLines(1);copy.addView(state);
        if(list)card.addView(copy,new LinearLayout.LayoutParams(0,-2,1));else card.addView(copy);return new Holder(card,cover,title,author,tags,state);
    }
    @Override public void onBindViewHolder(Holder h,int position){UnifiedCatalogStore.Entry item=items.get(position);h.title.setText(item.title);h.author.setText(item.displayAuthor());String tags=tagLine(item);h.tags.setText(tags);h.tags.setVisibility(tags.isEmpty()||mode==MODE_GRID_SMALL?View.GONE:View.VISIBLE);String state=availability(item);h.state.setText(state);h.state.setVisibility(mode==MODE_GRID_SMALL?View.GONE:View.VISIBLE);h.itemView.setOnClickListener(v->{if(open!=null)open.open(item);else{Intent i=new Intent(activity,UnifiedComicDetailActivity.class);i.putExtra("comicId",item.id);i.putExtra("title",item.title);i.putExtra("author",item.displayAuthor());activity.startActivity(i);}});CoverRepository.load(activity,h.cover,item,Ui.PLACEHOLDER);}
    private int coverHeight(int type){int width=activity.getResources().getDisplayMetrics().widthPixels-Ui.dp(activity,24);int span=Math.max(1,type);int cell=Math.max(Ui.dp(activity,58),width/span-Ui.dp(activity,10));return Math.max(Ui.dp(activity,86),(int)(cell*1.42f));}
    private float titleSize(int type){return type==MODE_LIST?16:type==MODE_GRID_LARGE?15:type==MODE_GRID_MEDIUM?13.5f:11.5f;}
    private float metaSize(int type){return type==MODE_LIST?12.5f:type==MODE_GRID_SMALL?10:11.5f;}
    private float tagSize(int type){return type==MODE_LIST?11.5f:type==MODE_GRID_SMALL?9.5f:10.5f;}
    private String tagLine(UnifiedCatalogStore.Entry item){if(item.tags.isEmpty())return "";StringBuilder out=new StringBuilder();int limit=mode==MODE_LIST?4:3;for(int i=0;i<item.tags.size()&&i<limit;i++){if(i>0)out.append(" · ");out.append(item.tags.get(i));}return out.toString();}
    private String availability(UnifiedCatalogStore.Entry item){List<String> values=new ArrayList<>();if(item.phoneDownloaded)values.add("手机");if(item.desktopDownloaded)values.add("电脑");if(item.remoteAvailable)values.add("云端");if(item.picaAvailable)values.add("在线");if(item.inShelf)values.add("书架");return join(values," · ");}
    private String join(List<String> values,String separator){StringBuilder out=new StringBuilder();for(String value:values){if(out.length()>0)out.append(separator);out.append(value);}return out.toString();}
    static final class Holder extends RecyclerView.ViewHolder{final ImageView cover;final TextView title,author,tags,state;Holder(View item,ImageView cover,TextView title,TextView author,TextView tags,TextView state){super(item);this.cover=cover;this.title=title;this.author=author;this.tags=tags;this.state=state;}}
}
