import fs from 'node:fs'

function replaceOnce(file,before,after){
  const source=fs.readFileSync(file,'utf8')
  if(source.includes(after)) return
  const first=source.indexOf(before)
  if(first<0) throw new Error(`Alpha8.4.2 robustness anchor missing in ${file}: ${before.slice(0,160)}`)
  if(source.indexOf(before,first+before.length)>=0) throw new Error(`Alpha8.4.2 robustness anchor not unique in ${file}`)
  fs.writeFileSync(file,source.slice(0,first)+after+source.slice(first+before.length),'utf8')
}

const file='mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java'

replaceOnce(
  file,
  '    private final int[] tabScrollY=new int[4],tabListPosition=new int[4],tabListOffset=new int[4];',
  '    private final int[] tabScrollY=new int[4],tabListPosition=new int[4],tabListOffset=new int[4];private ScrollView activeScroll;private RecyclerView activeList;private int activeViewportTab=-1;'
)

replaceOnce(
  file,
  '    private void show(){++serial;if(pending!=null)pending.cancel(true);pending=null;body.removeAllViews();updateNav();',
  '    private void show(){captureCurrentViewport();++serial;if(pending!=null)pending.cancel(true);pending=null;body.removeAllViews();activeScroll=null;activeList=null;activeViewportTab=-1;updateNav();'
)

replaceOnce(
  file,
  '    private LinearLayout page(boolean scroll){LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setBackgroundColor(Ui.BG);p.setPadding(Ui.dp(this,12),Ui.dp(this,8),Ui.dp(this,12),Ui.dp(this,8));if(scroll){final int tab=current;ScrollView s=new ScrollView(this);s.setBackgroundColor(Ui.BG);s.setOnScrollChangeListener((v,sx,sy,ox,oy)->tabScrollY[tab]=sy);s.addView(p);body.addView(s,new FrameLayout.LayoutParams(-1,-1));s.post(()->s.scrollTo(0,Math.max(0,tabScrollY[tab])));}else body.addView(p,new FrameLayout.LayoutParams(-1,-1));return p;}',
  '    private LinearLayout page(boolean scroll){LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setBackgroundColor(Ui.BG);p.setPadding(Ui.dp(this,12),Ui.dp(this,8),Ui.dp(this,12),Ui.dp(this,8));if(scroll){final int tab=current;ScrollView s=new ScrollView(this);activeScroll=s;activeList=null;activeViewportTab=tab;s.setBackgroundColor(Ui.BG);s.addView(p);body.addView(s,new FrameLayout.LayoutParams(-1,-1));s.post(()->s.scrollTo(0,Math.max(0,tabScrollY[tab])));}else{activeScroll=null;activeList=null;activeViewportTab=-1;body.addView(p,new FrameLayout.LayoutParams(-1,-1));}return p;}'
)

replaceOnce(
  file,
  '    private RecyclerView collection(LinearLayout p,int mode){final int tab=current;RecyclerView v=new RecyclerView(this);v.setClipToPadding(false);v.setPadding(0,Ui.dp(this,4),0,Ui.dp(this,16));setCollectionLayout(v,mode);v.addOnScrollListener(new RecyclerView.OnScrollListener(){@Override public void onScrolled(RecyclerView recycler,int dx,int dy){rememberListPosition(recycler,tab);}});p.addView(v,new LinearLayout.LayoutParams(-1,0,1));return v;}\n    private void rememberListPosition(RecyclerView v,int tab){RecyclerView.LayoutManager raw=v.getLayoutManager();if(!(raw instanceof LinearLayoutManager))return;LinearLayoutManager lm=(LinearLayoutManager)raw;int position=lm.findFirstVisibleItemPosition();if(position<0)return;View first=lm.findViewByPosition(position);tabListPosition[tab]=position;tabListOffset[tab]=first==null?0:first.getTop()-v.getPaddingTop();}\n    private void restoreListPosition(RecyclerView v,int tab){int position=Math.max(0,tabListPosition[tab]),offset=tabListOffset[tab];v.post(()->{RecyclerView.LayoutManager raw=v.getLayoutManager();if(raw instanceof LinearLayoutManager)((LinearLayoutManager)raw).scrollToPositionWithOffset(position,offset);});}\n    private void resetTabScroll(int tab){if(tab<0||tab>=4)return;tabScrollY[tab]=0;tabListPosition[tab]=0;tabListOffset[tab]=0;}',
  '    private RecyclerView collection(LinearLayout p,int mode){final int tab=current;RecyclerView v=new RecyclerView(this);activeScroll=null;activeList=v;activeViewportTab=tab;v.setClipToPadding(false);v.setPadding(0,Ui.dp(this,4),0,Ui.dp(this,16));setCollectionLayout(v,mode);p.addView(v,new LinearLayout.LayoutParams(-1,0,1));return v;}\n    private void rememberListPosition(RecyclerView v,int tab){RecyclerView.LayoutManager raw=v.getLayoutManager();if(!(raw instanceof LinearLayoutManager))return;LinearLayoutManager lm=(LinearLayoutManager)raw;int position=lm.findFirstVisibleItemPosition();if(position<0)return;View first=lm.findViewByPosition(position);tabListPosition[tab]=position;tabListOffset[tab]=first==null?0:first.getTop()-v.getPaddingTop();}\n    private void captureCurrentViewport(){int tab=activeViewportTab;if(tab<0||tab>=4)return;if(activeScroll!=null){tabScrollY[tab]=Math.max(0,activeScroll.getScrollY());return;}if(activeList!=null)rememberListPosition(activeList,tab);}\n    private void restoreListPosition(RecyclerView v,int tab){int position=Math.max(0,tabListPosition[tab]),offset=tabListOffset[tab];v.post(()->{RecyclerView.LayoutManager raw=v.getLayoutManager();if(raw instanceof LinearLayoutManager)((LinearLayoutManager)raw).scrollToPositionWithOffset(position,offset);});}\n    private void resetTabScroll(int tab){if(tab<0||tab>=4)return;tabScrollY[tab]=0;tabListPosition[tab]=0;tabListOffset[tab]=0;if(activeViewportTab==tab){activeViewportTab=-1;activeScroll=null;activeList=null;}}'
)

replaceOnce(
  file,
  '    @Override protected void onSaveInstanceState(Bundle out){out.putInt("tab",current);',
  '    @Override protected void onSaveInstanceState(Bundle out){captureCurrentViewport();out.putInt("tab",current);'
)

replaceOnce(
  file,
  '    @Override protected void onDestroy(){++serial;',
  '    @Override protected void onPause(){captureCurrentViewport();super.onPause();}\n    @Override protected void onDestroy(){++serial;'
)

console.log('Alpha8.4.2 robust viewport persistence patch applied')
