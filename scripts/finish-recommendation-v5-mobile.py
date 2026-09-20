from pathlib import Path

cycle = Path('src/recommendation-v3/cycle-coordinator-v3.ts')
text = cycle.read_text(encoding='utf-8')
if 'portableBundle(maxBatches' not in text:
    marker = '\n    current() {\n'
    if marker not in text:
        raise SystemExit('CycleCoordinator current() marker not found')
    method = r'''
    portableBundle(maxBatches = MAX_VISIBLE_BATCHES_PER_CYCLE) {
        const state = this.state()
        if (!state.activeCycleId)
            return {
                source: 'desktop-v5-portable-bundle',
                generatedAt: new Date().toISOString(),
                cycleId: null,
                policyRevision: new RecommendationPolicyStoreV5(this.database).state().revision,
                batches: []
            }
        const pool = this.pool(state.activeCycleId)
        if (!pool)
            return {
                source: 'desktop-v5-portable-bundle',
                generatedAt: new Date().toISOString(),
                cycleId: state.activeCycleId,
                policyRevision: new RecommendationPolicyStoreV5(this.database).state().revision,
                batches: []
            }
        const telemetry = pool.telemetry as {
            intentPlan?: RecommendationIntentV3[]
            rankedCandidates?: Array<Omit<RankedCandidateWithEvidenceV3, 'comic'>>
        }
        const catalogValues = this.database.listComics({ limit: 10000 })
        const catalog = new Map(catalogValues.map((comic) => [comic.comicId, comic]))
        const ranked = (telemetry.rankedCandidates ?? []).flatMap((item) => {
            const comic = catalog.get(item.comicId)
            return comic ? [{ ...item, comic }] : []
        })
        const policy = new RecommendationPolicyStoreV5(this.database).state()
        const eligibleRanked = filterCandidatesAgainstOwnedV5(
            ranked,
            catalogValues,
            policy
        ).rows
        const byId = new Map(eligibleRanked.map((item) => [item.comicId, item]))
        const favoriteIds = new Set(
            catalogValues.filter((comic) => comic.isFavorite).map((comic) => comic.comicId)
        )
        const alreadyAllocated = new Set(
            this.database.recommendationSeen(state.activeCycleId)
        )
        const recent = this.recentlyDisplayedComicIds(state.activeCycleId)
        const batches: Array<{
            batchIndex: number
            recommendations: Array<Record<string, unknown>>
        }> = []
        const limit = Math.max(
            1,
            Math.min(MAX_VISIBLE_BATCHES_PER_CYCLE, Math.floor(maxBatches))
        )
        for (let batchIndex = 0; batchIndex < limit; batchIndex++) {
            const allocated = allocateRecommendationBatchV3({
                ranked: eligibleRanked,
                intents: telemetry.intentPlan ?? [],
                alreadyAllocated,
                currentFavoriteIds: favoriteIds,
                recentlyDisplayedComicIds: recent
            })
            if (!allocated.length) break
            for (const item of allocated) alreadyAllocated.add(item.comicId)
            batches.push({
                batchIndex,
                recommendations: allocated.flatMap((allocatedItem) => {
                    const candidate = byId.get(allocatedItem.comicId)
                    if (!candidate) return []
                    return [
                        {
                            comic: candidate.comic,
                            score: candidate.score,
                            rawRank: candidate.rawRank,
                            reasons: candidate.reasons,
                            evidence: candidate.evidence,
                            feedbackAdjustment: candidate.feedbackAdjustment,
                            visual: (candidate as { visual?: unknown }).visual
                        }
                    ]
                })
            })
        }
        return {
            source: 'desktop-v5-portable-bundle',
            generatedAt: new Date().toISOString(),
            cycleId: state.activeCycleId,
            policyRevision: policy.revision,
            batches
        }
    }
'''
    cycle.write_text(text.replace(marker, '\n' + method + marker, 1), encoding='utf-8')

bridge = Path('src/mobile/bridge-server.ts')
text = bridge.read_text(encoding='utf-8')
old = '''                return json(response, 200, {\n                    ...merged,\n                    recommendationRefresh\n                })'''
new = '''                return json(response, 200, {\n                    ...merged,\n                    recommendationRefresh,\n                    recommendationBundle:\n                        finalRecommendationCoordinator.portableBundle()\n                })'''
if 'recommendationBundle:' not in text:
    if old not in text:
        raise SystemExit('Mobile V5 sync response marker not found')
    text = text.replace(old, new, 1)
bridge.write_text(text, encoding='utf-8')

home = Path('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java')
text = home.read_text(encoding='utf-8')
start = text.find('    private void recommendations(){')
end = text.find('\n\n    private void recommendationFeedback(', start)
if start < 0 or end < 0:
    raise SystemExit('Android recommendations() block not found')
