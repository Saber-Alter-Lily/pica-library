package com.picalibrary.android;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.util.LruCache;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class ComicGridAdapter extends BaseAdapter {
    interface Listener { void onComic(BridgeClient.ComicItem item); }
    private final Activity activity;
    private final List<BridgeClient.ComicItem> items;
    private final Listener listener;
    private final ExecutorService pool=Executors.newFixedThreadPool(4);
    private final LruCache<String, Bitmap> cache=new LruCache<String, Bitmap>(24*1024*1024){
        @Override protected int sizeOf(String key, Bitmap value){return value.getByteCount();}
    };

    ComicGridAdapter(Activity activity, List<BridgeClient.ComicItem> items, Listener listener){
        this.activity=activity;this.items=items;this.listener=listener;
    }

    @Override public int getCount(){return items.size();}
    @Override public BridgeClient.ComicItem getItem(int position){return items.get(position);}
    @Override public long getItemId(int position){return position;}

    @Override public View getView(int position, View convertView, ViewGroup parent){
        Holder h;
        if(convertView==null){
            LinearLayout root=new LinearLayout(activity);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(Ui.dp(activity,6),Ui.dp(activity,6),Ui.dp(activity,6),Ui.dp(activity,10));
            root.setBackground(Ui.rounded(Color.WHITE,16,activity));
            ImageView cover=new ImageView(activity);cover.setScaleType(ImageView.ScaleType.CENTER_CROP);cover.setBackgroundColor(0xffebe8ef);
            root.addView(cover,new LinearLayout.LayoutParams(-1,Ui.dp(activity,220)));
            TextView title=Ui.text(activity,"",15,Ui.TEXT,true);title.setMaxLines(2);title.setPadding(0,Ui.dp(activity,8),0,0);root.addView(title);
            TextView meta=Ui.text(activity,"",12,Ui.MUTED,false);meta.setMaxLines(1);root.addView(meta);
            h=new Holder(root,cover,title,meta);root.setTag(h);convertView=root;
        }else h=(Holder)convertView.getTag();
        BridgeClient.ComicItem item=getItem(position);
        h.title.setText(item.title);
        h.meta.setText(item.author+" · 已下载 "+item.downloadedPictures+" 页");
        h.cover.setTag(item.id);
        Bitmap cached=cache.get(item.id);
        if(cached!=null)h.cover.setImageBitmap(cached);else{
            h.cover.setImageDrawable(null);
            pool.submit(()->{try{
                Bitmap b=BridgeClient.bitmap(activity,item.coverPath);cache.put(item.id,b);
                activity.runOnUiThread(()->{if(item.id.equals(h.cover.getTag()))h.cover.setImageBitmap(b);});
            }catch(Exception ignored){}});
        }
        convertView.setOnClickListener(v->listener.onComic(item));
        return convertView;
    }

    void close(){pool.shutdownNow();}

    private static final class Holder{
        final LinearLayout root;final ImageView cover;final TextView title,meta;
        Holder(LinearLayout root,ImageView cover,TextView title,TextView meta){this.root=root;this.cover=cover;this.title=title;this.meta=meta;}
    }
}
