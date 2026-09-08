package com.picalibrary.android;

import android.app.Activity;
import android.graphics.Color;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.List;

final class ComicGridAdapter extends BaseAdapter {
    interface Listener { void onComic(BridgeClient.ComicItem item); }
    private final Activity activity;
    private final List<BridgeClient.ComicItem> items;
    private final Listener listener;

    ComicGridAdapter(Activity activity, List<BridgeClient.ComicItem> items, Listener listener){
        this.activity=activity;this.items=items;this.listener=listener;
    }

    @Override public int getCount(){return items.size();}
    @Override public BridgeClient.ComicItem getItem(int position){return items.get(position);}
    @Override public long getItemId(int position){return position;}

    @Override public View getView(int position, View convertView, ViewGroup parent){
        Holder h;
        if(convertView==null){
            LinearLayout root=new LinearLayout(activity);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(Ui.dp(activity,5),Ui.dp(activity,5),Ui.dp(activity,5),Ui.dp(activity,9));
            root.setBackground(Ui.rounded(Color.WHITE,14,activity));
            ImageView cover=new ImageView(activity);cover.setScaleType(ImageView.ScaleType.CENTER_CROP);cover.setBackgroundColor(0xffebe8ef);
            root.addView(cover,new LinearLayout.LayoutParams(-1,Ui.dp(activity,218)));
            TextView title=Ui.text(activity,"",14.5f,Ui.TEXT,true);title.setMaxLines(2);title.setPadding(0,Ui.dp(activity,7),0,0);root.addView(title);
            TextView meta=Ui.text(activity,"",11.5f,Ui.MUTED,false);meta.setMaxLines(1);meta.setPadding(0,Ui.dp(activity,2),0,0);root.addView(meta);
            h=new Holder(root,cover,title,meta);root.setTag(h);convertView=root;
        }else h=(Holder)convertView.getTag();
        BridgeClient.ComicItem item=getItem(position);
        h.title.setText(item.title);
        h.meta.setText(item.author+" · "+item.downloadedPictures+" 页");
        ImageRepository.load(activity,h.cover,item.coverPath,0xffebe8ef);
        convertView.setOnClickListener(v->listener.onComic(item));
        return convertView;
    }

    void close(){}

    private static final class Holder{
        final LinearLayout root;final ImageView cover;final TextView title,meta;
        Holder(LinearLayout root,ImageView cover,TextView title,TextView meta){this.root=root;this.cover=cover;this.title=title;this.meta=meta;}
    }
}
