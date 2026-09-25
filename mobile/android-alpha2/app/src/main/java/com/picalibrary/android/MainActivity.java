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

/** Alpha8 mobile shell: one library, native Pica, portable state and mature Reader. */
public class MainActivity extends LocaleAwareActivity {
    private static final class HistoryItem {
        final String comicId,title,author,episodeId,episodeTitle,updatedAt;
        final int episodeOrder,pageIndex;
        HistoryItem(String comicId,String title,String author,String episodeId,String episodeTitle,int episodeOrder,int pageIndex,String updatedAt){
            this.comicId=comicId;this.title=title;this.author=author;this.episodeId=episodeId;this.episodeTitle=episodeTitle;
            this.episodeOrder=episodeOrder;this.pageIndex=pageIndex;this.updatedAt=updatedAt;
        }
    }

    private static final class SettingsSummary {
        final FavoriteCacheStore.Snapshot favorites;
        final long favoriteMetadataBytes,coverBytes,downloadBytes;
        final RemoteConfigStore.Config remote;
        final PicaAccountStore.Session pica;
        final NativeRecommendationStore.Snapshot recommendation;
        final PhoneDownloadStore.Snapshot downloads;
        final StoragePolicy.Usage storage;
        SettingsSummary(
            FavoriteCacheStore.Snapshot favorites,
            long favoriteMetadataBytes,
            long coverBytes,
            RemoteConfigStore.Config remote,
            PicaAccountStore.Session pica,
            NativeRecommendationStore.Snapshot recommendation,
            PhoneDownloadStore.Snapshot downloads,
            long downloadBytes,
            StoragePolicy.Usage storage
        ){
            this.favorites=favorites;
            this.favoriteMetadataBytes=favoriteMetadataBytes;
            this.coverBytes=coverBytes;
            this.remote=remote;
            this.pica=pica;
            this.recommendation=recommendation;
            this.downloads=downloads;
            this.downloadBytes=downloadBytes;
            this.storage=storage;
        }
    }

    private FrameLayout body;
    private LinearLayout nav;
    private LinearLayout recommendationBatchList;
    private TextView recommendationBatchStatus;
    private int current,serial,columns=2;
    private String query="",activeShelfId="";
    private SharedPreferences preferences;
    private UnifiedLibraryFilter.Spec librarySpec;
    private UnifiedCatalogStore.Snapshot unifiedSnapshot=new UnifiedCatalogStore.Snapshot();
    private UnifiedLibraryFilter.Facets unifiedFacets=new UnifiedLibraryFilter.Facets(new ArrayList<>(),new ArrayList<>(),new ArrayList<>());
    private UnifiedComicGridAdapter unifiedGridAdapter;
    private final ExecutorService requests=Executors.newFixedThreadPool(4);
    private Future<?> pending;
    private Future<?> libraryRefreshTask;
    private Future<?> settingsSummaryTask;
    private boolean libraryRefreshedThisSession;
    private boolean shelvesRefreshedThisSession;

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        preferences=getSharedPreferences("library-display",MODE_PRIVATE);
        columns=preferences.getInt("columns",2)==3?3:2;
        activeShelfId=preferences.getString("activeShelfId","");
        librarySpec=UnifiedFilterStore.load(preferences);
        if(saved!=null){
            current=ShellPolicy.clampTab(saved.getInt("tab"));
            query=saved.getString("query","");
            activeShelfId=saved.getString("activeShelfId",activeShelfId);
            libraryRefreshedThisSession=saved.getBoolean("libraryRefreshed",false);
            shelvesRefreshedThisSession=saved.getBoolean("shelvesRefreshed",false);
        }else if(getIntent()!=null&&getIntent().hasExtra("openTab")){
            current=ShellPolicy.clampTab(getIntent().getIntExtra("openTab",0));
        }

