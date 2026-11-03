package com.picalibrary.android;

import android.content.Context;
import java.util.*;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Source-neutral projection of the already-ranked Desktop portable reservoir.
 * No new recommender and no site transport: the Desktop-provided order is
 * retained, then the original local policy/feedback layer filters the result.
 * Shares the ORIGINAL NativeRecommendationStore format and 12-item batch rules.
 */
final class NativePortableRecommendationCycle {
    private NativePortableRecommendationCycle(){}

    static NativeRecommendationStore.Snapshot build(Context context,
            NativeRecommendationEngine.Progress progress,
            NativeRecommendationEngine.Control control) throws Exception {
        Context app=context.getApplicationContext();
        control.checkpoint();
        PortableRecommendationPackageStore.Snapshot foundation=
            PortableRecommendationPackageStore.load(app);
        if(!foundation.available()){
            throw new IllegalStateException(
                "请先从电脑同步候选基础；离线清洁版不会请求任何内置漫画站点");
        }
        progress.update("正在读取已同步的候选顺序",0,foundation.candidates.size());
        UnifiedCatalogStore.Snapshot catalog=
            UnifiedCatalogStore.reconcileLocalReferences(app);
        Set<String> owned=new LinkedHashSet<>();
        for(UnifiedCatalogStore.Entry item:catalog.byId.values()){
            if(item.favorite||item.inShelf||item.localImported||item.phoneDownloaded||
                    item.desktopDownloaded)
                owned.add(item.id);
        }
        Set<String> feedback=RecommendationFeedbackStore.feedbackIds(app);
        Set<String> excluded=new HashSet<>(owned);
        excluded.addAll(feedback);

        // Desktop already ranked these candidates. Preserve that authority;
        // no substitute network search, no second tag/Visual ranking model.
        List<PortableRecommendationPackageStore.Candidate> sorted=
            new ArrayList<>(foundation.candidates);
        sorted.sort(Comparator
            .comparingInt((PortableRecommendationPackageStore.Candidate c)->c.desktopPoolRank)
            .thenComparing(c->c.comicId));
        LinkedHashSet<String> ownedWorks=new LinkedHashSet<>();
        for(String id:owned){
            String work=foundation.workId(id);
            if(!work.isEmpty())ownedWorks.add(work);
        }
        LinkedHashSet<String> emittedIds=new LinkedHashSet<>();
        LinkedHashSet<String> emittedWorks=new LinkedHashSet<>(ownedWorks);
        Set<String> cooldown=NativeRecommendationStore.cooldownForNextCycle(app);
        List<NativeRecommendationStore.Item> available=new ArrayList<>();
        int inspected=0;
        for(PortableRecommendationPackageStore.Candidate candidate:sorted){
            control.checkpoint();
            if(candidate==null||candidate.comicId==null||
                    candidate.comicId.isEmpty())continue;
            inspected++;
            String work=foundation.workId(candidate.comicId);
            if(excluded.contains(candidate.comicId)||
                    cooldown.contains(candidate.comicId)||
                    !emittedIds.add(candidate.comicId)||
                    (!work.isEmpty()&&!emittedWorks.add(work))){
                progress.update("正在剔除已收藏、重复及反馈作品",
                    inspected,sorted.size());
                continue;
            }
            available.add(new NativeRecommendationStore.Item(
                candidate.comicId,
                candidate.title.isEmpty()?candidate.comicId:candidate.title,
                candidate.author,
                "已同步候选基础 · 电脑排序",
                "PORTABLE_RESERVOIR","PORTABLE_RESERVOIR",
                1d/(1d+Math.max(1,candidate.desktopPoolRank)),
                candidate.tags,candidate.categories));
            if(available.size()>=NativeRecommendationPolicy.BATCH_SIZE*
                    NativeRecommendationPolicy.MAX_BATCHES)break;
            if(inspected%20==0||inspected==sorted.size())
                progress.update("正在整理本地推荐",inspected,sorted.size());
        }

        NativeRecommendationStore.Snapshot cycle=new NativeRecommendationStore.Snapshot();
        cycle.cycleId=UUID.randomUUID().toString();
        cycle.generatedAt=Instant.now().toString();
        cycle.favoriteCount=owned.size();
        cycle.candidateCount=available.size();
        cycle.batchIndex=0;
        cycle.readiness=NativeRecommendationPolicy.readiness(available.size());
        cycle.registryFingerprint=foundation.canonicalGeneration;
        cycle.cooldownIds.addAll(cooldown);
        List<String> sortedOwned=new ArrayList<>(owned);
        Collections.sort(sortedOwned);
        MessageDigest sha=MessageDigest.getInstance("SHA-256");
        byte[] hash=sha.digest(String.join("\n",sortedOwned)
            .getBytes(StandardCharsets.UTF_8));
        StringBuilder fingerprint=new StringBuilder(64);
        for(byte b:hash)fingerprint.append(String.format(Locale.ROOT,"%02x",b&255));
        cycle.favoriteFingerprint=fingerprint.toString();
        for(int start=0;start<available.size();
                start+=NativeRecommendationPolicy.BATCH_SIZE){
            int end=Math.min(available.size(),
                start+NativeRecommendationPolicy.BATCH_SIZE);
            cycle.batches.add(new ArrayList<>(available.subList(start,end)));
        }
        control.checkpoint();
        NativeRecommendationStore.save(app,cycle);
        RecommendationPolicyStore.markCacheBaseline(app);
        progress.update("独立本地推荐批次已更新",available.size(),available.size());
        return cycle;
    }
}
