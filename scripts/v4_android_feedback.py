from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(rel): return (ROOT/rel).read_text(encoding='utf-8')
def write(rel,s): (ROOT/rel).write_text(s,encoding='utf-8')
def patch(rel,old,new):
    s=read(rel); c=s.count(old)
    if c!=1: raise RuntimeError(f'{rel}: expected 1 anchor, got {c}: {old[:100]!r}')
    write(rel,s.replace(old,new,1))

engine='mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java'
patch(engine,
'''        UnifiedCatalogStore.Snapshot knownFavorites=UnifiedCatalogStore.reconcileLocalReferences(app);List<PicaClient.Comic> favorites=new ArrayList<>(picaFavorites);for(UnifiedCatalogStore.Entry known:knownFavorites.byId.values())if(known.favorite||known.inShelf||known.phoneDownloaded||known.desktopDownloaded||known.remoteAvailable){if("eh".equals(known.providerId))favorites.add(ehCatalogFavorite(known));else if(!favoriteByIdContains(picaFavorites,known.id))favorites.add(catalogSeed(known));}\n''',
'''        UnifiedCatalogStore.Snapshot knownFavorites=UnifiedCatalogStore.reconcileLocalReferences(app);List<PicaClient.Comic> favorites=new ArrayList<>();for(PicaClient.Comic comic:picaFavorites)if(!RecommendationFeedbackStore.isDisliked(app,comic.id))favorites.add(comic);for(UnifiedCatalogStore.Entry known:knownFavorites.byId.values())if((known.favorite||known.inShelf||known.phoneDownloaded||known.desktopDownloaded||known.remoteAvailable||RecommendationFeedbackStore.isLiked(app,known.id))&&!RecommendationFeedbackStore.isDisliked(app,known.id)){if("eh".equals(known.providerId))favorites.add(ehCatalogFavorite(known));else if(!favoriteByIdContains(favorites,known.id))favorites.add(catalogSeed(known));}\n''')
patch(engine,
'''        LinkedHashMap<String,Candidate> candidates=new LinkedHashMap<>();int requests=0,ehRequests=0,exhRequests=0;final int EH_MAX_REQUESTS=4,EXH_MAX_REQUESTS=2;EhClient ehClient=new EhClient(app);EhCapabilityStore.Snapshot exhCapability=EhAccountStore.load(app).configured()?EhCapabilityStore.refresh(app,false):EhCapabilityStore.load(app);boolean exhAvailable=exhCapability.available();List<EhClient.Comic> ehDiscovered=new ArrayList<>();Set<String> allFavoriteIds=new HashSet<>(favoriteById.keySet());for(UnifiedCatalogStore.Entry known:UnifiedCatalogStore.load(app).byId.values())if(known.favorite)allFavoriteIds.add(known.id);\n''',
'''        LinkedHashMap<String,Candidate> candidates=new LinkedHashMap<>();int requests=0,ehRequests=0,exhRequests=0;final int EH_MAX_REQUESTS=4,EXH_MAX_REQUESTS=2;EhClient ehClient=new EhClient(app);EhCapabilityStore.Snapshot exhCapability=EhAccountStore.load(app).configured()?EhCapabilityStore.refresh(app,false):EhCapabilityStore.load(app);boolean exhAvailable=exhCapability.available();List<EhClient.Comic> ehDiscovered=new ArrayList<>();Set<String> allFavoriteIds=new HashSet<>(favoriteById.keySet());for(UnifiedCatalogStore.Entry known:UnifiedCatalogStore.load(app).byId.values())if(known.favorite)allFavoriteIds.add(known.id);allFavoriteIds.addAll(RecommendationFeedbackStore.feedbackIds(app));\n''')