replacement = r'''    private void recommendations(){
        LinearLayout p=page(true);
        Button refresh=Ui.iconButton(this,R.drawable.ic_refresh_24,"与电脑同步推荐",v->refreshPortableRecommendations(true));
        Button controls=compact("偏好",v->startActivity(new Intent(this,RecommendationControlActivity.class)));
        titleRow(p,"为你推荐",controls,refresh);
        NativeRecommendationStore.Snapshot snapshot=NativeRecommendationStore.load(this);
        LinearLayout status=Ui.card(this);status.setOrientation(LinearLayout.VERTICAL);
        String source=BridgeStore.paired(this)?"电脑负责完整计算；手机显示同步缓存并应用本地轻量调整。":"离线模式：使用上次电脑同步的推荐缓存，并即时应用手机上的偏好调整。";
        status.addView(Ui.text(this,source,12,Ui.MUTED,false));
        status.addView(Ui.text(this,"待同步手机改动 "+RecommendationPolicyStore.pendingCount(this)+" 项"+(snapshot.generatedAt.isEmpty()?"":" · 缓存 "+snapshot.generatedAt),11,Ui.MUTED,false));
        p.addView(status);
        if(!snapshot.available()){
            TextView t=Ui.text(this,BridgeStore.paired(this)?"还没有可用的桌面推荐缓存。":"手机尚无推荐缓存。请至少与电脑完成一次推荐同步。",14,Ui.MUTED,false);t.setPadding(0,Ui.dp(this,20),0,Ui.dp(this,10));p.addView(t);
            p.addView(compact(BridgeStore.paired(this)?"从电脑计算并同步":"连接电脑",v->{if(BridgeStore.paired(this))refreshPortableRecommendations(true);else startActivity(new Intent(this,PairingActivity.class));}));
            return;
        }
        LinearLayout pager=new LinearLayout(this);pager.setGravity(Gravity.CENTER_VERTICAL);pager.addView(compact("上一批",v->{NativeRecommendationStore.previousBatch(this);show();}),new LinearLayout.LayoutParams(0,-2,1));TextView batch=Ui.text(this,"第 "+(snapshot.batchIndex+1)+" / "+snapshot.batches.size()+" 批",13,Ui.MUTED,false);batch.setGravity(Gravity.CENTER);pager.addView(batch,new LinearLayout.LayoutParams(0,-1,1));pager.addView(compact("下一批",v->{NativeRecommendationStore.nextBatch(this);show();}),new LinearLayout.LayoutParams(0,-2,1));p.addView(pager);
        UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(this);
        List<NativeRecommendationStore.Item> visible=RecommendationPolicyStore.applyCachedPolicy(this,snapshot.current());
        if(visible.isEmpty()){TextView empty=Ui.text(this,"这一批已被你的反馈或偏好规则全部过滤，可切换下一批或调整偏好。",13,Ui.MUTED,false);empty.setPadding(0,Ui.dp(this,16),0,Ui.dp(this,8));p.addView(empty);return;}
        for(NativeRecommendationStore.Item item:visible){
            UnifiedCatalogStore.Entry e=catalog.byId.get(item.comicId);if(e==null){e=new UnifiedCatalogStore.Entry(item.comicId,item.title,item.author);e.tags.addAll(item.tags);e.categories.addAll(item.categories);}
            LinearLayout card=Ui.card(this);card.setOrientation(LinearLayout.HORIZONTAL);ImageView cover=new ImageView(this);cover.setScaleType(ImageView.ScaleType.CENTER_CROP);cover.setBackgroundColor(Ui.PLACEHOLDER);card.addView(cover,new LinearLayout.LayoutParams(Ui.dp(this,86),Ui.dp(this,122)));LinearLayout copy=new LinearLayout(this);copy.setOrientation(LinearLayout.VERTICAL);copy.setPadding(Ui.dp(this,12),0,0,0);copy.addView(Ui.text(this,item.title,16,Ui.TEXT,true));copy.addView(Ui.text(this,item.author,12,Ui.MUTED,false));TextView why=Ui.text(this,item.reason,12,Ui.PRIMARY,false);why.setPadding(0,Ui.dp(this,6),0,0);copy.addView(why);double adjustment=RecommendationPolicyStore.adjustment(this,item);if(Math.abs(adjustment)>0.0001)copy.addView(Ui.text(this,adjustment>0?"手机偏好：提高":"手机偏好：降低",11,Ui.MUTED,false));LinearLayout feedback=new LinearLayout(this);feedback.setPadding(0,Ui.dp(this,8),0,0);feedback.addView(compact("👍 喜欢",v->recommendationFeedback(item,"like")));Ui.gap(feedback,this,6);feedback.addView(compact("👎 不喜欢",v->recommendationFeedback(item,"dislike")));copy.addView(feedback);card.addView(copy,new LinearLayout.LayoutParams(0,-2,1));UnifiedCatalogStore.Entry target=e;card.setOnClickListener(v->open(target));CoverRepository.load(this,cover,e,Ui.PLACEHOLDER);p.addView(card);
        }
        NativeRecommendationStore.markCurrentSeen(this);
    }

    private void refreshPortableRecommendations(boolean recompute){
        if(!BridgeStore.paired(this)){Toast.makeText(this,"当前离线：继续使用本机缓存；改动会在下次配对同步。",Toast.LENGTH_SHORT).show();show();return;}
        Toast.makeText(this,recompute?"正在由电脑更新推荐并同步到手机…":"正在同步推荐状态…",Toast.LENGTH_SHORT).show();
        worker.submit(()->{try{BridgeClient.syncRecommendationState(this,recompute);runOnUiThread(()->{if(isDestroyed())return;show();Toast.makeText(this,"推荐缓存已同步",Toast.LENGTH_SHORT).show();});}catch(Exception e){runOnUiThread(()->{if(isDestroyed())return;Toast.makeText(this,e.getMessage()==null?"同步失败，继续使用原缓存":e.getMessage(),Toast.LENGTH_LONG).show();show();});}});
    }'''
home.write_text(text[:start] + replacement + text[end:], encoding='utf-8')
