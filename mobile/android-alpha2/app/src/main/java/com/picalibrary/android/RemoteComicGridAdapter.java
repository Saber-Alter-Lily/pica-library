package com.picalibrary.android;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class RemoteComicGridAdapter extends BaseAdapter {
    interface Click {void open(RemoteLibraryClient.Comic comic);}
    private final Activity activity;
    private final List<RemoteLibraryClient.Comic> items;
    private final RemoteLibraryClient client;
    private final Click click;
    private final ExecutorService pool=Executors.newFixedThreadPool(4);
    private final Map<String,Bitmap> cache=new ConcurrentHashMap<>();

    RemoteComicGridAdapter(Activity activity,List<RemoteLibraryClient.Comic> items,RemoteLibraryClient client,Click click){this.activity=activity;this.items=items;this.client=client;this.click=click;}
    public int getCount(){return items.size();}
    public Object getItem(int position){return items.get(position);}
    public long getItemId(int position){return position;}
    public View getView(int position,View reuse,ViewGroup parent){
        LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);card.setPadding(Ui.dp(activity,4),Ui.dp(activity,4),Ui.dp(activity,4),Ui.dp(activity,7));RemoteLibraryClient.Comic comic=items.get(position);
        ImageView cover=new ImageView(activity);cover.setScaleType(ImageView.ScaleType.CENTER_CROP);cover.setImageDrawable(new ColorDrawable(0xffebe8ef));card.addView(cover,new LinearLayout.LayoutParams(-1,Ui.dp(activity,220)));
        TextView title=Ui.text(activity,comic.title,14,Ui.TEXT,true);title.setMaxLines(2);card.addView(title);card.addView(Ui.text(activity,comic.author+" · "+comic.pageCount+" 页",11,Ui.MUTED,false));card.setOnClickListener(v->click.open(comic));
        if(comic.coverPath!=null&&!comic.coverPath.isEmpty())load(cover,comic.coverPath);return card;
    }
    private void load(ImageView view,String path){view.setTag(path);Bitmap hit=cache.get(path);if(hit!=null){view.setImageBitmap(hit);return;}pool.submit(()->{try{Bitmap bitmap=client.bitmap(path);cache.put(path,bitmap);activity.runOnUiThread(()->{if(path.equals(view.getTag()))view.setImageBitmap(bitmap);});}catch(Exception ignored){}});}
    void close(){pool.shutdownNow();cache.clear();}
}
