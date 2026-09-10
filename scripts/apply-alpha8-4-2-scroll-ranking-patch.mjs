import fs from 'node:fs'

function replaceOnce(file,before,after){
  const source=fs.readFileSync(file,'utf8')
  if(source.includes(after)) return
  const first=source.indexOf(before)
  if(first<0) throw new Error(`Alpha8.4.2 patch anchor missing in ${file}: ${before.slice(0,140)}`)
  if(source.indexOf(before,first+before.length)>=0) throw new Error(`Alpha8.4.2 patch anchor not unique in ${file}`)
  fs.writeFileSync(file,source.slice(0,first)+after+source.slice(first+before.length),'utf8')
}

const base='mobile/android-alpha2/app/src/main/java/com/picalibrary/android/'

replaceOnce(
  base+'PicaClient.java',
  '    List<Comic> leaderboard() throws Exception {JSONObject data=request("GET","comics/leaderboard?tt=H24&ct=VC",null);return parseComics(data.optJSONArray("comics"));}',
  '    static String normalizeLeaderboardRange(String range){return "D7".equals(range)||"D30".equals(range)?range:"H24";}\n    List<Comic> leaderboard() throws Exception {return leaderboard("H24");}\n    List<Comic> leaderboard(String range) throws Exception {String tt=normalizeLeaderboardRange(range);JSONObject data=request("GET","comics/leaderboard?tt="+tt+"&ct=VC",null);return parseComics(data.optJSONArray("comics"));}'
)

replaceOnce(
  base+'HomeActivity.java',
  '    private String onlineMode="leaderboard",onlineKeyword="",onlineCategory="";private int onlinePage=1;',
  '    private String onlineMode="leaderboard",onlineKeyword="",onlineCategory="",leaderboardRange="H24";private int onlinePage=1;\n    private final int[] tabScrollY=new int[4],tabListPosition=new int[4],tabListOffset=new int[4];'
)

replaceOnce(
  base+'HomeActivity.java',
  'onlineCategory=saved.getString("onlineCategory","");onlinePage=saved.getInt("onlinePage",1);}',
  'onlineCategory=saved.getString("onlineCategory","");onlinePage=saved.getInt("onlinePage",1);leaderboardRange=PicaClient.normalizeLeaderboardRange(saved.getString("leaderboardRange","H24"));int[] sy=saved.getIntArray("tabScrollY"),sp=saved.getIntArray("tabListPosition"),so=saved.getIntArray("tabListOffset");if(sy!=null&&sy.length==4)System.arraycopy(sy,0,tabScrollY,0,4);if(sp!=null&&sp.length==4)System.arraycopy(sp,0,tabListPosition,0,4);if(so!=null&&so.length==4)System.arraycopy(so,0,tabListOffset,0,4);}'
)

replaceOnce(
  base+'HomeActivity.java',
  'out.putString("onlineCategory",onlineCategory);out.putInt("onlinePage",onlinePage);super.onSaveInstanceState(out);}',
  'out.putString("onlineCategory",onlineCategory);out.putInt("onlinePage",onlinePage);out.putString("leaderboardRange",leaderboardRange);out.putIntArray("tabScrollY",tabScrollY);out.putIntArray("tabListPosition",tabListPosition);out.putIntArray("tabListOffset",tabListOffset);super.onSaveInstanceState(out);}'
)

replaceOnce(
  base+'HomeActivity.java',
  '    private LinearLayout page(boolean scroll){LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setBackgroundColor(Ui.BG);p.setPadding(Ui.dp(this,12),Ui.dp(this,8),Ui.dp(this,12),Ui.dp(this,8));if(scroll){ScrollView s=new ScrollView(this);s.setBackgroundColor(Ui.BG);s.addView(p);body.addView(s,new FrameLayout.LayoutParams(-1,-1));}else body.addView(p,new FrameLayout.LayoutParams(-1,-1));return p;}',
  '    private LinearLayout page(boolean scroll){LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setBackgroundColor(Ui.BG);p.setPadding(Ui.dp(this,12),Ui.dp(this,8),Ui.dp(this,12),Ui.dp(this,8));if(scroll){final int tab=current;ScrollView s=new ScrollView(this);s.setBackgroundColor(Ui.BG);s.setOnScrollChangeListener((v,sx,sy,ox,oy)->tabScrollY[tab]=sy);s.addView(p);body.addView(s,new FrameLayout.LayoutParams(-1,-1));s.post(()->s.scrollTo(0,Math.max(0,tabScrollY[tab])));}else body.addView(p,new FrameLayout.LayoutParams(-1,-1));return p;}'
)

replaceOnce(
  base+'HomeActivity.java',
  '    private RecyclerView collection(LinearLayout p,int mode){RecyclerView v=new RecyclerView(this);v.setClipToPadding(false);v.setPadding(0,Ui.dp(this,4),0,Ui.dp(this,16));setCollectionLayout(v,mode);p.addView(v,new LinearLayout.LayoutParams(-1,0,1));return v;}',
  '    private RecyclerView collection(LinearLayout p,int mode){final int tab=current;RecyclerView v=new RecyclerView(this);v.setClipToPadding(false);v.setPadding(0,Ui.dp(this,4),0,Ui.dp(this,16));setCollectionLayout(v,mode);v.addOnScrollListener(new RecyclerView.OnScrollListener(){@Override public void onScrolled(RecyclerView recycler,int dx,int dy){rememberListPosition(recycler,tab);}});p.addView(v,new LinearLayout.LayoutParams(-1,0,1));return v;}\n    private void rememberListPosition(RecyclerView v,int tab){RecyclerView.LayoutManager raw=v.getLayoutManager();if(!(raw instanceof LinearLayoutManager))return;LinearLayoutManager lm=(LinearLayoutManager)raw;int position=lm.findFirstVisibleItemPosition();if(position<0)return;View first=lm.findViewByPosition(position);tabListPosition[tab]=position;tabListOffset[tab]=first==null?0:first.getTop()-v.getPaddingTop();}\n    private void restoreListPosition(RecyclerView v,int tab){int position=Math.max(0,tabListPosition[tab]),offset=tabListOffset[tab];v.post(()->{RecyclerView.LayoutManager raw=v.getLayoutManager();if(raw instanceof LinearLayoutManager)((LinearLayoutManager)raw).scrollToPositionWithOffset(position,offset);});}\n    private void resetTabScroll(int tab){if(tab<0||tab>=4)return;tabScrollY[tab]=0;tabListPosition[tab]=0;tabListOffset[tab]=0;}'
)

