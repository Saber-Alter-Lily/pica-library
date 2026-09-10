import fs from 'node:fs'

function replaceOnce(file,before,after){
    const source=fs.readFileSync(file,'utf8')
    if(source.includes(after))return
    const first=source.indexOf(before)
    if(first<0)throw new Error(`Alpha8.4 recommendation patch anchor missing in ${file}: ${before.slice(0,120)}`)
    if(source.indexOf(before,first+before.length)>=0)throw new Error(`Alpha8.4 recommendation patch anchor is not unique in ${file}`)
    fs.writeFileSync(file,source.slice(0,first)+after+source.slice(first+before.length),'utf8')
}

const base='mobile/android-alpha2/app/src/main/java/com/picalibrary/android/'

replaceOnce(
    base+'NativeRecommendationStore.java',
    '    static synchronized void invalidateForFavoriteChange(Context context){',
    '    static boolean favoriteFingerprintMatches(Snapshot snapshot,String fingerprint){return snapshot!=null&&snapshot.available()&&fingerprint!=null&&!fingerprint.isEmpty()&&fingerprint.equals(snapshot.favoriteFingerprint);}\n    static synchronized void markFavoriteChange(Context context){Snapshot current=load(context);if(!current.available())return;markCurrent(current);current.readiness="STALE_FAVORITES";save(context,current);}\n    static synchronized void invalidateIfFavoriteFingerprintChanged(Context context,String fingerprint){Snapshot current=load(context);if(favoriteFingerprintMatches(current,fingerprint))return;markFavoriteChange(context);}\n    static synchronized void invalidateForFavoriteChange(Context context){'
)

replaceOnce(
    base+'FavoriteCacheStore.java',
    'UnifiedCatalogStore.reconcileLocalReferences(context);NativeRecommendationStore.invalidateForFavoriteChange(context);',
    'UnifiedCatalogStore.reconcileLocalReferences(context);NativeRecommendationStore.markFavoriteChange(context);'
)

replaceOnce(
    base+'UnifiedComicDetailActivity.java',
    'picaFavoriteState=desired;NativeRecommendationStore.invalidateForFavoriteChange(this);runOnUiThread',
    'picaFavoriteState=desired;runOnUiThread'
)

replaceOnce(
    base+'HomeActivity.java',
    '    private void recommendations(){LinearLayout p=page(true);titleRow(p,"为你推荐",compact("↻",v->{NativeRecommendationJobs.refresh(this);Toast.makeText(this,"正在后台更新推荐",Toast.LENGTH_SHORT).show();}));',
    '    private void recommendations(){LinearLayout p=page(true);RecommendationProgressPanel progress=new RecommendationProgressPanel(this,()->{if(current==1&&!isDestroyed()&&!isFinishing())show();});titleRow(p,"为你推荐",compact("↻",v->{NativeRecommendationJobs.refresh(this);progress.begin();}));p.addView(progress);'
)

replaceOnce(
    base+'HomeActivity.java',
    'p.addView(compact("生成推荐",v->{NativeRecommendationJobs.refresh(this);Toast.makeText(this,"已加入后台任务",Toast.LENGTH_SHORT).show();}));return;}',
    'p.addView(compact("生成推荐",v->{NativeRecommendationJobs.refresh(this);progress.begin();}));return;}'
)

replaceOnce(
    base+'HomeActivity.java',
    '这也是我不断更新的动力ヽ(✿ﾟ▽ﾟ)ノ\\n打赏后可触发小惊喜。",13,Ui.MUTED,false);',
    '这也是我不断更新的动力ヽ(✿ﾟ▽ﾟ)ノ",13,Ui.MUTED,false);'
)

replaceOnce(
    base+'HomeActivity.java',
    'LinearLayout support=new LinearLayout(this);support.setPadding(0,Ui.dp(this,10),0,0);support.addView(compact("⭐ 给项目 Star",v->openUrl(REPO_URL)),new LinearLayout.LayoutParams(-1,-2));about.addView(support);',
    'TextView starHint=Ui.text(this,"GitHub 收藏项目有小惊喜。",12.5f,Ui.PRIMARY,false);starHint.setPadding(0,Ui.dp(this,10),0,Ui.dp(this,4));about.addView(starHint);LinearLayout support=new LinearLayout(this);support.addView(compact("⭐ 给项目 Star",v->openUrl(REPO_URL)),new LinearLayout.LayoutParams(-1,-2));about.addView(support);'
)

replaceOnce(
    'web/alpha8-product.js',
    '<br><strong>打赏后还可能触发一个小惊喜。</strong></p><div class="a83-support-grid">',
    '</p><div class="a83-support-grid">'
)

replaceOnce(
    'web/alpha8-product.js',
    '<div class="a83-row"><button type="button" id="a83-star">⭐ 给项目 Star</button></div>`',
    '<p class="status">GitHub 收藏项目有小惊喜。</p><div class="a83-row"><button type="button" id="a83-star">⭐ 给项目 Star</button></div>`'
)

console.log('Alpha8.4 recommendation recovery patch applied')
