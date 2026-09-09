package com.picalibrary.android;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** One grid for comics merged across Desktop, WebDAV, phone and future Pica sources. */
final class UnifiedComicGridAdapter extends BaseAdapter {
    interface Click { void open(UnifiedCatalogStore.Entry entry); }
    private final Activity activity;
    private final List<UnifiedCatalogStore.Entry> items;
    private final Click click;
    private final ExecutorService pool=Executors.newFixedThreadPool(4);
    private final Map<String,Bitmap> remoteMemory=new ConcurrentHashMap<>();
    private final RemoteLibraryClient remoteClient;

    UnifiedComicGridAdapter(Activity activity,List<UnifiedCatalogStore.Entry> items,Click click){
        this.activity=activity;this.items=items;this.click=click;RemoteLibraryClient remote=null;
        try{if(RemoteConfigStore.load(activity).configured())remote=new RemoteLibraryClient(activity);}catch(Exception ignored){}
        this.remoteClient=remote;
    }

    @Override public int getCount(){return items.size();}
    @Override public UnifiedCatalogStore.Entry getItem(int position){return items.get(position);}
    @Override public long getItemId(int position){return position;}

    @Override public View getView(int position,View reuse,ViewGroup parent){
        Holder holder;
        if(reuse==null){
            LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);card.setPadding(Ui.dp(activity,5),Ui.dp(activity,5),Ui.dp(activity,5),Ui.dp(activity,9));card.setBackground(Ui.rounded(Color.WHITE,14,activity));
            ImageView cover=new ImageView(activity);cover.setScaleType(ImageView.ScaleType.CENTER_CROP);cover.setImageDrawable(new ColorDrawable(0xffebe8ef));card.addView(cover,new LinearLayout.LayoutParams(-1,Ui.dp(activity,218)));
            TextView title=Ui.text(activity,"",14.5f,Ui.TEXT,true);title.setMaxLines(2);title.setPadding(0,Ui.dp(activity,7),0,0);card.addView(title);
            TextView meta=Ui.text(activity,"",11.5f,Ui.MUTED,false);meta.setMaxLines(2);meta.setPadding(0,Ui.dp(activity,2),0,0);card.addView(meta);
            TextView tags=Ui.text(activity,"",10.5f,Ui.PRIMARY,false);tags.setMaxLines(1);tags.setPadding(0,Ui.dp(activity,3),0,0);card.addView(tags);
            holder=new Holder(card,cover,title,meta,tags);card.setTag(holder);reuse=card;
        }else holder=(Holder)reuse.getTag();
        UnifiedCatalogStore.Entry item=getItem(position);holder.title.setText(item.title);holder.meta.setText(item.displayAuthor()+" · "+availability(item));String tagLine=tagLine(item);holder.tags.setText(tagLine);holder.tags.setVisibility(tagLine.isEmpty()?View.GONE:View.VISIBLE);reuse.setOnClickListener(v->click.open(item));loadCover(holder.cover,item);return reuse;
    }

    private String availability(UnifiedCatalogStore.Entry item){List<String> values=new ArrayList<>();if(item.phoneDownloaded)values.add("手机");if(item.desktopDownloaded)values.add("电脑");if(item.remoteAvailable)values.add("云端");if(item.picaAvailable)values.add("在线");if(values.isEmpty())values.add("仅元数据");if(item.favorite)values.add("收藏");if(item.inShelf)values.add("书架");return join(values," · ");}
    private String tagLine(UnifiedCatalogStore.Entry item){if(item.tags.isEmpty())return "";StringBuilder out=new StringBuilder();for(int i=0;i<item.tags.size()&&i<3;i++){if(i>0)out.append(" · ");out.append(item.tags.get(i));}return out.toString();}
    private String join(List<String> values,String separator){StringBuilder out=new StringBuilder();for(String value:values){if(out.length()>0)out.append(separator);out.append(value);}return out.toString();}

    private void loadCover(ImageView view,UnifiedCatalogStore.Entry item){
        String remote=item.remoteCoverPath==null?"":item.remoteCoverPath;String desktop=item.desktopCoverPath==null?"":item.desktopCoverPath;
        if(remoteClient!=null&&item.remoteAvailable&&!remote.isEmpty()){
            String key="remote:"+remote;view.setTag(key);Bitmap hit=remoteMemory.get(key);if(hit!=null){view.setImageBitmap(hit);return;}view.setImageDrawable(new ColorDrawable(0xffebe8ef));pool.submit(()->{try{Bitmap bitmap=remoteClient.bitmap(remote);remoteMemory.put(key,bitmap);activity.runOnUiThread(()->{Object tag=view.getTag();if(tag!=null&&key.equals(tag.toString()))view.setImageBitmap(bitmap);});}catch(Exception e){activity.runOnUiThread(()->{Object tag=view.getTag();if(tag!=null&&key.equals(tag.toString())&&!desktop.isEmpty())ImageRepository.load(activity,view,desktop,0xffebe8ef);});}});return;
        }
        if(!desktop.isEmpty()){ImageRepository.load(activity,view,desktop,0xffebe8ef);return;}
        view.setTag("empty:"+item.id);view.setImageDrawable(new ColorDrawable(0xffebe8ef));
    }

    void close(){pool.shutdownNow();remoteMemory.clear();}

    private static final class Holder{
        final LinearLayout root;final ImageView cover;final TextView title,meta,tags;
        Holder(LinearLayout root,ImageView cover,TextView title,TextView meta,TextView tags){this.root=root;this.cover=cover;this.title=title;this.meta=meta;this.tags=tags;}
    }
}