home='mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java'
patch(home,
'''for(NativeRecommendationStore.Item item:snapshot.current()){UnifiedCatalogStore.Entry e=catalog.byId.get(item.comicId);''',
'''for(NativeRecommendationStore.Item item:snapshot.current()){if(RecommendationFeedbackStore.hasFeedback(this,item.comicId))continue;UnifiedCatalogStore.Entry e=catalog.byId.get(item.comicId);''')
patch(home,
'''TextView why=Ui.text(this,item.reason,12,Ui.PRIMARY,false);why.setPadding(0,Ui.dp(this,6),0,0);copy.addView(why);card.addView(copy,new LinearLayout.LayoutParams(0,-2,1));''',
'''TextView why=Ui.text(this,item.reason,12,Ui.PRIMARY,false);why.setPadding(0,Ui.dp(this,6),0,0);copy.addView(why);LinearLayout feedback=new LinearLayout(this);feedback.setPadding(0,Ui.dp(this,8),0,0);feedback.addView(compact("👍 喜欢",v->recommendationFeedback(item,"like")));Ui.gap(feedback,this,6);feedback.addView(compact("👎 不喜欢",v->recommendationFeedback(item,"dislike")));copy.addView(feedback);card.addView(copy,new LinearLayout.LayoutParams(0,-2,1));''')
patch(home,
'''    private void onlineEntry(){LinearLayout p=page(true);titleRow(p,"在线");''',
'''    private void recommendationFeedback(NativeRecommendationStore.Item item,String sentiment){RecommendationFeedbackStore.setSentiment(this,item.comicId,sentiment);if(!RecommendationFeedbackStore.askReasons(this)){show();return;}String[] labels={"画风","题材 / 标签","作者","角色 / IP","已经看过","推荐太重复"};String[] keys={"style","topic","author","character","already_seen","repetitive"};boolean[] checked=new boolean[labels.length];new AlertDialog.Builder(this).setTitle("like".equals(sentiment)?"为什么喜欢？（可选）":"为什么不喜欢？（可选）").setMultiChoiceItems(labels,checked,(d,which,value)->checked[which]=value).setNegativeButton("跳过",(d,w)->show()).setPositiveButton("保存原因",(d,w)->{List<String> reasons=new ArrayList<>();for(int i=0;i<keys.length;i++)if(checked[i])reasons.add(keys[i]);RecommendationFeedbackStore.setReasons(this,item.comicId,sentiment,reasons);show();}).setOnCancelListener(d->show()).show();}\n\n    private void onlineEntry(){LinearLayout p=page(true);titleRow(p,"在线");''')

write('test/unit/recommendation-v4-android-feedback.test.ts',r'''import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const root='mobile/android-alpha2/app/src/main/java/com/picalibrary/android/'
const read=(file:string)=>fs.readFileSync(root+file,'utf8')

describe('Recommendation V4 Android feedback parity',()=>{
  it('stores sentiment immediately and keeps reasons optional',()=>{
    const store=read('RecommendationFeedbackStore.java')
    const home=read('HomeActivity.java')
    const settings=read('SettingsActivity.java')
    expect(store).toContain('setSentiment(Context context,String comicId,String sentiment)')
    expect(store).toContain('remove(REASONS+id)')
    expect(store).toContain('askReasons(Context context)')
    const start=home.indexOf('private void recommendationFeedback(')
    const method=home.slice(start,home.indexOf('private void onlineEntry()',start))
    expect(method.indexOf('RecommendationFeedbackStore.setSentiment')).toBeGreaterThanOrEqual(0)
    expect(method.indexOf('RecommendationFeedbackStore.setSentiment')).toBeLessThan(method.indexOf('RecommendationFeedbackStore.askReasons'))
    expect(method).toContain('setNegativeButton("跳过"')
    expect(settings).toContain('"推荐反馈原因"')
    expect(settings).toContain('RecommendationFeedbackStore.setAskReasons')
  })

  it('uses likes as native seeds and suppresses every explicitly feedbacked item',()=>{
    const engine=read('NativeRecommendationEngine.java')
    const home=read('HomeActivity.java')
    expect(engine).toContain('RecommendationFeedbackStore.isLiked(app,known.id)')
    expect(engine).toContain('!RecommendationFeedbackStore.isDisliked(app,known.id)')
    expect(engine).toContain('allFavoriteIds.addAll(RecommendationFeedbackStore.feedbackIds(app))')
    expect(home).toContain('if(RecommendationFeedbackStore.hasFeedback(this,item.comicId))continue;')
  })
})
''')

for rel in ['scripts/v4_android_feedback.py','.github/workflows/v4-android-feedback.yml']:
    try:(ROOT/rel).unlink()
    except FileNotFoundError:pass
print('Android Recommendation V4 feedback parity integrated')