replaceOnce(
  base+'HomeActivity.java',
  'list.setAdapter(new UnifiedComicCollectionAdapter(this,collectionMode,visible,this::open));}',
  'list.setAdapter(new UnifiedComicCollectionAdapter(this,collectionMode,visible,this::open));restoreListPosition(list,0);}'
)

replaceOnce(
  base+'HomeActivity.java',
  'list.setAdapter(new UnifiedComicCollectionAdapter(this,collectionMode,entries,this::open));if(BridgeStore.paired(this))syncShelves();}',
  'list.setAdapter(new UnifiedComicCollectionAdapter(this,collectionMode,entries,this::open));restoreListPosition(list,0);if(BridgeStore.paired(this))syncShelves();}'
)

replaceOnce(
  base+'HomeActivity.java',
  'search.setOnEditorActionListener((v,id,event)->{if(id==EditorInfo.IME_ACTION_SEARCH){onlineKeyword=v.getText().toString().trim();onlineMode="search";onlinePage=1;show();return true;}return false;});',
  'search.setOnEditorActionListener((v,id,event)->{if(id==EditorInfo.IME_ACTION_SEARCH){onlineKeyword=v.getText().toString().trim();onlineMode="search";onlinePage=1;resetTabScroll(2);show();return true;}return false;});'
)

replaceOnce(
  base+'HomeActivity.java',
  'actions.addView(compact("收藏",v->{onlineMode="favorites";onlinePage=1;show();}),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(actions,this,6);actions.addView(compact("24h 排行",v->{onlineMode="leaderboard";onlinePage=1;show();}),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(actions,this,6);actions.addView(compact("分类",v->chooseOnlineCategory()),new LinearLayout.LayoutParams(0,-2,1));',
  'actions.addView(compact("收藏",v->{onlineMode="favorites";onlinePage=1;resetTabScroll(2);show();}),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(actions,this,6);actions.addView(compact("排行",v->chooseLeaderboardRange()),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(actions,this,6);actions.addView(compact("分类",v->chooseOnlineCategory()),new LinearLayout.LayoutParams(0,-2,1));'
)

replaceOnce(
  base+'HomeActivity.java',
  'else{comics=client.leaderboard();onlinePage=1;}',
  'else{comics=client.leaderboard(leaderboardRange);onlinePage=1;}'
)

replaceOnce(
  base+'HomeActivity.java',
  'list.setAdapter(new UnifiedComicCollectionAdapter(this,UnifiedComicCollectionAdapter.MODE_LIST,entries,this::open));if(pageCount>1){',
  'list.setAdapter(new UnifiedComicCollectionAdapter(this,UnifiedComicCollectionAdapter.MODE_LIST,entries,this::open));restoreListPosition(list,2);if(pageCount>1){'
)

replaceOnce(
  base+'HomeActivity.java',
  'private String onlineLabel(){if("favorites".equals(onlineMode))return "我的收藏";if("search".equals(onlineMode))return onlineKeyword;if("category".equals(onlineMode))return onlineCategory;return "24h 排行";}',
  'private String onlineLabel(){if("favorites".equals(onlineMode))return "我的收藏";if("search".equals(onlineMode))return onlineKeyword;if("category".equals(onlineMode))return onlineCategory;return "排行 · "+leaderboardRangeLabel();}\n    private String leaderboardRangeLabel(){if("D7".equals(leaderboardRange))return "7 天";if("D30".equals(leaderboardRange))return "30 天";return "24 小时";}\n    private void chooseLeaderboardRange(){String[] labels={"24 小时","7 天","30 天"};String[] values={"H24","D7","D30"};int checked="D7".equals(leaderboardRange)?1:"D30".equals(leaderboardRange)?2:0;new AlertDialog.Builder(this).setTitle("排行榜范围").setSingleChoiceItems(labels,checked,(d,which)->{leaderboardRange=values[which];onlineMode="leaderboard";onlinePage=1;resetTabScroll(2);d.dismiss();show();}).setNegativeButton("取消",null).show();}'
)

replaceOnce(
  base+'HomeActivity.java',
  'onlineCategory=values.get(i);onlineMode="category";onlinePage=1;show();',
  'onlineCategory=values.get(i);onlineMode="category";onlinePage=1;resetTabScroll(2);show();'
)

replaceOnce(
  base+'HomeActivity.java',
  'if(onlinePage>1){onlinePage--;show();}',
  'if(onlinePage>1){onlinePage--;resetTabScroll(2);show();}'
)
replaceOnce(
  base+'HomeActivity.java',
  'if(onlinePage<pageCount){onlinePage++;show();}',
  'if(onlinePage<pageCount){onlinePage++;resetTabScroll(2);show();}'
)

console.log('Alpha8.4.2 scroll persistence + leaderboard range patch applied')
