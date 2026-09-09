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

/** Alpha7 converged shell: one mobile library, mature reader, cloud and portable state. */
public class MainActivity extends Activity {
    private static final class HistoryItem {
        final String comicId,title,author,episodeId,episodeTitle,updatedAt;
        final int episodeOrder,pageIndex;
        HistoryItem(String comicId,String title,String author,String episodeId,String episodeTitle,int episodeOrder,int pageIndex,String updatedAt){this.comicId=comicId;this.title=title;this.author=author;this.episodeId=episodeId;this.episodeTitle=episodeTitle;this.episodeOrder=episodeOrder;this.pageIndex=pageIndex;this.updatedAt=updatedAt;}
    }

    private FrameLayout body;
    private LinearLayout nav;
    private int current,serial,columns=2;
    private String query="",activeShelfId="";
    private SharedPreferences preferences;
    private UnifiedLibraryFilter.Spec librarySpec;
    private UnifiedCatalogStore.Snapshot unifiedSnapshot=new UnifiedCatalogStore.Snapshot();
    private UnifiedLibraryFilter.Facets unifiedFacets=new UnifiedLibraryFilter.Facets(new ArrayList<>(),new ArrayList<>(),new ArrayList<>());
    private UnifiedComicGridAdapter unifiedGridAdapter;
    private final ExecutorService requests=Executors.newFixedThreadPool(4);
    private Future<?> pending;

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);preferences=getSharedPreferences("library-display",MODE_PRIVATE);columns=preferences.getInt("columns",2)==3?3:2;activeShelfId=preferences.getString("activeShelfId","");librarySpec=UnifiedFilterStore.load(preferences);
        if(saved!=null){current=Math.max(0,Math.min(4,saved.getInt("tab")));query=saved.getString("query","");activeShelfId=saved.getString("activeShelfId",activeShelfId);}
        getWindow().setStatusBarColor(Ui.BG);getWindow().setNavigationBarColor(Ui.BG);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        body=new FrameLayout(this);root.addView(body,new LinearLayout.LayoutParams(-1,0,1));nav=new LinearLayout(this);nav.setBackgroundColor(0xfff3f1f5);root.addView(nav);
        String[] labels={"书库","书架","推荐","历史","连接"};for(int i=0;i<labels.length;i++){final int tab=i;Button b=button(labels[i],v->{current=tab;showTab();});nav.addView(b,new LinearLayout.LayoutParams(0,Ui.dp(this,54),1));}
        setContentView(root);root.requestApplyInsets();
    }

    @Override protected void onResume(){super.onResume();showTab();}
    @Override protected void onPause(){++serial;if(pending!=null)pending.cancel(true);super.onPause();}
    @Override protected void onDestroy(){++serial;requests.shutdownNow();if(unifiedGridAdapter!=null)unifiedGridAdapter.close();super.onDestroy();}
    @Override protected void onSaveInstanceState(Bundle out){out.putInt("tab",current);out.putString("query",query);out.putString("activeShelfId",activeShelfId);super.onSaveInstanceState(out);}

    private boolean valid(int id){return id==serial&&!isFinishing()&&!isDestroyed();}
    private Button button(String label,View.OnClickListener action){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextSize(13);b.setTextColor(Ui.PRIMARY);b.setOnClickListener(action);return b;}
    private void showTab(){++serial;if(pending!=null)pending.cancel(true);if(unifiedGridAdapter!=null){unifiedGridAdapter.close();unifiedGridAdapter=null;}body.removeAllViews();for(int i=0;i<nav.getChildCount();i++)nav.getChildAt(i).setBackgroundColor(i==current?Ui.PRIMARY_SOFT:Color.TRANSPARENT);if(current==0)library();else if(current==1)bookshelves();else if(current==2)recommendations();else if(current==3)history();else sources();}

    private LinearLayout page(String title,String subtitle,boolean scroll){LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setPadding(Ui.dp(this,12),Ui.dp(this,12),Ui.dp(this,12),Ui.dp(this,8));if(scroll){ScrollView s=new ScrollView(this);s.addView(p);body.addView(s,new FrameLayout.LayoutParams(-1,-1));}else body.addView(p,new FrameLayout.LayoutParams(-1,-1));p.addView(Ui.text(this,title,27,Ui.TEXT,true));p.addView(Ui.text(this,subtitle,13,Ui.MUTED,false));Ui.gap(p,this,10);return p;}
    private void note(LinearLayout p,String title,String text){LinearLayout card=Ui.card(this);card.addView(Ui.text(this,title,17,Ui.TEXT,true));Ui.gap(card,this,5);card.addView(Ui.text(this,text,13,Ui.MUTED,false));p.addView(card);}
    private boolean requirePair(LinearLayout p){if(BridgeStore.paired(this))return true;note(p,"先连接你的电脑","推荐和桌面阅读记录需要局域网连接；统一书库会继续显示手机已经缓存的目录、收藏、书架和 WebDAV 内容。");p.addView(button("配对电脑",v->pair()));return false;}
    private void pair(){startActivity(new Intent(this,PairingActivity.class));}
    private ProgressBar loading(LinearLayout p){ProgressBar b=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);b.setIndeterminate(true);p.addView(b,new LinearLayout.LayoutParams(-1,Ui.dp(this,3)));return b;}
    private GridView grid(LinearLayout p){GridView g=new GridView(this);g.setNumColumns(columns);g.setHorizontalSpacing(Ui.dp(this,8));g.setVerticalSpacing(Ui.dp(this,8));g.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,12));g.setClipToPadding(false);p.addView(g,new LinearLayout.LayoutParams(-1,0,1));return g;}

    private void openDesktopComic(BridgeClient.ComicItem item){Intent i=new Intent(this,ComicDetailActivity.class);i.putExtra("comicId",item.id);i.putExtra("title",item.title);i.putExtra("author",item.author);i.putExtra("coverPath",item.coverPath);i.putExtra("downloadedPictures",item.downloadedPictures);i.putExtra("source","desktop");startActivity(i);}
    private void openRemoteComic(RemoteLibraryClient.Comic item){Intent i=new Intent(this,ComicDetailActivity.class);i.putExtra("source","remote");i.putExtra("comicId",item.id);i.putExtra("title",item.title);i.putExtra("author",item.author);i.putExtra("coverPath",item.coverPath);i.putExtra("downloadedPictures",item.pageCount);startActivity(i);}
    private void openFavoriteComic(BridgeClient.ComicItem item){requests.submit(()->{if(RemoteConfigStore.load(this).configured())try{RemoteLibraryClient client=new RemoteLibraryClient(this);for(RemoteLibraryClient.Comic comic:client.catalog().comics)if(comic.id.equals(item.id)){runOnUiThread(()->openRemoteComic(comic));return;}}catch(Exception ignored){}if(BridgeStore.paired(this))try{BridgeClient.device(this);runOnUiThread(()->openDesktopComic(item));return;}catch(Exception ignored){}runOnUiThread(()->Toast.makeText(this,"这本漫画当前只有便携元数据。同步到 WebDAV 或连接已下载它的电脑后即可打开。",Toast.LENGTH_LONG).show());});}

    private void openUnifiedComic(UnifiedCatalogStore.Entry entry){
        requests.submit(()->{
            for(UnifiedSourceResolver.Source source:UnifiedSourceResolver.candidates(this,entry)){
                if(source==UnifiedSourceResolver.Source.PHONE_DOWNLOAD)continue;
                if(source==UnifiedSourceResolver.Source.DESKTOP){try{BridgeClient.device(this);BridgeClient.ComicItem item=new BridgeClient.ComicItem(entry.id,entry.title,entry.displayAuthor(),entry.desktopCoverPath.isEmpty()?"/mobile/v1/covers/"+entry.id:entry.desktopCoverPath,entry.desktopDownloadedPictures);runOnUiThread(()->openDesktopComic(item));return;}catch(Exception ignored){}}
                if(source==UnifiedSourceResolver.Source.WEBDAV){try{RemoteLibraryClient client=new RemoteLibraryClient(this);RemoteLibraryClient.Comic comic=null;if(!entry.remoteManifestPath.isEmpty())comic=new RemoteLibraryClient.Comic(entry.id,entry.title,entry.displayAuthor(),entry.remoteManifestPath,entry.remoteCoverPath,entry.remoteEpisodeCount,entry.remotePageCount);else for(RemoteLibraryClient.Comic value:client.catalog().comics)if(value.id.equals(entry.id)){comic=value;break;}if(comic!=null){RemoteLibraryClient.Comic target=comic;runOnUiThread(()->openRemoteComic(target));return;}}catch(Exception ignored){}}
            }
            runOnUiThread(()->Toast.makeText(this,"当前没有可读取正文的来源。电脑离线时可继续使用 WebDAV；Pica 在线源将在后续版本接入。",Toast.LENGTH_LONG).show());
        });
    }

    private void library(){
        LinearLayout p=page("我的书库","漫画只显示一次；电脑、WebDAV、收藏和书架作为属性合并",false);
        EditText search=new EditText(this);search.setSingleLine(true);search.setText(query);search.setHint("搜索标题 / 作者 / 标签 / 分类");search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);search.setOnEditorActionListener((v,id,event)->{if(id==EditorInfo.IME_ACTION_SEARCH){query=v.getText().toString().trim();showTab();return true;}return false;});p.addView(search);
        LinearLayout controls=new LinearLayout(this);p.addView(controls);controls.addView(button("筛选与排序"+(librarySpec.activeCount()>0?" ("+librarySpec.activeCount()+")":""),v->UnifiedLibraryFilterDialog.show(this,librarySpec,unifiedFacets,next->{librarySpec=next;UnifiedFilterStore.save(preferences,next);showTab();})),new LinearLayout.LayoutParams(0,-2,1));controls.addView(button("刷新",v->showTab()),new LinearLayout.LayoutParams(0,-2,1));controls.addView(button(columns+" 列",v->{columns=columns==2?3:2;preferences.edit().putInt("columns",columns).apply();showTab();}),new LinearLayout.LayoutParams(0,-2,1));
        TextView status=Ui.text(this,"正在读取本地统一目录…",12,Ui.MUTED,false);p.addView(status);GridView g=grid(p);
        unifiedSnapshot=UnifiedCatalogStore.reconcileLocalReferences(this);renderUnifiedLibrary(g,status,unifiedSnapshot,"本地目录");refreshUnifiedCatalog(g,status);
    }

    private void renderUnifiedLibrary(GridView grid,TextView status,UnifiedCatalogStore.Snapshot snapshot,String sourceLabel){
        unifiedSnapshot=snapshot;List<UnifiedCatalogStore.Entry> all=snapshot.entries();unifiedFacets=UnifiedLibraryFilter.facets(all);UnifiedLibraryFilter.Spec applied=librarySpec.copy();applied.text=query;List<UnifiedCatalogStore.Entry> visible=UnifiedLibraryFilter.apply(all,applied);if(unifiedGridAdapter!=null)unifiedGridAdapter.close();unifiedGridAdapter=new UnifiedComicGridAdapter(this,visible,this::openUnifiedComic);grid.setAdapter(unifiedGridAdapter);String filter=(query.isEmpty()&&librarySpec.activeCount()==0)?"":" · 已筛选";status.setText(visible.size()+" / "+all.size()+" 部 · "+sourceLabel+filter);
    }

    private void refreshUnifiedCatalog(GridView grid,TextView status){
        final int id=serial;final boolean hadLocal=!unifiedSnapshot.entries().isEmpty();status.setText(hadLocal?status.getText()+" · 后台刷新中":"正在建立统一目录…");
        pending=requests.submit(()->{
            List<String> ok=new ArrayList<>(),problems=new ArrayList<>();
            if(BridgeStore.paired(this)){
                try{BridgeClient.device(this);UnifiedCatalogStore.refreshDesktop(this);ok.add("Desktop");try{FavoriteCacheStore.syncFromDesktop(this,false,null);}catch(Exception ignored){}}catch(Exception e){problems.add("电脑不可达");}
            }
            if(RemoteConfigStore.load(this).configured()){
                try{
                    RemoteLibraryClient client=new RemoteLibraryClient(this);UnifiedCatalogStore.refreshRemote(this);ok.add("WebDAV");
                    try{FavoriteCacheStore.Snapshot favorites=FavoriteCacheStore.fromRemote(client.favorites());FavoriteCacheStore.save(this,favorites.items,false);}catch(Exception ignored){}
                    try{ShelfStore.Snapshot shelves=ShelfStore.fromRemote(client.shelves());ShelfStore.save(this,shelves);}catch(Exception ignored){}
                }catch(Exception e){problems.add("云端暂不可用");}
            }
            UnifiedCatalogStore.Snapshot latest=UnifiedCatalogStore.reconcileLocalReferences(this);String label=ok.isEmpty()?"本地缓存":join(ok," + ")+" 已刷新";if(!problems.isEmpty())label+=" · "+join(problems," / ");final String finalLabel=label;runOnUiThread(()->{if(valid(id))renderUnifiedLibrary(grid,status,latest,finalLabel);});
        });
    }

    private String join(List<String> values,String separator){StringBuilder out=new StringBuilder();for(String value:values){if(out.length()>0)out.append(separator);out.append(value);}return out.toString();}

    private void bookshelves(){
        LinearLayout p=page("书架","网页书架同步为便携元数据；具体阅读由统一来源解析器选择",true);LinearLayout toolbar=new LinearLayout(this);p.addView(toolbar);toolbar.addView(button("刷新书架",v->showTab()),new LinearLayout.LayoutParams(0,-2,1));toolbar.addView(button("打开连接设置",v->{current=4;showTab();}),new LinearLayout.LayoutParams(0,-2,1));TextView status=Ui.text(this,"",12,Ui.MUTED,false);p.addView(status);LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);p.addView(content);ShelfStore.Snapshot cached=ShelfStore.load(this);renderShelves(content,status,cached,Collections.emptyMap(),"本地缓存");if(RemoteConfigStore.load(this).configured())refreshShelvesInto(content,status);else if(cached.shelves.isEmpty())status.setText("暂无本地书架。配置 WebDAV，并在电脑端执行一次云同步即可导入网页书架。");
    }

    private void refreshShelvesInto(LinearLayout content,TextView status){final int id=serial;status.setText("正在从 WebDAV 更新书架元数据…");pending=requests.submit(()->{try{RemoteLibraryClient client=new RemoteLibraryClient(this);ShelfStore.Snapshot snapshot=ShelfStore.fromRemote(client.shelves());ShelfStore.save(this,snapshot);UnifiedCatalogStore.reconcileLocalReferences(this);Map<String,RemoteLibraryClient.Comic> remote=new HashMap<>();try{for(RemoteLibraryClient.Comic c:client.catalog().comics)remote.put(c.id,c);}catch(Exception ignored){}runOnUiThread(()->{if(valid(id))renderShelves(content,status,snapshot,remote,"WebDAV 已同步");});}catch(Exception e){runOnUiThread(()->{if(!valid(id))return;ShelfStore.Snapshot fallback=ShelfStore.load(this);renderShelves(content,status,fallback,Collections.emptyMap(),fallback.shelves.isEmpty()?"书架尚未同步到云端":"云端暂不可用 · 正在使用本地书架缓存");});}});}

    private void renderShelves(LinearLayout target,TextView status,ShelfStore.Snapshot snapshot,Map<String,RemoteLibraryClient.Comic> remote,String sourceLabel){
        target.removeAllViews();if(snapshot.shelves.isEmpty()){status.setText(sourceLabel+" · 暂无书架");return;}ShelfStore.Shelf active=null;for(ShelfStore.Shelf s:snapshot.shelves)if(s.id.equals(activeShelfId)){active=s;break;}if(active==null)active=snapshot.shelves.get(0);activeShelfId=active.id;preferences.edit().putString("activeShelfId",activeShelfId).apply();status.setText(sourceLabel+" · "+snapshot.shelves.size()+" 个书架 · "+active.items.size()+" 本");LinearLayout tabs=new LinearLayout(this);target.addView(tabs);for(ShelfStore.Shelf shelf:snapshot.shelves){Button b=button(shelf.name+(shelf.id.equals(active.id)?" ✓":""),v->{activeShelfId=shelf.id;preferences.edit().putString("activeShelfId",activeShelfId).apply();showTab();});tabs.addView(b,new LinearLayout.LayoutParams(0,-2,1));}Ui.gap(target,this,8);
        for(ShelfStore.Item item:active.items){LinearLayout card=Ui.card(this);card.addView(Ui.text(this,item.title,17,Ui.TEXT,true));card.addView(Ui.text(this,item.author,12,Ui.MUTED,false));RemoteLibraryClient.Comic cloud=remote.get(item.comicId);String availability=cloud!=null?"云端可读 · "+cloud.pageCount+" 页":item.downloadedPictures>0?"电脑已下载 · "+item.downloadedPictures+" 页":"仅书架元数据";card.addView(Ui.text(this,availability,12,cloud!=null?Ui.PRIMARY:Ui.MUTED,false));card.setOnClickListener(v->{RemoteLibraryClient.Comic currentCloud=remote.get(item.comicId);if(currentCloud!=null){openRemoteComic(currentCloud);return;}if(item.downloadedPictures>0&&BridgeStore.paired(this)){openFavoriteComic(new BridgeClient.ComicItem(item.comicId,item.title,item.author,"/mobile/v1/covers/"+item.comicId,item.downloadedPictures));return;}Toast.makeText(this,"这本漫画目前只有书架元数据。",Toast.LENGTH_LONG).show();});target.addView(card);}
    }

    private void recommendations(){LinearLayout p=page("为你推荐","读取电脑 Final V3 当前缓存批次，不在手机发起生成",true);if(!requirePair(p))return;p.addView(button("刷新当前结果",v->showTab()));TextView status=Ui.text(this,"正在读取推荐…",13,Ui.MUTED,false);p.addView(status);ProgressBar load=loading(p);final int id=serial;pending=requests.submit(()->{try{BridgeClient.RecommendationBatch batch=BridgeClient.recommendationBatch(this,18);runOnUiThread(()->{if(!valid(id))return;load.setVisibility(View.GONE);status.setText(ShellPolicy.recommendationStatus(batch.source,batch.cached,batch.batchIndex,batch.maxVisibleBatches));if(batch.items.isEmpty()){note(p,"暂无当前批次","请先在电脑网页端生成推荐，再刷新这里。手机不会主动创建推荐轮次。");return;}for(BridgeClient.RecommendationItem r:batch.items){LinearLayout card=Ui.card(this);card.addView(Ui.text(this,r.title,17,Ui.TEXT,true));card.addView(Ui.text(this,r.author,12,Ui.MUTED,false));card.addView(Ui.text(this,r.reason,12,Ui.PRIMARY,false));card.setOnClickListener(v->{if(!r.id.isEmpty())openFavoriteComic(new BridgeClient.ComicItem(r.id,r.title,r.author,"/mobile/v1/covers/"+r.id,0));});p.addView(card);}});}catch(Exception e){runOnUiThread(()->{if(valid(id)){load.setVisibility(View.GONE);status.setText("推荐读取失败：请检查电脑连接");}});}});}

    private void history(){
        LinearLayout p=page("继续阅读","WebDAV 便携进度 + Desktop 历史按更新时间合并",true);p.addView(button("刷新阅读记录",v->showTab()));TextView status=Ui.text(this,"正在合并阅读记录…",13,Ui.MUTED,false);p.addView(status);ProgressBar load=loading(p);final int id=serial;
        pending=requests.submit(()->{Map<String,HistoryItem> merged=new HashMap<>();Map<String,RemoteLibraryClient.Comic> cloud=new HashMap<>();boolean remoteOk=false,desktopOk=false;if(RemoteConfigStore.load(this).configured())try{RemoteLibraryClient client=new RemoteLibraryClient(this);try{for(RemoteLibraryClient.Comic c:client.catalog().comics)cloud.put(c.id,c);}catch(Exception ignored){}for(RemoteLibraryClient.ReadingEntry e:client.readingEntries()){RemoteLibraryClient.Comic c=cloud.get(e.comicId);String title=e.comicTitle.isEmpty()?(c==null?"漫画":c.title):e.comicTitle;String author=e.author.isEmpty()?(c==null?"未知作者":c.author):e.author;String episode=e.episodeTitle.isEmpty()?"章节":e.episodeTitle;HistoryItem item=new HistoryItem(e.comicId,title,author,e.episodeId,episode,e.episodeOrder,e.pageIndex,e.updatedAt);merged.put(e.comicId+"\n"+e.episodeId,item);}remoteOk=true;}catch(Exception ignored){}if(BridgeStore.paired(this))try{for(BridgeClient.RecentItem r:BridgeClient.recent(this,100)){String key=r.comic.id+"\n"+r.episodeId;HistoryItem prior=merged.get(key);HistoryItem item=new HistoryItem(r.comic.id,r.comic.title,r.comic.author,r.episodeId,r.episodeTitle,r.episodeOrder,r.pageIndex,r.updatedAt);if(prior==null||item.updatedAt.compareTo(prior.updatedAt)>0)merged.put(key,item);}desktopOk=true;}catch(Exception ignored){}List<HistoryItem> items=new ArrayList<>(merged.values());items.sort((a,b)->b.updatedAt.compareTo(a.updatedAt));if(items.size()>100)items=new ArrayList<>(items.subList(0,100));final List<HistoryItem> visible=items;final boolean remoteAvailable=remoteOk,desktopAvailable=desktopOk;final Map<String,RemoteLibraryClient.Comic> cloudSnapshot=new HashMap<>(cloud);runOnUiThread(()->{if(!valid(id))return;load.setVisibility(View.GONE);String label=(remoteAvailable?"WebDAV":"")+(remoteAvailable&&desktopAvailable?" + ":"")+(desktopAvailable?"Desktop":"");status.setText(visible.size()+" 条阅读记录"+(label.isEmpty()?" · 当前仅有本地书签":" · "+label));if(visible.isEmpty()){note(p,"还没有可合并的阅读记录","云端阅读会自动写入便携进度；Desktop 进度会在云同步时合并到 WebDAV。");return;}for(HistoryItem h:visible){LinearLayout card=Ui.card(this);card.addView(Ui.text(this,h.title,18,Ui.TEXT,true));card.addView(Ui.text(this,h.episodeTitle+" · 第 "+(h.pageIndex+1)+" 页",13,Ui.PRIMARY,false));card.addView(Ui.text(this,h.author,12,Ui.MUTED,false));RemoteLibraryClient.Comic cloudComic=cloudSnapshot.get(h.comicId);card.addView(Ui.text(this,cloudComic!=null?"云端可继续":"需要电脑在线",11,Ui.MUTED,false));card.addView(button("继续阅读",v->{RemoteLibraryClient.Comic c=cloudSnapshot.get(h.comicId);if(c!=null){Intent intent=new Intent(this,ReaderActivity.class);intent.putExtra("comicId",h.comicId);intent.putExtra("title",h.title);intent.putExtra("episodeId",h.episodeId);intent.putExtra("source","remote");startActivity(intent);return;}if(BridgeStore.paired(this)){Intent intent=new Intent(this,ReaderActivity.class);intent.putExtra("comicId",h.comicId);intent.putExtra("title",h.title);intent.putExtra("episodeId",h.episodeId);intent.putExtra("source","desktop");startActivity(intent);return;}Toast.makeText(this,"该记录当前没有可用正文来源。",Toast.LENGTH_LONG).show();}));p.addView(card);}});});
    }

    private void syncFavoriteCache(TextView state,boolean covers){if(!BridgeStore.paired(this)){state.setText("请先配对电脑");pair();return;}state.setText(covers?"正在更新收藏并缓存封面…":"正在更新收藏元数据…");requests.submit(()->{try{FavoriteCacheStore.Snapshot snapshot=FavoriteCacheStore.syncFromDesktop(this,covers,(done,total,phase)->runOnUiThread(()->state.setText(phase+(total>0?" · "+done+" / "+total:""))));UnifiedCatalogStore.reconcileLocalReferences(this);runOnUiThread(()->state.setText("已缓存 "+snapshot.items.size()+" 本收藏 · 元数据 "+formatBytes(FavoriteCacheStore.metadataBytes(this))+" · 电脑封面缓存 "+formatBytes(ImageRepository.diskBytes(this))+(snapshot.coversPrefetched?" · 封面完整":"")));}catch(Exception e){runOnUiThread(()->state.setText("收藏缓存更新失败："+e.getMessage()));}});}

    private void sources(){
        LinearLayout p=page("连接与设置","来源负责传输，书库负责组织；两者不再混成多个书库页",true);LinearLayout desktop=Ui.card(this);desktop.addView(Ui.text(this,"局域网电脑",18,Ui.TEXT,true));TextView state=Ui.text(this,BridgeStore.paired(this)?"已配对 · 正在检查连接":"尚未配对",13,Ui.MUTED,false);desktop.addView(state);if(BridgeStore.paired(this))desktop.addView(Ui.text(this,BridgeStore.serverName(this),13,Ui.MUTED,false));desktop.addView(button(BridgeStore.paired(this)?"管理电脑连接":"配对电脑",v->pair()));p.addView(desktop);if(BridgeStore.paired(this)){final int id=serial;pending=requests.submit(()->{try{BridgeClient.device(this);runOnUiThread(()->{if(valid(id))state.setText("电脑在线 · 可作为阅读来源");});}catch(Exception e){runOnUiThread(()->{if(valid(id))state.setText("已配对 · 电脑当前不可达");});}});}
        FavoriteCacheStore.Snapshot favoriteSnapshot=FavoriteCacheStore.load(this);LinearLayout favorites=Ui.card(this);favorites.addView(Ui.text(this,"手机收藏缓存",18,Ui.TEXT,true));TextView favoriteState=Ui.text(this,favoriteSnapshot.items.isEmpty()?"尚未导入":"已缓存 "+favoriteSnapshot.items.size()+" 本 · 元数据 "+formatBytes(FavoriteCacheStore.metadataBytes(this))+" · 电脑封面缓存 "+formatBytes(ImageRepository.diskBytes(this)),13,Ui.MUTED,false);favorites.addView(favoriteState);favorites.addView(Ui.text(this,"收藏会并入统一书库，而不是单独占一个书库来源页。",12,Ui.MUTED,false));LinearLayout favActions=new LinearLayout(this);favActions.addView(button("仅更新收藏",v->syncFavoriteCache(favoriteState,false)),new LinearLayout.LayoutParams(0,-2,1));favActions.addView(button("收藏 + 封面",v->syncFavoriteCache(favoriteState,true)),new LinearLayout.LayoutParams(0,-2,1));favorites.addView(favActions);p.addView(favorites);
        RemoteConfigStore.Config remote=RemoteConfigStore.load(this);LinearLayout cloud=Ui.card(this);cloud.addView(Ui.text(this,"WebDAV 云端",18,Ui.TEXT,true));cloud.addView(Ui.text(this,remote.configured()?"已配置 · "+remote.root:"尚未配置",13,Ui.MUTED,false));cloud.addView(Ui.text(this,"云端正文、书架、收藏和阅读进度会被统一目录引用；电脑关机时仍可直接阅读云端漫画。",12,Ui.MUTED,false));cloud.addView(button(remote.configured()?"管理 WebDAV / 刷新便携状态":"配置 WebDAV",v->startActivity(new Intent(this,RemoteStorageActivity.class))));p.addView(cloud);
        LinearLayout cache=Ui.card(this);cache.addView(Ui.text(this,"本地阅读缓存",18,Ui.TEXT,true));TextView cacheState=Ui.text(this,"已缓存 "+formatBytes(ReaderImages.cacheBytes(this))+" · 上限约 1 GB",13,Ui.MUTED,false);cache.addView(cacheState);cache.addView(Ui.text(this,"从 WebDAV 或未来 Pica 在线源看过的页面会保存在手机本地。",12,Ui.MUTED,false));cache.addView(button("清除阅读缓存",v->{ReaderImages.clearCache(this);cacheState.setText("已缓存 0 B · 上限约 1 GB");}));p.addView(cache);note(p,"阅读设置","打开漫画后可切换横向左→右、横向右→左、纵向连续阅读，以及屏幕常亮。所有来源使用同一套 Reader。");note(p,"关于","Pica Library Android "+getVersion()+"\n手机端不包含图鉴。网页端 Taste Chronicle 保留。不要把局域网 Bridge 直接映射到公网。");
    }

    private String formatBytes(long value){if(value<1024)return value+" B";if(value<1024L*1024)return String.format(Locale.ROOT,"%.1f KB",value/1024.0);if(value<1024L*1024*1024)return String.format(Locale.ROOT,"%.1f MB",value/1024.0/1024.0);return String.format(Locale.ROOT,"%.2f GB",value/1024.0/1024.0/1024.0);}
    private String getVersion(){try{return getPackageManager().getPackageInfo(getPackageName(),0).versionName;}catch(Exception e){return "预览版";}}
}
