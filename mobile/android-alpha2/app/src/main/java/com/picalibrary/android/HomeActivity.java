package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.*;
import android.view.inputmethod.EditorInfo;
import android.widget.*;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import java.util.*;
import java.util.concurrent.*;

/** Product shell: library and recommendations live here; Online and Settings own separate screens. */
public final class HomeActivity extends LocaleAwareActivity {
    private FrameLayout body;private SharedPreferences prefs;private final ExecutorService worker=Executors.newFixedThreadPool(4);private Future<?> pending;private int serial,current,collectionMode;private String libraryQuery="",activeShelfId="",themeKey="";private boolean showingShelves;
    private LinearLayout recommendationBatchList;private TextView recommendationBatchLabel;private UnifiedCatalogStore.Snapshot recommendationCatalog;
    private UnifiedLibraryFilter.Spec librarySpec;private UnifiedLibraryFilter.Facets libraryFacets=new UnifiedLibraryFilter.Facets(new ArrayList<>(),new ArrayList<>(),new ArrayList<>());
    private final int[] tabScrollY=new int[4],tabListPosition=new int[4],tabListOffset=new int[4];private ScrollView activeScroll;private RecyclerView activeList;private int activeViewportTab=-1;

    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);themeKey=ThemeStore.effectiveKey(this);prefs=getSharedPreferences("alpha81-ui",MODE_PRIVATE);collectionMode=UnifiedComicCollectionAdapter.normalizeMode(prefs.getInt("collectionMode",UnifiedComicCollectionAdapter.MODE_GRID_MEDIUM));activeShelfId=prefs.getString("activeShelfId","");librarySpec=UnifiedFilterStore.load(getSharedPreferences("library-display",MODE_PRIVATE));librarySpec.favoriteOnly=false;if(saved!=null){current=ShellPolicy.clampTab(saved.getInt("tab",0));showingShelves=saved.getBoolean("shelves",false);libraryQuery=saved.getString("libraryQuery","");int[] sy=saved.getIntArray("tabScrollY"),sp=saved.getIntArray("tabListPosition"),so=saved.getIntArray("tabListOffset");if(sy!=null&&sy.length==4)System.arraycopy(sy,0,tabScrollY,0,4);if(sp!=null&&sp.length==4)System.arraycopy(sp,0,tabListPosition,0,4);if(so!=null&&so.length==4)System.arraycopy(so,0,tabListOffset,0,4);}else current=ShellPolicy.clampTab(getIntent().getIntExtra("tab",0));renderShell();show();}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);showingShelves=false;current=ShellPolicy.clampTab(intent.getIntExtra("tab",0));renderShell();show();}
    @Override protected void onResume(){super.onResume();RecommendationSyncActivity.maybeOfferOnConnection(this);String key=ThemeStore.effectiveKey(this);if(!key.equals(themeKey)){themeKey=key;Ui.applyWindow(this);renderShell();show();return;}if(body!=null)show();}
    @Override protected void onSaveInstanceState(Bundle out){captureCurrentViewport();out.putInt("tab",current);out.putBoolean("shelves",showingShelves);out.putString("libraryQuery",libraryQuery);out.putIntArray("tabScrollY",tabScrollY);out.putIntArray("tabListPosition",tabListPosition);out.putIntArray("tabListOffset",tabListOffset);super.onSaveInstanceState(out);}
    @Override protected void onPause(){captureCurrentViewport();super.onPause();}
    @Override protected void onDestroy(){++serial;if(pending!=null)pending.cancel(true);worker.shutdownNow();super.onDestroy();}

    private void renderShell(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});body=new FrameLayout(this);body.setBackgroundColor(Ui.BG);root.addView(body,new LinearLayout.LayoutParams(-1,0,1));root.addView(ShellNavigation.build(this,current));setContentView(root);root.requestApplyInsets();}
    private Button compact(String label,View.OnClickListener action){return Ui.button(this,label,action,true);}
    private void show(){captureCurrentViewport();++serial;if(pending!=null)pending.cancel(true);pending=null;body.removeAllViews();activeScroll=null;activeList=null;activeViewportTab=-1;recommendationBatchList=null;recommendationBatchLabel=null;recommendationCatalog=null;if(showingShelves){shelves();return;}if(current==0)library();else if(current==1)recommendations();else if(current==2)onlineEntry();else settingsEntry();}
    private LinearLayout page(boolean scroll){LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setBackgroundColor(Ui.BG);p.setPadding(Ui.dp(this,12),Ui.dp(this,8),Ui.dp(this,12),Ui.dp(this,8));if(scroll){final int tab=current;ScrollView s=new ScrollView(this);activeScroll=s;activeList=null;activeViewportTab=tab;s.setBackgroundColor(Ui.BG);s.addView(p);body.addView(s,new FrameLayout.LayoutParams(-1,-1));s.post(()->s.scrollTo(0,Math.max(0,tabScrollY[tab])));}else{activeScroll=null;activeList=null;activeViewportTab=-1;body.addView(p,new FrameLayout.LayoutParams(-1,-1));}return p;}
    private void titleRow(LinearLayout p,String title,View... actions){LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);TextView label=Ui.text(this,title,26,Ui.TEXT,true);row.addView(label,new LinearLayout.LayoutParams(0,-2,1));for(View action:actions){LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-2,-2);lp.setMargins(Ui.dp(this,4),0,0,0);row.addView(action,lp);}p.addView(row);}
    private RecyclerView collection(LinearLayout p,int mode){final int tab=current;RecyclerView v=new RecyclerView(this);activeScroll=null;activeList=v;activeViewportTab=tab;v.setClipToPadding(false);v.setPadding(0,Ui.dp(this,4),0,Ui.dp(this,16));setCollectionLayout(v,mode);p.addView(v,new LinearLayout.LayoutParams(-1,0,1));return v;}
    private void rememberListPosition(RecyclerView v,int tab){RecyclerView.LayoutManager raw=v.getLayoutManager();if(!(raw instanceof LinearLayoutManager))return;LinearLayoutManager lm=(LinearLayoutManager)raw;int position=lm.findFirstVisibleItemPosition();if(position<0)return;View first=lm.findViewByPosition(position);tabListPosition[tab]=position;tabListOffset[tab]=first==null?0:first.getTop()-v.getPaddingTop();}
    private void captureCurrentViewport(){int tab=activeViewportTab;if(tab<0||tab>=4)return;if(activeScroll!=null){tabScrollY[tab]=Math.max(0,activeScroll.getScrollY());return;}if(activeList!=null)rememberListPosition(activeList,tab);}
    private void restoreListPosition(RecyclerView v,int tab){int position=Math.max(0,tabListPosition[tab]),offset=tabListOffset[tab];v.post(()->{RecyclerView.LayoutManager raw=v.getLayoutManager();if(raw instanceof LinearLayoutManager)((LinearLayoutManager)raw).scrollToPositionWithOffset(position,offset);});}
    private void setCollectionLayout(RecyclerView v,int mode){if(mode==UnifiedComicCollectionAdapter.MODE_LIST)v.setLayoutManager(new LinearLayoutManager(this));else v.setLayoutManager(new GridLayoutManager(this,Math.max(2,mode)));v.setItemAnimator(null);}
    private void open(UnifiedCatalogStore.Entry e){Intent i=new Intent(this,UnifiedComicDetailActivity.class);i.putExtra("comicId",e.id);i.putExtra("title",e.title);i.putExtra("author",e.displayAuthor());startActivity(i);}
    private void openRecommendation(UnifiedCatalogStore.Entry e){RecommendationEvidenceStore.recordDetailOpen(this,e.id,e.displayAuthor(),e.tags,e.categories);open(e);}

    private void library(){LinearLayout p=page(false);Button history=compact("历史",v->startActivity(new Intent(this,HistoryActivity.class)));history.setSingleLine(true);Button more=compact("⋮",v->showLibraryMenu());more.setSingleLine(true);titleRow(p,"我的书库",history,more);EditText search=new EditText(this);search.setSingleLine(true);search.setHint(LocalizedText.ui("搜索标题 / 作者 / 标签 / 分类"));search.setText(libraryQuery);search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);Ui.styleField(search,this);search.setOnEditorActionListener((v,id,event)->{if(id==EditorInfo.IME_ACTION_SEARCH){libraryQuery=v.getText().toString().trim();show();return true;}return false;});LinearLayout.LayoutParams sp=new LinearLayout.LayoutParams(-1,-2);sp.setMargins(0,Ui.dp(this,8),0,Ui.dp(this,6));p.addView(search,sp);LinearLayout tools=new LinearLayout(this);tools.setGravity(Gravity.CENTER_VERTICAL);Button filter=compact("筛选"+(librarySpec.activeCount()>0?" · "+librarySpec.activeCount():""),v->UnifiedLibraryFilterDialog.show(this,librarySpec,libraryFacets,next->{librarySpec=next;librarySpec.favoriteOnly=false;UnifiedFilterStore.save(getSharedPreferences("library-display",MODE_PRIVATE),next);show();}));filter.setSingleLine(true);tools.addView(filter);Ui.gap(tools,this,6);Button sort=compact(UnifiedLibraryFilter.sortLabel(librarySpec.sort)+" ▾",v->chooseLibrarySort());sort.setSingleLine(true);tools.addView(sort);TextView count=Ui.text(this,"",12.5f,Ui.MUTED,false);count.setGravity(Gravity.CENTER_VERTICAL|Gravity.RIGHT);LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(0,-1,1);cp.setMargins(Ui.dp(this,8),0,0,0);tools.addView(count,cp);p.addView(tools);RecyclerView list=collection(p,collectionMode);renderLibrary(list,count);refreshLibrary(false);}
    private void showLibraryMenu(){String[] labels={"书架","刷新书库","显示方式"};new AlertDialog.Builder(this).setTitle(LocalizedText.ui("书库")).setItems(labels,(d,w)->{if(w==0){showingShelves=true;show();}else if(w==1)refreshLibrary(true);else chooseCollectionMode();}).setNegativeButton(LocalizedText.ui("取消"),null).show();}
    private void chooseLibrarySort(){UnifiedLibraryFilter.Sort[] values={UnifiedLibraryFilter.Sort.LATEST,UnifiedLibraryFilter.Sort.TITLE,UnifiedLibraryFilter.Sort.AUTHOR};String[] labels={"最近更新","标题","作者"};int checked=librarySpec.sort==UnifiedLibraryFilter.Sort.TITLE?1:librarySpec.sort==UnifiedLibraryFilter.Sort.AUTHOR?2:0;new AlertDialog.Builder(this).setTitle(LocalizedText.ui("排序")).setSingleChoiceItems(labels,checked,(d,w)->{librarySpec.sort=values[w];UnifiedFilterStore.save(getSharedPreferences("library-display",MODE_PRIVATE),librarySpec);d.dismiss();show();}).setNegativeButton(LocalizedText.ui("取消"),null).show();}
    private void renderLibrary(RecyclerView list,TextView count){UnifiedCatalogStore.Snapshot snapshot=UnifiedCatalogStore.reconcileLocalReferences(this);List<UnifiedCatalogStore.Entry> favorites=new ArrayList<>();for(UnifiedCatalogStore.Entry e:snapshot.entries())if(e.favorite)favorites.add(e);libraryFacets=UnifiedLibraryFilter.facets(favorites);UnifiedLibraryFilter.Spec spec=librarySpec.copy();spec.text=libraryQuery;spec.favoriteOnly=false;List<UnifiedCatalogStore.Entry> visible=UnifiedLibraryFilter.apply(favorites,spec);count.setText(visible.size()+(visible.size()==favorites.size()?LocalizedText.ui(" 本"):" / "+favorites.size()+LocalizedText.ui(" 本")));list.setAdapter(new UnifiedComicCollectionAdapter(this,collectionMode,visible,this::open));restoreListPosition(list,0);}
    private void refreshLibrary(boolean force){final int id=serial;if(!force&&prefs.getBoolean("libraryRefreshed",false))return;prefs.edit().putBoolean("libraryRefreshed",true).apply();pending=worker.submit(()->{try{if(BridgeStore.paired(this)){BridgeClient.device(this);UnifiedCatalogStore.refreshDesktop(this);try{FavoriteCacheStore.syncFromDesktop(this,false,null);}catch(Exception ignored){}try{ShelfStore.syncWithDesktop(this);}catch(Exception ignored){}}if(RemoteConfigStore.load(this).configured()){try{RemoteLibraryClient client=new RemoteLibraryClient(this);UnifiedCatalogStore.refreshRemote(this);FavoriteCacheStore.Snapshot f=FavoriteCacheStore.fromRemote(client.favorites());FavoriteCacheStore.save(this,f.items,false);if(ShelfStore.load(this).activeShelves().isEmpty())try{ShelfStore.save(this,ShelfStore.fromRemote(client.shelves()));}catch(Exception ignored){}}catch(Exception ignored){}}runOnUiThread(()->{if(id==serial&&!isDestroyed())show();});}catch(Exception ignored){}});}
    private void chooseCollectionMode(){String[] labels={"列表","网格 · 大（2列）","网格 · 中（3列）","网格 · 小（5列）"};int[] modes={0,2,3,5};int checked=0;for(int i=0;i<modes.length;i++)if(modes[i]==collectionMode)checked=i;new AlertDialog.Builder(this).setTitle(LocalizedText.ui("显示方式")).setSingleChoiceItems(labels,checked,(d,which)->{collectionMode=modes[which];prefs.edit().putInt("collectionMode",collectionMode).apply();d.dismiss();show();}).show();}

    private void shelves(){LinearLayout p=page(false);titleRow(p,"书架",compact("返回",v->{showingShelves=false;show();}),compact("＋",v->createShelf()),compact("▦",v->chooseCollectionMode()));ShelfStore.Snapshot snapshot=ShelfStore.load(this);List<ShelfStore.Shelf> shelves=snapshot.activeShelves();if(shelves.isEmpty()){TextView empty=Ui.text(this,"还没有书架",15,Ui.MUTED,false);empty.setGravity(Gravity.CENTER);empty.setPadding(0,Ui.dp(this,80),0,Ui.dp(this,16));p.addView(empty);p.addView(compact("新建书架",v->createShelf()));if(BridgeStore.paired(this))syncShelves();return;}ShelfStore.Shelf active=null;for(ShelfStore.Shelf s:shelves)if(s.id.equals(activeShelfId)){active=s;break;}if(active==null)active=shelves.get(0);activeShelfId=active.id;prefs.edit().putString("activeShelfId",activeShelfId).apply();HorizontalScrollView scroller=new HorizontalScrollView(this);LinearLayout tabs=new LinearLayout(this);tabs.setPadding(0,Ui.dp(this,6),0,Ui.dp(this,4));for(ShelfStore.Shelf s:shelves){Button b=compact(s.name+(s.id.equals(activeShelfId)?" ✓":""),v->{activeShelfId=s.id;prefs.edit().putString("activeShelfId",activeShelfId).apply();show();});LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-2,-2);lp.setMargins(0,0,Ui.dp(this,6),0);tabs.addView(b,lp);}scroller.addView(tabs);p.addView(scroller);LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.addView(Ui.text(this,active.activeItems().size()+" 本",13,Ui.MUTED,false),new LinearLayout.LayoutParams(0,-2,1));ShelfStore.Shelf selected=active;bar.addView(compact("重命名",v->renameShelf(selected)));Ui.gap(bar,this,6);bar.addView(compact("删除",v->deleteShelf(selected)));p.addView(bar);RecyclerView list=collection(p,collectionMode);List<UnifiedCatalogStore.Entry> entries=new ArrayList<>();UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(this);for(ShelfStore.Item item:active.activeItems()){UnifiedCatalogStore.Entry e=catalog.byId.get(item.comicId);if(e==null){e=new UnifiedCatalogStore.Entry(item.comicId,item.title,item.author);e.canonicalAuthor=item.canonicalAuthor;e.tags.addAll(item.tags);e.categories.addAll(item.categories);e.finished=item.finished;e.knownPictures=item.knownPictures;e.inShelf=true;}entries.add(e);}list.setAdapter(new UnifiedComicCollectionAdapter(this,collectionMode,entries,this::open));restoreListPosition(list,0);if(BridgeStore.paired(this))syncShelves();}
    private void createShelf(){final EditText input=new EditText(this);input.setHint(LocalizedText.ui("书架名称"));Ui.styleField(input,this);new AlertDialog.Builder(this).setTitle(LocalizedText.ui("新建书架")).setView(input).setNegativeButton(LocalizedText.ui("取消"),null).setPositiveButton(LocalizedText.ui("创建"),(d,w)->{try{ShelfStore.Shelf shelf=ShelfStore.create(this,input.getText().toString());activeShelfId=shelf.id;prefs.edit().putString("activeShelfId",activeShelfId).apply();syncShelves();show();}catch(Exception e){Toast.makeText(this,e.getMessage(),Toast.LENGTH_LONG).show();}}).show();}
    private void renameShelf(ShelfStore.Shelf shelf){final EditText input=new EditText(this);input.setText(shelf.name);Ui.styleField(input,this);new AlertDialog.Builder(this).setTitle(LocalizedText.ui("重命名书架")).setView(input).setNegativeButton(LocalizedText.ui("取消"),null).setPositiveButton(LocalizedText.ui("保存"),(d,w)->{try{ShelfStore.rename(this,shelf.id,input.getText().toString());syncShelves();show();}catch(Exception e){Toast.makeText(this,e.getMessage(),Toast.LENGTH_LONG).show();}}).show();}
    private void deleteShelf(ShelfStore.Shelf shelf){new AlertDialog.Builder(this).setTitle(LocalizedText.ui("删除“")+shelf.name+"”？").setMessage(LocalizedText.ui("只删除书架，不删除漫画。")) .setNegativeButton(LocalizedText.ui("取消"),null).setPositiveButton(LocalizedText.ui("删除"),(d,w)->{ShelfStore.delete(this,shelf.id);activeShelfId="";syncShelves();show();}).show();}
    private void syncShelves(){if(!BridgeStore.paired(this))return;worker.submit(()->{try{BridgeClient.device(this);ShelfStore.syncWithDesktop(this);runOnUiThread(()->{if(showingShelves&&!isDestroyed())show();});}catch(Exception ignored){}});}

    private void recommendations(){
        LinearLayout p=page(true);
        RecommendationProgressPanel progress=new RecommendationProgressPanel(this,()->{if(current==1&&!isDestroyed()&&!isFinishing())show();});
        Button preferences=compact("画像 / 调整",v->startActivity(new Intent(this,RecommendationStyleActivity.class)));
        ImageButton refresh=Ui.iconButton(this,R.drawable.ic_refresh_24,"重新生成手机推荐",v->refreshRecommendations(progress));
        titleRow(p,"为你推荐",preferences,refresh);
        p.addView(progress);

        NativeRecommendationStore.Snapshot stored=NativeRecommendationStore.load(this);
        NativeRecommendationStore.Snapshot snapshot=RecommendationPolicyStore.applyLocalPolicy(this,stored);
        PortableRecommendationPackageStore.Snapshot portable=PortableRecommendationPackageStore.load(this);

        LinearLayout statusCard=SettingsRow.panel(this,null);
        statusCard.addView(SettingsRow.statusLine(this,"运行节点",Ui.text(this,"Android 本机",12,Ui.TEXT,true)));
        statusCard.addView(SettingsRow.statusLine(this,"当前 Cycle",Ui.text(this,stored.cycleId.isEmpty()?"尚未生成":stored.cycleId.substring(0,Math.min(12,stored.cycleId.length())),12,Ui.MUTED,true)));
        statusCard.addView(SettingsRow.statusLine(this,"候选基础",Ui.text(this,portable.available()?portable.candidates.size()+" 个 · "+portable.reservoirGeneration.substring(0,Math.min(8,portable.reservoirGeneration.length())):"尚未同步",12,Ui.MUTED,true)));
        statusCard.addView(SettingsRow.statusLine(this,"本次 Session",Ui.text(this,RecommendationEvidenceStore.sessionCount(this)+" 条行为 · 仅手机",12,Ui.MUTED,true)));
        p.addView(statusCard);

        if(!snapshot.available()){
            TextView t=Ui.text(this,stored.available()?"当前候选已被本机反馈或屏蔽规则耗尽。":"还没有手机本地推荐周期。",14,Ui.MUTED,false);
            t.setPadding(0,Ui.dp(this,12),0,Ui.dp(this,10));p.addView(t);
            boolean canRun=PicaClient.available(this)||portable.available();
            if(canRun){
                p.addView(compact("生成手机推荐",v->{NativeRecommendationJobs.refresh(this);progress.begin();}));
            }else if(BridgeStore.paired(this)){
                p.addView(compact("同步候选基础",v->startActivity(new Intent(this,RecommendationSyncActivity.class))));
            }else{
                p.addView(compact("连接电脑或配置在线来源",v->startActivity(new Intent(this,PairingActivity.class))));
            }
            return;
        }

        TextView sourceView=Ui.text(this,"手机独立排序 · Lifetime / Recent / Session / Explicit"+(portable.available()?" · 已接入同步候选基础":""),12,Ui.MUTED,false);
        sourceView.setPadding(0,0,0,Ui.dp(this,6));p.addView(sourceView);
        LinearLayout pager=new LinearLayout(this);pager.setGravity(Gravity.CENTER_VERTICAL);
        pager.addView(compact("上一批",v->switchHomeRecommendationBatch(-1)),new LinearLayout.LayoutParams(0,-2,1));
        recommendationBatchLabel=Ui.text(this,"",13,Ui.MUTED,false);recommendationBatchLabel.setGravity(Gravity.CENTER);pager.addView(recommendationBatchLabel,new LinearLayout.LayoutParams(0,-1,1));
        pager.addView(compact("下一批",v->switchHomeRecommendationBatch(1)),new LinearLayout.LayoutParams(0,-2,1));
        p.addView(pager);

        recommendationCatalog=UnifiedCatalogStore.load(this);
        recommendationBatchList=new LinearLayout(this);recommendationBatchList.setOrientation(LinearLayout.VERTICAL);p.addView(recommendationBatchList);
        renderHomeRecommendationBatch(snapshot);
        NativeRecommendationStore.markSeen(this,snapshot.current());
    }

    private void switchHomeRecommendationBatch(int delta){
        if(recommendationBatchList==null||recommendationBatchLabel==null)return;
        RecommendationPolicyStore.moveVisibleBatch(this,delta);
        NativeRecommendationStore.Snapshot visible=RecommendationPolicyStore.applyLocalPolicy(this,NativeRecommendationStore.load(this));
        renderHomeRecommendationBatch(visible);
        NativeRecommendationStore.markSeen(this,visible.current());
    }

    private void renderHomeRecommendationBatch(NativeRecommendationStore.Snapshot snapshot){
        if(recommendationBatchList==null||recommendationBatchLabel==null)return;
        recommendationBatchLabel.setText(LocalizedText.ui("第 ")+(snapshot.batchIndex+1)+" / "+snapshot.batches.size()+LocalizedText.ui(" 批"));
        recommendationBatchList.removeAllViews();
        UnifiedCatalogStore.Snapshot catalog=recommendationCatalog==null?UnifiedCatalogStore.load(this):recommendationCatalog;
        for(NativeRecommendationStore.Item item:snapshot.current()){
            UnifiedCatalogStore.Entry e=catalog.byId.get(item.comicId);
            if(e==null){e=new UnifiedCatalogStore.Entry(item.comicId,item.title,item.author);e.tags.addAll(item.tags);e.categories.addAll(item.categories);}
            LinearLayout card=Ui.card(this);card.setOrientation(LinearLayout.HORIZONTAL);
            ImageView cover=new ImageView(this);cover.setScaleType(ImageView.ScaleType.CENTER_CROP);cover.setBackgroundColor(Ui.PLACEHOLDER);card.addView(cover,new LinearLayout.LayoutParams(Ui.dp(this,86),Ui.dp(this,122)));
            LinearLayout copy=new LinearLayout(this);copy.setOrientation(LinearLayout.VERTICAL);copy.setPadding(Ui.dp(this,12),0,0,0);
            copy.addView(Ui.text(this,item.title,16,Ui.TEXT,true));copy.addView(Ui.text(this,item.author,12,Ui.MUTED,false));
            TextView why=Ui.text(this,item.reason,12,Ui.PRIMARY,false);why.setPadding(0,Ui.dp(this,6),0,0);copy.addView(why);
            LinearLayout feedback=new LinearLayout(this);feedback.setPadding(0,Ui.dp(this,8),0,0);
            feedback.addView(compact("👍 喜欢",v->recommendationFeedback(item,"like")));Ui.gap(feedback,this,6);
            feedback.addView(compact("👎 不喜欢",v->recommendationFeedback(item,"dislike")));Ui.gap(feedback,this,6);
            UnifiedCatalogStore.Entry target=e;
            feedback.addView(compact("⚙ 调节",v->RecommendationItemControlDialog.show(this,target,this::show)));copy.addView(feedback);
            card.addView(copy,new LinearLayout.LayoutParams(0,-2,1));card.setOnClickListener(v->openRecommendation(target));CoverRepository.load(this,cover,e,Ui.PLACEHOLDER);recommendationBatchList.addView(card);
        }
    }

    private void refreshRecommendations(RecommendationProgressPanel progress){
        PortableRecommendationPackageStore.Snapshot portable=PortableRecommendationPackageStore.load(this);
        if(PicaClient.available(this)||portable.available()){
            NativeRecommendationJobs.refresh(this);
            progress.begin();
            Toast.makeText(this,LocalizedText.ui("手机正在独立生成新的推荐周期"),Toast.LENGTH_SHORT).show();
            return;
        }
        if(BridgeStore.paired(this)){
            Toast.makeText(this,LocalizedText.ui("先同步候选基础；同步不会替换当前手机推荐周期"),Toast.LENGTH_LONG).show();
            startActivity(new Intent(this,RecommendationSyncActivity.class));
            return;
        }
        Toast.makeText(this,LocalizedText.ui("请先连接电脑或配置可用的在线来源"),Toast.LENGTH_LONG).show();
    }

    private void recommendationFeedback(NativeRecommendationStore.Item item,String sentiment){RecommendationFeedbackStore.setSentiment(this,item.comicId,sentiment);if(!RecommendationFeedbackStore.askReasons(this)){show();return;}String[] labels={"画风","题材 / 标签","作者","角色 / IP","已经看过","推荐太重复"};String[] keys={"style","topic","author","character","already_seen","repetitive"};boolean[] checked=new boolean[labels.length];new AlertDialog.Builder(this).setTitle("like".equals(sentiment)?LocalizedText.ui("为什么喜欢？（可选）"):LocalizedText.ui("为什么不喜欢？（可选）")).setMultiChoiceItems(labels,checked,(d,which,value)->checked[which]=value).setNegativeButton(LocalizedText.ui("跳过"),(d,w)->show()).setPositiveButton(LocalizedText.ui("保存原因"),(d,w)->{List<String> reasons=new ArrayList<>();for(int i=0;i<keys.length;i++)if(checked[i])reasons.add(keys[i]);RecommendationFeedbackStore.setReasons(this,item.comicId,sentiment,reasons);if(reasons.contains("already_seen"))RecommendationPolicyStore.setItemDisposition(this,item.comicId,"already_seen",true,30);if(reasons.contains("repetitive"))RecommendationPolicyStore.setItemDisposition(this,item.comicId,"duplicate",true,30);show();}).setOnCancelListener(d->show()).show();}

    private void openOnlineSource(String sourceMode){
        Intent i=new Intent(this,PicaBrowseActivity.class);
        i.putExtra("sourceMode",sourceMode);
        startActivity(i);
    }

    private void onlineEntry(){
        LinearLayout p=page(true);titleRow(p,"在线");
        boolean pica=PicaClient.available(this);
        boolean eh=EhClient.accountAvailable(this);
        EhCapabilityStore.Snapshot exh=EhCapabilityStore.load(this);
        p.addView(SettingsRow.row(this,"全部来源","Pica + E-H"+(exh.available()?" + ExH":""),v->openOnlineSource("all")));
        p.addView(SettingsRow.row(this,"Pica",pica?"可用":"未登录",v->openOnlineSource("pica")));
        p.addView(SettingsRow.row(this,"E-Hentai",eh?"账号已连接":"游客可浏览",v->openOnlineSource("eh")));
        p.addView(SettingsRow.row(this,"ExHentai",exh.available()?"可用":"可选扩展",v->openOnlineSource("exh")));
        p.addView(SettingsRow.row(this,"账号与来源","管理登录与连接",v->startActivity(new Intent(this,AccountSourcesActivity.class))));
    }

    private void settingsEntry(){
        LinearLayout p=page(true);titleRow(p,"设置");
        boolean paired=BridgeStore.paired(this);
        boolean pica=PicaAccountStore.load(this).configured();
        boolean eh=EhAccountStore.load(this).configured();
        p.addView(SettingsRow.row(this,getString(R.string.settings_language),getString(R.string.settings_language_summary),v->startActivity(new Intent(this,LanguageActivity.class))));
        p.addView(SettingsRow.row(this,"账号与来源",(pica||eh)?"本机已配置":"",v->startActivity(new Intent(this,AccountSourcesActivity.class))));
        p.addView(SettingsRow.row(this,"连接电脑",paired?"已连接":"未连接",v->startActivity(new Intent(this,PairingActivity.class))));
        p.addView(SettingsRow.row(this,"存储与下载","目录 / WebDAV / 下载策略",v->startActivity(new Intent(this,StorageHubActivity.class))));
        p.addView(SettingsRow.row(this,"个性化",ThemeStore.label(this),v->startActivity(new Intent(this,AppearanceActivity.class))));
        p.addView(SettingsRow.row(this,"推荐与画风",paired?"独立运行 · 可同步":"本机独立运行",v->startActivity(new Intent(this,RecommendationStyleActivity.class))));
        p.addView(SettingsRow.row(this,"数据与缓存","缓存与本地数据",v->startActivity(new Intent(this,StorageSettingsActivity.class))));
        p.addView(SettingsRow.row(this,"软件更新","检查并安装正式更新",v->startActivity(new Intent(this,UpdateActivity.class))));
        p.addView(SettingsRow.row(this,"支持项目","爱发电 / GitHub · 支持开源开发",v->startActivity(new Intent(this,SupportActivity.class))));
        p.addView(SettingsRow.row(this,"关于","版本 / 开源 / 使用说明",v->startActivity(new Intent(this,AboutActivity.class))));
    }
}