        getWindow().setStatusBarColor(Ui.BG);
        getWindow().setNavigationBarColor(Ui.BG);
        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        body=new FrameLayout(this);root.addView(body,new LinearLayout.LayoutParams(-1,0,1));
        nav=new LinearLayout(this);nav.setBackgroundColor(0xfff3f1f5);root.addView(nav);
        String[] labels=ShellPolicy.bottomTabs();
        for(int i=0;i<labels.length;i++){final int tab=i;Button b=button(labels[i],v->{current=tab;showTab();});nav.addView(b,new LinearLayout.LayoutParams(0,Ui.dp(this,54),1));}
        setContentView(root);root.requestApplyInsets();
    }

    @Override protected void onResume(){super.onResume();showTab();}
    @Override protected void onPause(){++serial;if(pending!=null)pending.cancel(true);if(settingsSummaryTask!=null)settingsSummaryTask.cancel(true);super.onPause();}
    @Override protected void onDestroy(){++serial;if(libraryRefreshTask!=null)libraryRefreshTask.cancel(true);if(settingsSummaryTask!=null)settingsSummaryTask.cancel(true);requests.shutdownNow();if(unifiedGridAdapter!=null)unifiedGridAdapter.close();super.onDestroy();}
    @Override protected void onSaveInstanceState(Bundle out){out.putInt("tab",current);out.putString("query",query);out.putString("activeShelfId",activeShelfId);out.putBoolean("libraryRefreshed",libraryRefreshedThisSession);out.putBoolean("shelvesRefreshed",shelvesRefreshedThisSession);super.onSaveInstanceState(out);}

    private boolean valid(int id){return id==serial&&!isFinishing()&&!isDestroyed();}
    private Button button(String label,View.OnClickListener action){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextSize(13);b.setTextColor(Ui.PRIMARY);b.setOnClickListener(action);return b;}
    private void cancelPageWork(){++serial;if(pending!=null)pending.cancel(true);pending=null;if(settingsSummaryTask!=null)settingsSummaryTask.cancel(true);settingsSummaryTask=null;if(unifiedGridAdapter!=null){unifiedGridAdapter.close();unifiedGridAdapter=null;}recommendationBatchList=null;recommendationBatchStatus=null;body.removeAllViews();}
    private void updateNav(){for(int i=0;i<nav.getChildCount();i++)nav.getChildAt(i).setBackgroundColor(i==current?Ui.PRIMARY_SOFT:Color.TRANSPARENT);}
    private void showTab(){cancelPageWork();updateNav();if(current==0)library();else if(current==1)recommendations();else if(current==2)history();else sources();}
    private void showBookshelvesPage(){cancelPageWork();current=0;updateNav();bookshelves();}

    private LinearLayout page(String title,String subtitle,boolean scroll){LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setPadding(Ui.dp(this,12),Ui.dp(this,12),Ui.dp(this,12),Ui.dp(this,8));if(scroll){ScrollView s=new ScrollView(this);s.addView(p);body.addView(s,new FrameLayout.LayoutParams(-1,-1));}else body.addView(p,new FrameLayout.LayoutParams(-1,-1));p.addView(Ui.text(this,title,27,Ui.TEXT,true));p.addView(Ui.text(this,subtitle,13,Ui.MUTED,false));Ui.gap(p,this,10);return p;}
    private void note(LinearLayout p,String title,String text){LinearLayout card=Ui.card(this);card.addView(Ui.text(this,title,17,Ui.TEXT,true));Ui.gap(card,this,5);card.addView(Ui.text(this,text,13,Ui.MUTED,false));p.addView(card);}
    private void pair(){startActivity(new Intent(this,PairingActivity.class));}
    private ProgressBar loading(LinearLayout p){ProgressBar b=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);b.setIndeterminate(true);p.addView(b,new LinearLayout.LayoutParams(-1,Ui.dp(this,3)));return b;}
    private GridView grid(LinearLayout p){GridView g=new GridView(this);g.setNumColumns(columns);g.setHorizontalSpacing(Ui.dp(this,8));g.setVerticalSpacing(Ui.dp(this,8));g.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,12));g.setClipToPadding(false);p.addView(g,new LinearLayout.LayoutParams(-1,0,1));return g;}

    private void openUnified(String comicId,String title,String author){UnifiedCatalogStore.Entry entry=UnifiedCatalogStore.load(this).byId.get(comicId);RecommendationEvidenceStore.recordDetailOpen(this,comicId,author,entry==null?Collections.emptyList():entry.tags,entry==null?Collections.emptyList():entry.categories);Intent i=new Intent(this,UnifiedComicDetailActivity.class);i.putExtra("comicId",comicId);i.putExtra("title",title);i.putExtra("author",author);startActivity(i);}

    private void library(){
        LinearLayout p=page("我的书库","一个漫画只显示一次；手机、电脑、WebDAV、Pica、收藏和书架作为同一条目的属性",false);
        EditText search=new EditText(this);search.setSingleLine(true);search.setText(query);search.setHint(LocalizedText.ui("搜索标题 / 作者 / 标签 / 分类"));search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        search.setOnEditorActionListener((v,id,event)->{if(id==EditorInfo.IME_ACTION_SEARCH){query=v.getText().toString().trim();showTab();return true;}return false;});p.addView(search);
        LinearLayout controls=new LinearLayout(this);p.addView(controls);
        controls.addView(button("筛选与排序"+(librarySpec.activeCount()>0?" ("+librarySpec.activeCount()+")":""),v->UnifiedLibraryFilterDialog.show(this,librarySpec,unifiedFacets,next->{librarySpec=next;UnifiedFilterStore.save(preferences,next);showTab();})),new LinearLayout.LayoutParams(0,-2,1));
        controls.addView(button("刷新书库",v->{libraryRefreshedThisSession=false;showTab();}),new LinearLayout.LayoutParams(0,-2,1));
        controls.addView(button(columns+" 列",v->{columns=columns==2?3:2;preferences.edit().putInt("columns",columns).apply();showTab();}),new LinearLayout.LayoutParams(0,-2,1));
        LinearLayout entries=new LinearLayout(this);p.addView(entries);
        entries.addView(button("书架",v->showBookshelvesPage()),new LinearLayout.LayoutParams(0,-2,1));
        entries.addView(button("Pica 在线",v->startActivity(new Intent(this,PicaBrowseActivity.class))),new LinearLayout.LayoutParams(0,-2,1));
        entries.addView(button("手机下载",v->startActivity(new Intent(this,DownloadsActivity.class))),new LinearLayout.LayoutParams(0,-2,1));
        TextView status=Ui.text(this,"正在读取本地统一目录…",12,Ui.MUTED,false);p.addView(status);GridView g=grid(p);
        final int id=serial;
        pending=requests.submit(()->{
            UnifiedCatalogStore.Snapshot local=UnifiedCatalogStore.reconcileLocalReferences(this);
            runOnUiThread(()->{
                if(!valid(id))return;
                renderUnifiedLibrary(g,status,local,"本地目录");
                if(!libraryRefreshedThisSession){libraryRefreshedThisSession=true;refreshUnifiedCatalog(g,status);}
                else status.setText(status.getText()+LocalizedText.ui(" · 本次会话已检查来源"));
            });
        });
    }

    private void renderUnifiedLibrary(GridView grid,TextView status,UnifiedCatalogStore.Snapshot snapshot,String sourceLabel){
        unifiedSnapshot=snapshot;List<UnifiedCatalogStore.Entry> all=snapshot.entries();unifiedFacets=UnifiedLibraryFilter.facets(all);UnifiedLibraryFilter.Spec applied=librarySpec.copy();applied.text=query;List<UnifiedCatalogStore.Entry> visible=UnifiedLibraryFilter.apply(all,applied);
        if(unifiedGridAdapter!=null)unifiedGridAdapter.close();unifiedGridAdapter=new UnifiedComicGridAdapter(this,visible,entry->openUnified(entry.id,entry.title,entry.displayAuthor()));grid.setAdapter(unifiedGridAdapter);
        String filter=(query.isEmpty()&&librarySpec.activeCount()==0)?"":" · 已筛选";status.setText(visible.size()+" / "+all.size()+LocalizedText.ui(" 部 · ")+sourceLabel+filter);
    }

    private void refreshUnifiedCatalog(GridView grid,TextView status){
        final int id=serial;final boolean hadLocal=!unifiedSnapshot.entries().isEmpty();
        if(libraryRefreshTask!=null&&!libraryRefreshTask.isDone()){status.setText(status.getText()+LocalizedText.ui(" · 来源检查已在后台进行"));return;}
        status.setText(hadLocal?status.getText()+LocalizedText.ui(" · 后台检查来源中"):LocalizedText.ui("正在建立统一目录…"));
        libraryRefreshTask=requests.submit(()->{
            List<String> ok=new ArrayList<>(),problems=new ArrayList<>();
            if(BridgeStore.paired(this))try{BridgeClient.device(this);UnifiedCatalogStore.refreshDesktop(this);ok.add("Desktop");try{FavoriteCacheStore.syncFromDesktop(this,false,null);}catch(Exception ignored){}}catch(Exception e){problems.add("电脑不可达");}
            if(RemoteConfigStore.load(this).configured())try{RemoteLibraryClient client=new RemoteLibraryClient(this);UnifiedCatalogStore.refreshRemote(this);ok.add("WebDAV");try{FavoriteCacheStore.Snapshot favorites=FavoriteCacheStore.fromRemote(client.favorites());FavoriteCacheStore.save(this,favorites.items,false);}catch(Exception ignored){}try{ShelfStore.Snapshot shelves=ShelfStore.fromRemote(client.shelves());ShelfStore.save(this,shelves);}catch(Exception ignored){}}catch(Exception e){problems.add("云端暂不可用");}
            UnifiedCatalogStore.Snapshot latest=UnifiedCatalogStore.reconcileLocalReferences(this);String label=ok.isEmpty()?"本地缓存":join(ok," + ")+" 已刷新";if(!problems.isEmpty())label+=" · "+join(problems," / ");final String finalLabel=label;runOnUiThread(()->{if(valid(id))renderUnifiedLibrary(grid,status,latest,finalLabel);});
        });
    }
    private String join(List<String> values,String separator){StringBuilder out=new StringBuilder();for(String value:values){if(out.length()>0)out.append(separator);out.append(value);}return out.toString();}

    private void bookshelves(){
        LinearLayout p=page("书架","书架属于统一书库的组织方式，不占用底部主导航",true);LinearLayout toolbar=new LinearLayout(this);p.addView(toolbar);
        toolbar.addView(button("返回书库",v->{current=0;showTab();}),new LinearLayout.LayoutParams(0,-2,1));toolbar.addView(button("刷新书架",v->{shelvesRefreshedThisSession=false;showBookshelvesPage();}),new LinearLayout.LayoutParams(0,-2,1));toolbar.addView(button("连接设置",v->{current=3;showTab();}),new LinearLayout.LayoutParams(0,-2,1));
        TextView status=Ui.text(this,"",12,Ui.MUTED,false);p.addView(status);LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);p.addView(content);ShelfStore.Snapshot cached=ShelfStore.load(this);renderShelves(content,status,cached,Collections.emptyMap(),"本地缓存");
        if(!shelvesRefreshedThisSession&&RemoteConfigStore.load(this).configured()){shelvesRefreshedThisSession=true;refreshShelvesInto(content,status);}else if(cached.shelves.isEmpty())status.setText(RemoteConfigStore.load(this).configured()?LocalizedText.ui("暂无书架缓存；点击刷新书架重试"):LocalizedText.ui("暂无本地书架。配置 WebDAV 并完成一次电脑云同步后即可导入。"));
    }

    private void refreshShelvesInto(LinearLayout content,TextView status){
        final int id=serial;status.setText(LocalizedText.ui("正在从 WebDAV 更新书架元数据…"));pending=requests.submit(()->{try{RemoteLibraryClient client=new RemoteLibraryClient(this);ShelfStore.Snapshot snapshot=ShelfStore.fromRemote(client.shelves());ShelfStore.save(this,snapshot);UnifiedCatalogStore.reconcileLocalReferences(this);Map<String,RemoteLibraryClient.Comic> remote=new HashMap<>();try{for(RemoteLibraryClient.Comic c:client.catalog().comics)remote.put(c.id,c);}catch(Exception ignored){}runOnUiThread(()->{if(valid(id))renderShelves(content,status,snapshot,remote,"WebDAV 已同步");});}catch(Exception e){runOnUiThread(()->{if(!valid(id))return;ShelfStore.Snapshot fallback=ShelfStore.load(this);renderShelves(content,status,fallback,Collections.emptyMap(),fallback.shelves.isEmpty()?"书架尚未同步到云端":"云端暂不可用 · 正在使用本地书架缓存");});}});
    }

    private void renderShelves(LinearLayout target,TextView status,ShelfStore.Snapshot snapshot,Map<String,RemoteLibraryClient.Comic> remote,String sourceLabel){
        target.removeAllViews();if(snapshot.shelves.isEmpty()){status.setText(sourceLabel+LocalizedText.ui(" · 暂无书架"));return;}ShelfStore.Shelf active=null;for(ShelfStore.Shelf s:snapshot.shelves)if(s.id.equals(activeShelfId)){active=s;break;}if(active==null)active=snapshot.shelves.get(0);activeShelfId=active.id;preferences.edit().putString("activeShelfId",activeShelfId).apply();status.setText(sourceLabel+" · "+snapshot.shelves.size()+LocalizedText.ui(" 个书架 · ")+active.items.size()+LocalizedText.ui(" 本"));
        LinearLayout tabs=new LinearLayout(this);target.addView(tabs);for(ShelfStore.Shelf shelf:snapshot.shelves){Button b=button(shelf.name+(shelf.id.equals(active.id)?" ✓":""),v->{activeShelfId=shelf.id;preferences.edit().putString("activeShelfId",activeShelfId).apply();showBookshelvesPage();});tabs.addView(b,new LinearLayout.LayoutParams(0,-2,1));}Ui.gap(target,this,8);
        UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(this);
        for(ShelfStore.Item item:active.items){LinearLayout card=Ui.card(this);card.addView(Ui.text(this,item.title,17,Ui.TEXT,true));card.addView(Ui.text(this,item.author,12,Ui.MUTED,false));RemoteLibraryClient.Comic cloud=remote.get(item.comicId);UnifiedCatalogStore.Entry local=catalog.byId.get(item.comicId);String availability=cloud!=null?"云端可读 · "+cloud.pageCount+" 页":local!=null&&local.phoneDownloaded?"手机已下载":item.downloadedPictures>0?"电脑已下载 · "+item.downloadedPictures+" 页":local!=null&&local.picaAvailable?"Pica 在线可读":"仅书架元数据";card.addView(Ui.text(this,availability,12,cloud!=null||local!=null&&(local.phoneDownloaded||local.picaAvailable)?Ui.PRIMARY:Ui.MUTED,false));card.setOnClickListener(v->openUnified(item.comicId,item.title,item.author));target.addView(card);}
    }

    private void recommendations(){
        LinearLayout p=page("为你推荐","手机独立运行自己的推荐周期；Desktop 只同步可复用画像、候选与 Visual/Canonical 基础",true);
        PortableRecommendationPackageStore.Snapshot portable=PortableRecommendationPackageStore.load(this);
        UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(this);
        boolean hasLocalEvidence=false;
        for(UnifiedCatalogStore.Entry entry:catalog.byId.values())if(entry.favorite||entry.inShelf||entry.phoneDownloaded||entry.desktopDownloaded||entry.remoteAvailable||RecommendationFeedbackStore.isLiked(this,entry.id)){hasLocalEvidence=true;break;}
        boolean canRun=hasLocalEvidence&&(PicaClient.available(this)||portable.available());

        NativeRecommendationStore.Snapshot snapshot=NativeRecommendationStore.load(this);
        LinearLayout actions=new LinearLayout(this);p.addView(actions);
        actions.addView(button(snapshot.available()?"重新生成手机推荐":"生成手机推荐",v->{NativeRecommendationJobs.refresh(this);Toast.makeText(this,LocalizedText.ui("手机将独立生成新的推荐周期，可离开本页继续使用 App"),Toast.LENGTH_LONG).show();}),new LinearLayout.LayoutParams(0,-2,1));
        actions.addView(button("画像 / 调整",v->startActivity(new Intent(this,RecommendationStyleActivity.class))),new LinearLayout.LayoutParams(0,-2,1));

        if(!canRun&&!snapshot.available()){
            note(p,"手机推荐输入还不完整","需要本地收藏/行为画像，并至少具备在线 Provider 或已同步的 Portable Candidate Reservoir。同步的是候选和知识，不会复制电脑当前推荐列表。");
            LinearLayout setup=new LinearLayout(this);p.addView(setup);
            setup.addView(button("推荐同步",v->startActivity(new Intent(this,RecommendationSyncActivity.class))),new LinearLayout.LayoutParams(0,-2,1));
            setup.addView(button("在线来源",v->startActivity(new Intent(this,PicaBrowseActivity.class))),new LinearLayout.LayoutParams(0,-2,1));
            return;
        }

        if(!snapshot.available()){
            String detail=portable.available()?"已同步 "+portable.candidates.size()+" 个候选，可由手机结合本机 Recent / Session / 人工调整重新排序。":"首次生成会使用手机本地收藏和可用 Provider 建立自己的候选池。";
            note(p,"尚未生成手机推荐周期",detail);
            return;
        }

        NativeRecommendationStore.markCurrentSeen(this);
        snapshot=NativeRecommendationStore.load(this);
        recommendationBatchStatus=Ui.text(this,"",13,Ui.MUTED,false);p.addView(recommendationBatchStatus);
        LinearLayout batchControls=new LinearLayout(this);p.addView(batchControls);
        batchControls.addView(button("上一批",v->switchNativeRecommendationBatch(-1)),new LinearLayout.LayoutParams(0,-2,1));
        batchControls.addView(button("下一批",v->switchNativeRecommendationBatch(1)),new LinearLayout.LayoutParams(0,-2,1));
        recommendationBatchList=new LinearLayout(this);recommendationBatchList.setOrientation(LinearLayout.VERTICAL);p.addView(recommendationBatchList);
        renderNativeRecommendationBatch(snapshot);
    }


    private void switchNativeRecommendationBatch(int direction){
        if(recommendationBatchList==null||recommendationBatchStatus==null)return;
        NativeRecommendationStore.Snapshot snapshot=direction<0?NativeRecommendationStore.previousBatch(this):NativeRecommendationStore.nextBatch(this);
        renderNativeRecommendationBatch(snapshot);
    }

    private void renderNativeRecommendationBatch(NativeRecommendationStore.Snapshot snapshot){
        if(recommendationBatchList==null||recommendationBatchStatus==null)return;
        recommendationBatchStatus.setText(LocalizedText.ui("手机独立 Recommendation V3/V5 Portable · ")+snapshot.readiness+LocalizedText.ui(" · 候选 ")+snapshot.candidateCount+LocalizedText.ui(" 本 · 第 ")+(snapshot.batchIndex+1)+" / "+snapshot.batches.size()+LocalizedText.ui(" 批"));
        recommendationBatchList.removeAllViews();
        for(NativeRecommendationStore.Item item:snapshot.current()){
            LinearLayout card=Ui.card(this);
            card.addView(Ui.text(this,item.title,17,Ui.TEXT,true));
            card.addView(Ui.text(this,item.author,12,Ui.MUTED,false));
            card.addView(Ui.text(this,item.reason,12,Ui.PRIMARY,false));
            card.addView(Ui.text(this,item.family+" · score "+String.format(Locale.ROOT,"%.4f",item.score),10.5f,Ui.MUTED,false));
            card.setOnClickListener(v->openUnified(item.comicId,item.title,item.author));
            recommendationBatchList.addView(card);
        }
    }

    private void history(){
        LinearLayout p=page("继续阅读","WebDAV 便携进度 + Desktop 历史按更新时间合并",true);p.addView(button("刷新阅读记录",v->showTab()));TextView status=Ui.text(this,"正在合并阅读记录…",13,Ui.MUTED,false);p.addView(status);ProgressBar load=loading(p);final int id=serial;
        pending=requests.submit(()->{Map<String,HistoryItem> merged=new HashMap<>();Map<String,RemoteLibraryClient.Comic> cloud=new HashMap<>();boolean remoteOk=false,desktopOk=false;if(RemoteConfigStore.load(this).configured())try{RemoteLibraryClient client=new RemoteLibraryClient(this);try{for(RemoteLibraryClient.Comic c:client.catalog().comics)cloud.put(c.id,c);}catch(Exception ignored){}for(RemoteLibraryClient.ReadingEntry e:client.readingEntries()){RemoteLibraryClient.Comic c=cloud.get(e.comicId);String title=e.comicTitle.isEmpty()?(c==null?"漫画":c.title):e.comicTitle;String author=e.author.isEmpty()?(c==null?"未知作者":c.author):e.author;String episode=e.episodeTitle.isEmpty()?"章节":e.episodeTitle;HistoryItem item=new HistoryItem(e.comicId,title,author,e.episodeId,episode,e.episodeOrder,e.pageIndex,e.updatedAt);merged.put(e.comicId+"\n"+e.episodeId,item);}remoteOk=true;}catch(Exception ignored){}if(BridgeStore.paired(this))try{for(BridgeClient.RecentItem r:BridgeClient.recent(this,100)){String key=r.comic.id+"\n"+r.episodeId;HistoryItem prior=merged.get(key);HistoryItem item=new HistoryItem(r.comic.id,r.comic.title,r.comic.author,r.episodeId,r.episodeTitle,r.episodeOrder,r.pageIndex,r.updatedAt);if(prior==null||item.updatedAt.compareTo(prior.updatedAt)>0)merged.put(key,item);}desktopOk=true;}catch(Exception ignored){}List<HistoryItem> items=new ArrayList<>(merged.values());items.sort((a,b)->b.updatedAt.compareTo(a.updatedAt));if(items.size()>100)items=new ArrayList<>(items.subList(0,100));final List<HistoryItem> visible=items;final boolean remoteAvailable=remoteOk,desktopAvailable=desktopOk;final Map<String,RemoteLibraryClient.Comic> cloudSnapshot=new HashMap<>(cloud);runOnUiThread(()->{if(!valid(id))return;load.setVisibility(View.GONE);String label=(remoteAvailable?"WebDAV":"")+(remoteAvailable&&desktopAvailable?" + ":"")+(desktopAvailable?"Desktop":"");status.setText(visible.size()+LocalizedText.ui(" 条阅读记录")+(label.isEmpty()?LocalizedText.ui(" · 当前仅有本地书签"):" · "+label));if(visible.isEmpty()){note(p,"还没有可合并的阅读记录","云端阅读会自动写入便携进度；Desktop 进度会在云同步时合并到 WebDAV。");return;}for(HistoryItem h:visible){LinearLayout card=Ui.card(this);card.addView(Ui.text(this,h.title,18,Ui.TEXT,true));card.addView(Ui.text(this,h.episodeTitle+" · 第 "+(h.pageIndex+1)+" 页",13,Ui.PRIMARY,false));card.addView(Ui.text(this,h.author,12,Ui.MUTED,false));RemoteLibraryClient.Comic cloudComic=cloudSnapshot.get(h.comicId);card.addView(Ui.text(this,cloudComic!=null?"云端可继续":desktopAvailable?"电脑可继续":"打开详情重新选择来源",11,Ui.MUTED,false));card.addView(button("继续阅读",v->{RemoteLibraryClient.Comic c=cloudSnapshot.get(h.comicId);if(c!=null){Intent intent=new Intent(this,ReaderActivity.class);intent.putExtra("comicId",h.comicId);intent.putExtra("title",h.title);intent.putExtra("episodeId",h.episodeId);intent.putExtra("source","remote");startActivity(intent);return;}if(BridgeStore.paired(this)){Intent intent=new Intent(this,ReaderActivity.class);intent.putExtra("comicId",h.comicId);intent.putExtra("title",h.title);intent.putExtra("episodeId",h.episodeId);intent.putExtra("source","desktop");startActivity(intent);return;}openUnified(h.comicId,h.title,h.author);}));p.addView(card);}});});
    }

    private SettingsSummary readSettingsSummary(){
        FavoriteCacheStore.Snapshot favorites=FavoriteCacheStore.load(this);
        long favoriteMetadataBytes=FavoriteCacheStore.metadataBytes(this);
        long coverBytes=CoverRepository.diskBytes(this);
        RemoteConfigStore.Config remote=RemoteConfigStore.load(this);
        PicaAccountStore.Session pica=PicaAccountStore.load(this);
        NativeRecommendationStore.Snapshot recommendation=NativeRecommendationStore.load(this);
        PhoneDownloadStore.Snapshot downloads=PhoneDownloadStore.load(this);
        long downloadBytes=PhoneDownloadStore.estimatedBytes(this,downloads);
        StoragePolicy.Usage storage=StoragePolicy.usage(this);
        return new SettingsSummary(
            favorites,
            favoriteMetadataBytes,
            coverBytes,
            remote,
            pica,
            recommendation,
            downloads,
            downloadBytes,
            storage
        );
    }

    private void sources(){
        final int id=serial;
        LinearLayout p=page("连接与设置","Desktop、WebDAV、Pica 和手机本地都只是正文来源；书库始终只有一个",true);

        LinearLayout desktop=Ui.card(this);
        desktop.addView(Ui.text(this,"局域网电脑",18,Ui.TEXT,true));
        TextView desktopState=Ui.text(this,BridgeStore.paired(this)?"已配对 · 正在检查连接":"尚未配对",13,Ui.MUTED,false);
        desktop.addView(desktopState);
        if(BridgeStore.paired(this))desktop.addView(Ui.text(this,BridgeStore.serverName(this),13,Ui.MUTED,false));
        desktop.addView(button(BridgeStore.paired(this)?"管理电脑连接":"配对电脑",v->pair()));
        p.addView(desktop);
        if(BridgeStore.paired(this)){
            pending=requests.submit(()->{
                try{
                    BridgeClient.device(this);
                    runOnUiThread(()->{if(valid(id))desktopState.setText(LocalizedText.ui("电脑在线 · 可作为高速阅读来源"));});
                }catch(Exception e){
                    runOnUiThread(()->{if(valid(id))desktopState.setText(LocalizedText.ui("已配对 · 电脑当前不可达"));});
                }
            });
        }

        LinearLayout favorites=Ui.card(this);
        favorites.addView(Ui.text(this,"收藏与封面导入",18,Ui.TEXT,true));
        TextView favoriteState=Ui.text(this,LocalizedText.ui("正在读取收藏缓存…"),13,Ui.MUTED,false);
        favorites.addView(favoriteState);
        favorites.addView(Ui.text(this,"导入任务由 WorkManager 在后台执行；离开本页不会取消。",12,Ui.MUTED,false));
        LinearLayout favActions=new LinearLayout(this);
        favActions.addView(button("仅导入收藏",v->{if(!BridgeStore.paired(this)){favoriteState.setText(LocalizedText.ui("请先配对电脑后再导入 Desktop 收藏"));pair();return;}FavoriteImportJobs.enqueue(this,false);favoriteState.setText(LocalizedText.ui("收藏导入已加入后台任务"));}),new LinearLayout.LayoutParams(0,-2,1));
        favActions.addView(button("收藏 + 封面",v->{if(!BridgeStore.paired(this)){favoriteState.setText(LocalizedText.ui("请先配对电脑后再导入 Desktop 收藏与封面"));pair();return;}FavoriteImportJobs.enqueue(this,true);favoriteState.setText(LocalizedText.ui("收藏和封面已加入后台任务"));}),new LinearLayout.LayoutParams(0,-2,1));
        favorites.addView(favActions);
        favorites.addView(button("查看后台任务",v->startActivity(new Intent(this,TaskCenterActivity.class))));
        p.addView(favorites);

        LinearLayout cloud=Ui.card(this);
        cloud.addView(Ui.text(this,"WebDAV 云端",18,Ui.TEXT,true));
        TextView cloudState=Ui.text(this,LocalizedText.ui("正在读取 WebDAV 配置…"),13,Ui.MUTED,false);
        cloud.addView(cloudState);
        cloud.addView(Ui.text(this,"电脑关机时仍可直接读取云端漫画；云端还承载便携书架、收藏和阅读进度。",12,Ui.MUTED,false));
        Button cloudAction=button("管理 WebDAV",v->startActivity(new Intent(this,RemoteStorageActivity.class)));
        cloud.addView(cloudAction);
        p.addView(cloud);

        LinearLayout pica=Ui.card(this);
        pica.addView(Ui.text(this,"Pica 在线",18,Ui.TEXT,true));
        TextView picaState=Ui.text(this,LocalizedText.ui("正在读取 Pica 账号…"),13,Ui.MUTED,false);
        pica.addView(picaState);
        TextView picaRouteState=Ui.text(this,LocalizedText.ui("正在读取可用连接…"),12,Ui.MUTED,false);
        pica.addView(picaRouteState);
        TextView recommendationState=Ui.text(this,"",12,Ui.PRIMARY,false);
        recommendationState.setVisibility(View.GONE);
        pica.addView(recommendationState);
        LinearLayout picaActions=new LinearLayout(this);
        picaActions.addView(button("浏览 Pica",v->startActivity(new Intent(this,PicaBrowseActivity.class))),new LinearLayout.LayoutParams(0,-2,1));
        picaActions.addView(button("账号",v->startActivity(new Intent(this,PicaAccountActivity.class))),new LinearLayout.LayoutParams(0,-2,1));
        pica.addView(picaActions);
        p.addView(pica);

        LinearLayout downloads=Ui.card(this);
        downloads.addView(Ui.text(this,"后台任务与手机下载",18,Ui.TEXT,true));
        TextView downloadState=Ui.text(this,LocalizedText.ui("正在统计手机下载…"),13,Ui.MUTED,false);
        downloads.addView(downloadState);
        downloads.addView(Ui.text(this,"主动下载不是缓存，不受 LRU 清理；Pica 长篇下载、封面导入和手机推荐都能脱离当前页面继续。",12,Ui.MUTED,false));
        LinearLayout downloadActions=new LinearLayout(this);
        downloadActions.addView(button("后台任务",v->startActivity(new Intent(this,TaskCenterActivity.class))),new LinearLayout.LayoutParams(0,-2,1));
        downloadActions.addView(button("管理已下载",v->startActivity(new Intent(this,DownloadsActivity.class))),new LinearLayout.LayoutParams(0,-2,1));
        downloads.addView(downloadActions);
        p.addView(downloads);

        LinearLayout storage=Ui.card(this);
        storage.addView(Ui.text(this,"存储与预加载",18,Ui.TEXT,true));
        TextView storageState=Ui.text(this,LocalizedText.ui("正在统计缓存占用…"),13,Ui.MUTED,false);
        storage.addView(storageState);
        storage.addView(Ui.text(this,"可调整阅读页/封面上限、预加载页数、缓存位置、手机下载目录和仅 Wi‑Fi 下载策略。",12,Ui.MUTED,false));
        storage.addView(button("打开存储设置",v->startActivity(new Intent(this,StorageSettingsActivity.class))));
        p.addView(storage);

        LinearLayout update=Ui.card(this);
        update.addView(Ui.text(this,"软件更新",18,Ui.TEXT,true));
        update.addView(Ui.text(this,"检查移动 Preview 清单，下载后会进行 SHA-256 校验，再交给 Android 系统安装确认。",12,Ui.MUTED,false));
        update.addView(button("检查更新",v->startActivity(new Intent(this,UpdateActivity.class))));
        p.addView(update);
        note(p,"阅读设置","所有来源共用 Alpha6 Reader：横向左→右、横向右→左、纵向连续阅读、屏幕常亮、章节切换和页面预加载。");
        note(p,"关于","Pica Library Android "+getVersion()+"\n手机端不包含图鉴；网页端 Taste Chronicle 保留。不要把局域网 Bridge 直接映射到公网。");

        settingsSummaryTask=requests.submit(()->{
            SettingsSummary summary=readSettingsSummary();
            runOnUiThread(()->{
                if(!valid(id))return;
                if(favoriteState.getText().toString().equals(LocalizedText.ui("正在读取收藏缓存…")))
                    favoriteState.setText(summary.favorites.items.isEmpty()
                        ?"尚未导入 Desktop 收藏"
                        :"已缓存 "+summary.favorites.items.size()+" 本 · 元数据 "+formatBytes(summary.favoriteMetadataBytes)+" · 统一封面缓存 "+formatBytes(summary.coverBytes));
                cloudState.setText(summary.remote.configured()?"已配置 · "+summary.remote.root:"尚未配置");
                cloudAction.setText(summary.remote.configured()?"管理 WebDAV / 刷新便携状态":"配置 WebDAV");
                picaState.setText(summary.pica.signedIn()
                    ?"已登录 · 可直接搜索、收藏、在线阅读和下载"
                    :summary.pica.configured()?"已保存账号 · 会在需要时重新登录":"尚未配置");
                picaRouteState.setText(summary.pica.configured()
                    ?"手机本机账号优先直连 Pica。"
                    :"如电脑已登录且保持配对，手机可通过 Desktop Provider Relay 使用 Pica，不复制账号密码或 token。");
                if(summary.recommendation.available()){
                    recommendationState.setText("手机推荐缓存："+summary.recommendation.readiness+" · "+summary.recommendation.batches.size()+" 批 · 候选 "+summary.recommendation.candidateCount+" 本");
                    recommendationState.setVisibility(View.VISIBLE);
                }else recommendationState.setVisibility(View.GONE);
                downloadState.setText(summary.downloads.comics.size()+" 本手机持久下载 · 约 "+formatBytes(summary.downloadBytes));
                storageState.setText("缓存合计 "+formatBytes(summary.storage.total)+" · 阅读页 "+formatBytes(summary.storage.pages)+" · 封面 "+formatBytes(summary.storage.covers));
            });
        });
    }
    private String formatBytes(long value){if(value<1024)return value+" B";if(value<1024L*1024)return String.format(Locale.ROOT,"%.1f KB",value/1024.0);if(value<1024L*1024*1024)return String.format(Locale.ROOT,"%.1f MB",value/1024.0/1024.0);return String.format(Locale.ROOT,"%.2f GB",value/1024.0/1024.0/1024.0);}
    private String getVersion(){try{return getPackageManager().getPackageInfo(getPackageName(),0).versionName;}catch(Exception e){return "预览版";}}
}