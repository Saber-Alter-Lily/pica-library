package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.*;
import java.util.*;
import java.util.concurrent.*;

/** Alpha7 converged shell: Alpha6 reader UX + cloud + portable shelves. No mobile Atlas. */
public class MainActivity extends Activity {
    private FrameLayout body;
    private LinearLayout nav;
    private int current, serial, columns=2;
    private String scope="desktop", sort="latest", query="", activeShelfId="";
    private SharedPreferences preferences;
    private ComicGridAdapter gridAdapter;
    private RemoteComicGridAdapter remoteGridAdapter;
    private final ExecutorService requests=Executors.newFixedThreadPool(3);
    private Future<?> pending;

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        preferences=getSharedPreferences("library-display",MODE_PRIVATE);
        columns=preferences.getInt("columns",2)==3?3:2;
        sort=preferences.getString("sort","latest");
        activeShelfId=preferences.getString("activeShelfId","");
        if(saved!=null){
            current=Math.max(0,Math.min(4,saved.getInt("tab")));
            scope=saved.getString("scope","desktop");
            query=saved.getString("query","");
            activeShelfId=saved.getString("activeShelfId",activeShelfId);
        }
        getWindow().setStatusBarColor(Ui.BG);getWindow().setNavigationBarColor(Ui.BG);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        body=new FrameLayout(this);root.addView(body,new LinearLayout.LayoutParams(-1,0,1));
        nav=new LinearLayout(this);nav.setBackgroundColor(0xfff3f1f5);root.addView(nav);
        String[] labels={"书库","书架","推荐","历史","连接"};
        for(int i=0;i<labels.length;i++){
            final int tab=i;Button b=button(labels[i],v->{current=tab;showTab();});
            nav.addView(b,new LinearLayout.LayoutParams(0,Ui.dp(this,54),1));
        }
        setContentView(root);root.requestApplyInsets();
    }

    @Override protected void onResume(){super.onResume();showTab();}
    @Override protected void onPause(){++serial;if(pending!=null)pending.cancel(true);super.onPause();}
    @Override protected void onDestroy(){
        ++serial;requests.shutdownNow();
        if(gridAdapter!=null)gridAdapter.close();if(remoteGridAdapter!=null)remoteGridAdapter.close();
        super.onDestroy();
    }
    @Override protected void onSaveInstanceState(Bundle out){
        out.putInt("tab",current);out.putString("scope",scope);out.putString("query",query);out.putString("activeShelfId",activeShelfId);super.onSaveInstanceState(out);
    }

    private boolean valid(int id){return id==serial&&!isFinishing()&&!isDestroyed();}
    private Button button(String label,View.OnClickListener action){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextSize(13);b.setTextColor(Ui.PRIMARY);b.setOnClickListener(action);return b;}
    private void showTab(){
        ++serial;if(pending!=null)pending.cancel(true);
        if(gridAdapter!=null){gridAdapter.close();gridAdapter=null;}
        if(remoteGridAdapter!=null){remoteGridAdapter.close();remoteGridAdapter=null;}
        body.removeAllViews();
        for(int i=0;i<nav.getChildCount();i++)nav.getChildAt(i).setBackgroundColor(i==current?Ui.PRIMARY_SOFT:Color.TRANSPARENT);
        if(current==0)library();else if(current==1)bookshelves();else if(current==2)recommendations();else if(current==3)history();else sources();
    }

    private LinearLayout page(String title,String subtitle,boolean scroll){
        LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setPadding(Ui.dp(this,12),Ui.dp(this,12),Ui.dp(this,12),Ui.dp(this,8));
        if(scroll){ScrollView s=new ScrollView(this);s.addView(p);body.addView(s,new FrameLayout.LayoutParams(-1,-1));}else body.addView(p,new FrameLayout.LayoutParams(-1,-1));
        p.addView(Ui.text(this,title,27,Ui.TEXT,true));p.addView(Ui.text(this,subtitle,13,Ui.MUTED,false));Ui.gap(p,this,10);return p;
    }
    private void note(LinearLayout p,String title,String text){LinearLayout card=Ui.card(this);card.addView(Ui.text(this,title,17,Ui.TEXT,true));Ui.gap(card,this,5);card.addView(Ui.text(this,text,13,Ui.MUTED,false));p.addView(card);}
    private boolean requirePair(LinearLayout p){if(BridgeStore.paired(this))return true;note(p,"先连接你的电脑","电脑书库、收藏、推荐和桌面阅读记录需要局域网连接；云端与本地缓存不依赖电脑在线。");p.addView(button("配对电脑",v->pair()));return false;}
    private void pair(){startActivity(new Intent(this,PairingActivity.class));}
    private void failure(LinearLayout p,ProgressBar loading,TextView status){loading.setVisibility(View.GONE);status.setText("读取失败：请检查当前内容来源与网络连接。");p.addView(button("重试",v->showTab()));}
    private ProgressBar loading(LinearLayout p){ProgressBar b=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);b.setIndeterminate(true);p.addView(b,new LinearLayout.LayoutParams(-1,Ui.dp(this,3)));return b;}

    private void openDesktopComic(BridgeClient.ComicItem item){
        Intent i=new Intent(this,ComicDetailActivity.class);i.putExtra("comicId",item.id);i.putExtra("title",item.title);i.putExtra("author",item.author);i.putExtra("coverPath",item.coverPath);i.putExtra("downloadedPictures",item.downloadedPictures);i.putExtra("source","desktop");startActivity(i);
    }
    private void openRemoteComic(RemoteLibraryClient.Comic item){
        Intent i=new Intent(this,ComicDetailActivity.class);i.putExtra("source","remote");i.putExtra("comicId",item.id);i.putExtra("title",item.title);i.putExtra("author",item.author);i.putExtra("coverPath",item.coverPath);i.putExtra("downloadedPictures",item.pageCount);startActivity(i);
    }

    private void library(){
        LinearLayout p=page("我的书库","电脑、WebDAV 与本地缓存共享同一套阅读器",false);
        LinearLayout actions=new LinearLayout(this);p.addView(actions);
        actions.addView(button(scope.equals("desktop")?"电脑 ✓":"电脑",v->{scope="desktop";showTab();}),new LinearLayout.LayoutParams(0,-2,1));
        actions.addView(button(scope.equals("cloud")?"云端 ✓":"云端",v->{scope="cloud";showTab();}),new LinearLayout.LayoutParams(0,-2,1));
        actions.addView(button(scope.equals("favorites")?"收藏 ✓":"收藏",v->{scope="favorites";showTab();}),new LinearLayout.LayoutParams(0,-2,1));
        actions.addView(button(columns+" 列",v->{columns=columns==2?3:2;preferences.edit().putInt("columns",columns).apply();showTab();}),new LinearLayout.LayoutParams(0,-2,1));
        EditText search=new EditText(this);search.setSingleLine(true);search.setText(query);search.setHint("搜索标题或作者");search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        search.setOnEditorActionListener((v,id,event)->{if(id==EditorInfo.IME_ACTION_SEARCH){query=v.getText().toString().trim();showTab();return true;}return false;});p.addView(search);
        LinearLayout controls=new LinearLayout(this);p.addView(controls);
        controls.addView(button(sort.equals("title")?"标题排序":"最近更新",v->{sort=sort.equals("title")?"latest":"title";preferences.edit().putString("sort",sort).apply();showTab();}),new LinearLayout.LayoutParams(0,-2,1));
        controls.addView(button(query.isEmpty()?"刷新":"清除搜索",v->{query="";showTab();}),new LinearLayout.LayoutParams(0,-2,1));
        if(scope.equals("cloud")){loadCloudLibrary(p);return;}
        if(!requirePair(p))return;
        TextView status=Ui.text(this,"正在读取电脑书库…",12,Ui.MUTED,false);p.addView(status);ProgressBar load=loading(p);
        GridView g=new GridView(this);g.setNumColumns(columns);g.setHorizontalSpacing(Ui.dp(this,8));g.setVerticalSpacing(Ui.dp(this,8));g.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,12));g.setClipToPadding(false);p.addView(g,new LinearLayout.LayoutParams(-1,0,1));
        final int id=serial;final String selectedScope=scope.equals("favorites")?"favorites":"downloaded",selectedSort=sort,text=query;
        pending=requests.submit(()->{try{
            List<BridgeClient.ComicItem> items=BridgeClient.library(this,selectedScope,300,text,selectedSort);
            runOnUiThread(()->{if(!valid(id))return;load.setVisibility(View.GONE);status.setText(items.isEmpty()?"没有匹配结果":items.size()+" 部 · Desktop 在线");gridAdapter=new ComicGridAdapter(this,items,this::openDesktopComic);g.setAdapter(gridAdapter);});
        }catch(Exception e){runOnUiThread(()->{if(valid(id))failure(p,load,status);});}});
    }

    private void loadCloudLibrary(LinearLayout p){
        if(!RemoteConfigStore.load(this).configured()){note(p,"尚未配置 WebDAV","在“连接”中配置远程存储后，可在电脑关机时直接浏览和阅读云端漫画。");p.addView(button("配置 WebDAV",v->startActivity(new Intent(this,RemoteStorageActivity.class))));return;}
        TextView status=Ui.text(this,"正在读取云端目录…",12,Ui.MUTED,false);p.addView(status);ProgressBar load=loading(p);
        GridView g=new GridView(this);g.setNumColumns(columns);g.setHorizontalSpacing(Ui.dp(this,8));g.setVerticalSpacing(Ui.dp(this,8));g.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,12));g.setClipToPadding(false);p.addView(g,new LinearLayout.LayoutParams(-1,0,1));
        final int id=serial;final String text=query.toLowerCase(Locale.ROOT),selectedSort=sort;
        pending=requests.submit(()->{try{
            RemoteLibraryClient client=new RemoteLibraryClient(this);RemoteLibraryClient.Catalog catalog=client.catalog();List<RemoteLibraryClient.Comic> items=new ArrayList<>();
            for(RemoteLibraryClient.Comic comic:catalog.comics)if(text.isEmpty()||comic.title.toLowerCase(Locale.ROOT).contains(text)||comic.author.toLowerCase(Locale.ROOT).contains(text))items.add(comic);
            if(selectedSort.equals("title"))items.sort(Comparator.comparing(c->c.title.toLowerCase(Locale.ROOT)));
            runOnUiThread(()->{if(!valid(id))return;load.setVisibility(View.GONE);status.setText("云端 · "+items.size()+" 部 · 已发布 generation");remoteGridAdapter=new RemoteComicGridAdapter(this,items,client,this::openRemoteComic);g.setAdapter(remoteGridAdapter);});
        }catch(Exception e){runOnUiThread(()->{if(!valid(id))return;load.setVisibility(View.GONE);String m=e.getMessage()==null?"未知错误":e.getMessage();status.setText(m.contains("404")||m.contains("尚未发布")?"云端书库尚未发布，请等待电脑首次同步完成":"云端读取失败："+m);p.addView(button("检查网盘设置",v->startActivity(new Intent(this,RemoteStorageActivity.class))));});}});
    }

    private void bookshelves(){
        LinearLayout p=page("书架","网页书架同步为便携元数据；具体阅读再选择云端或电脑来源",true);
        LinearLayout toolbar=new LinearLayout(this);p.addView(toolbar);toolbar.addView(button("刷新书架",v->showTab()),new LinearLayout.LayoutParams(0,-2,1));toolbar.addView(button("打开连接设置",v->{current=4;showTab();}),new LinearLayout.LayoutParams(0,-2,1));
        TextView status=Ui.text(this,"",12,Ui.MUTED,false);p.addView(status);LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);p.addView(content);
        ShelfStore.Snapshot cached=ShelfStore.load(this);renderShelves(content,status,cached,Collections.emptyMap(),"本地缓存");
        if(RemoteConfigStore.load(this).configured())refreshShelvesInto(content,status);else if(cached.shelves.isEmpty())status.setText("暂无本地书架。配置 WebDAV，并在电脑端执行一次云同步即可导入网页书架。");
    }

    private void refreshShelvesInto(LinearLayout content,TextView status){
        final int id=serial;status.setText("正在从 WebDAV 更新书架元数据…");
        pending=requests.submit(()->{try{
            RemoteLibraryClient client=new RemoteLibraryClient(this);ShelfStore.Snapshot snapshot=ShelfStore.fromRemote(client.shelves());ShelfStore.save(this,snapshot);
            Map<String,RemoteLibraryClient.Comic> remote=new HashMap<>();try{for(RemoteLibraryClient.Comic c:client.catalog().comics)remote.put(c.id,c);}catch(Exception ignored){}
            runOnUiThread(()->{if(valid(id))renderShelves(content,status,snapshot,remote,"WebDAV 已同步");});
        }catch(Exception e){runOnUiThread(()->{if(!valid(id))return;ShelfStore.Snapshot fallback=ShelfStore.load(this);renderShelves(content,status,fallback,Collections.emptyMap(),fallback.shelves.isEmpty()?"书架尚未同步到云端":"云端暂不可用 · 正在使用本地书架缓存");});}});
    }

    private void renderShelves(LinearLayout target,TextView status,ShelfStore.Snapshot snapshot,Map<String,RemoteLibraryClient.Comic> remote,String sourceLabel){
        target.removeAllViews();if(snapshot.shelves.isEmpty()){status.setText(sourceLabel+" · 暂无书架");return;}
        ShelfStore.Shelf active=null;for(ShelfStore.Shelf s:snapshot.shelves)if(s.id.equals(activeShelfId)){active=s;break;}if(active==null)active=snapshot.shelves.get(0);
        activeShelfId=active.id;preferences.edit().putString("activeShelfId",activeShelfId).apply();status.setText(sourceLabel+" · "+snapshot.shelves.size()+" 个书架 · "+active.items.size()+" 本");
        LinearLayout tabs=new LinearLayout(this);target.addView(tabs);for(ShelfStore.Shelf shelf:snapshot.shelves){Button b=button(shelf.name+(shelf.id.equals(active.id)?" ✓":""),v->{activeShelfId=shelf.id;preferences.edit().putString("activeShelfId",activeShelfId).apply();showTab();});tabs.addView(b,new LinearLayout.LayoutParams(0,-2,1));}
        Ui.gap(target,this,8);
        for(ShelfStore.Item item:active.items){
            LinearLayout card=Ui.card(this);card.addView(Ui.text(this,item.title,17,Ui.TEXT,true));card.addView(Ui.text(this,item.author,12,Ui.MUTED,false));
            RemoteLibraryClient.Comic cloud=remote.get(item.comicId);String availability=cloud!=null?"云端可读 · "+cloud.pageCount+" 页":item.downloadedPictures>0?"电脑已下载 · "+item.downloadedPictures+" 页":"仅书架元数据";card.addView(Ui.text(this,availability,12,cloud!=null?Ui.PRIMARY:Ui.MUTED,false));
            card.setOnClickListener(v->{RemoteLibraryClient.Comic currentCloud=remote.get(item.comicId);if(currentCloud!=null){openRemoteComic(currentCloud);return;}if(item.downloadedPictures>0&&BridgeStore.paired(this)){openDesktopComic(new BridgeClient.ComicItem(item.comicId,item.title,item.author,"/mobile/v1/covers/"+item.comicId,item.downloadedPictures));return;}Toast.makeText(this,"这本漫画目前只有书架元数据；同步到网盘、连接已下载的电脑，或等待后续 Pica 在线源后即可打开。",Toast.LENGTH_LONG).show();});target.addView(card);
        }
    }

    private void recommendations(){
        LinearLayout p=page("为你推荐","读取电脑 Final V3 当前缓存批次，不在手机发起生成",true);if(!requirePair(p))return;
        p.addView(button("刷新当前结果",v->showTab()));TextView status=Ui.text(this,"正在读取推荐…",13,Ui.MUTED,false);p.addView(status);ProgressBar load=loading(p);final int id=serial;
        pending=requests.submit(()->{try{BridgeClient.RecommendationBatch batch=BridgeClient.recommendationBatch(this,18);runOnUiThread(()->{if(!valid(id))return;load.setVisibility(View.GONE);status.setText(ShellPolicy.recommendationStatus(batch.source,batch.cached,batch.batchIndex,batch.maxVisibleBatches));if(batch.items.isEmpty()){note(p,"暂无当前批次","请先在电脑网页端生成推荐，再刷新这里。手机不会主动创建推荐轮次。");return;}for(BridgeClient.RecommendationItem r:batch.items){LinearLayout card=Ui.card(this);card.addView(Ui.text(this,r.title,17,Ui.TEXT,true));card.addView(Ui.text(this,r.author,12,Ui.MUTED,false));card.addView(Ui.text(this,r.reason,12,Ui.PRIMARY,false));card.setOnClickListener(v->{if(!r.id.isEmpty())openDesktopComic(new BridgeClient.ComicItem(r.id,r.title,r.author,"/mobile/v1/covers/"+r.id,0));});p.addView(card);}});}catch(Exception e){runOnUiThread(()->{if(valid(id))failure(p,load,status);});}});
    }

    private void history(){
        LinearLayout p=page("继续阅读","Desktop 历史与手机 source-scoped 本地进度并存",true);
        if(!BridgeStore.paired(this)){note(p,"电脑历史暂不可用","云端漫画的阅读位置已经保存在手机本地；完整跨来源历史列表将在 portable reading state 接入后统一显示。");return;}
        p.addView(button("刷新阅读记录",v->showTab()));TextView status=Ui.text(this,"正在读取记录…",13,Ui.MUTED,false);p.addView(status);ProgressBar load=loading(p);final int id=serial;
        pending=requests.submit(()->{try{List<BridgeClient.RecentItem> items=BridgeClient.recent(this,80);runOnUiThread(()->{if(!valid(id))return;load.setVisibility(View.GONE);status.setText(items.size()+" 条 Desktop 阅读记录");if(items.isEmpty())note(p,"还没有阅读记录","从书库打开已下载漫画开始阅读。");for(BridgeClient.RecentItem r:items){LinearLayout card=Ui.card(this);card.addView(Ui.text(this,r.comic.title,18,Ui.TEXT,true));card.addView(Ui.text(this,r.episodeTitle+" · 第 "+(r.pageIndex+1)+" 页",13,Ui.PRIMARY,false));card.addView(Ui.text(this,r.comic.author,12,Ui.MUTED,false));card.addView(button("继续阅读",v->{Intent intent=new Intent(this,ReaderActivity.class);intent.putExtra("comicId",r.comic.id);intent.putExtra("title",r.comic.title);intent.putExtra("episodeId",r.episodeId);intent.putExtra("source","desktop");startActivity(intent);}));p.addView(card);}});}catch(Exception e){runOnUiThread(()->{if(valid(id))failure(p,load,status);});}});
    }

    private void sources(){
        LinearLayout p=page("连接与设置","来源、缓存与阅读工具分开管理",true);
        LinearLayout desktop=Ui.card(this);desktop.addView(Ui.text(this,"局域网电脑",18,Ui.TEXT,true));TextView state=Ui.text(this,BridgeStore.paired(this)?"已配对 · 正在检查连接":"尚未配对",13,Ui.MUTED,false);desktop.addView(state);if(BridgeStore.paired(this))desktop.addView(Ui.text(this,BridgeStore.serverName(this),13,Ui.MUTED,false));desktop.addView(button(BridgeStore.paired(this)?"管理电脑连接":"配对电脑",v->pair()));p.addView(desktop);
        if(BridgeStore.paired(this)){final int id=serial;pending=requests.submit(()->{try{BridgeClient.device(this);runOnUiThread(()->{if(valid(id))state.setText("电脑在线 · 可读取本地书库");});}catch(Exception e){runOnUiThread(()->{if(valid(id))state.setText("已配对 · 电脑当前不可达");});}});}
        RemoteConfigStore.Config remote=RemoteConfigStore.load(this);LinearLayout cloud=Ui.card(this);cloud.addView(Ui.text(this,"WebDAV 云端",18,Ui.TEXT,true));cloud.addView(Ui.text(this,remote.configured()?"已配置 · "+remote.root:"尚未配置",13,Ui.MUTED,false));cloud.addView(button(remote.configured()?"管理 WebDAV":"配置 WebDAV",v->startActivity(new Intent(this,RemoteStorageActivity.class))));p.addView(cloud);
        LinearLayout cache=Ui.card(this);cache.addView(Ui.text(this,"本地阅读缓存",18,Ui.TEXT,true));TextView cacheState=Ui.text(this,"已缓存 "+formatBytes(ReaderImages.cacheBytes(this))+" · 上限约 1 GB",13,Ui.MUTED,false);cache.addView(cacheState);cache.addView(Ui.text(this,"从 WebDAV 或未来 Pica 在线源看过的页面会保存在手机本地；再次阅读优先走本地缓存。",12,Ui.MUTED,false));cache.addView(button("清除阅读缓存",v->{ReaderImages.clearCache(this);cacheState.setText("已缓存 0 B · 上限约 1 GB");}));p.addView(cache);
        note(p,"阅读设置","打开漫画后可切换横向左→右、横向右→左、纵向连续阅读，以及屏幕常亮。阅读模式会保存。\n所有来源使用同一套 Alpha6 成熟 Reader。");
        note(p,"关于","Pica Library Android "+getVersion()+"\n手机端不再包含图鉴。网页端 Taste Chronicle 保留。不要把局域网 Bridge 直接映射到公网。");
    }

    private String formatBytes(long value){if(value<1024)return value+" B";if(value<1024L*1024)return String.format(Locale.ROOT,"%.1f KB",value/1024.0);if(value<1024L*1024*1024)return String.format(Locale.ROOT,"%.1f MB",value/1024.0/1024.0);return String.format(Locale.ROOT,"%.2f GB",value/1024.0/1024.0/1024.0);}
    private String getVersion(){try{return getPackageManager().getPackageInfo(getPackageName(),0).versionName;}catch(Exception e){return "预览版";}}
}
