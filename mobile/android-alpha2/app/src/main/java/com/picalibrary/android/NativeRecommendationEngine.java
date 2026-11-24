package com.picalibrary.android;

import android.content.Context;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import org.json.JSONArray;
import org.json.JSONObject;

/** Mobile-native Recommendation V3 using frozen ranker authority with provider-aware semantic inputs. */
final class NativeRecommendationEngine {
    interface Progress { void update(String phase,int done,int total); }
    interface Control { void checkpoint() throws Exception; }
    private static final class Interest {
        final String key,label,facet,utility,observedLabel;final LinkedHashSet<String> comicIds=new LinkedHashSet<>(),ehCanonicals=new LinkedHashSet<>();
        Interest(UnifiedInterestResolver.Signal s){key=s.key;label=s.label;facet=s.facet;utility=s.utility;observedLabel=s.observedLabel;absorb(s);}
        void absorb(UnifiedInterestResolver.Signal s){if(s==null)return;String canonical=s.providerCanonical==null?"":s.providerCanonical.trim();if(EhOnlineFilterSpec.validCanonical(canonical)&&!canonical.startsWith("pica:")&&!canonical.startsWith("eh-flat:"))ehCanonicals.add(canonical);}
        int support(){return comicIds.size();}
    }
    private static final class Intent {
        final String id,family,label,relatedSeed;final List<String> queries=new ArrayList<>(),ehQueries=new ArrayList<>();
        Intent(String id,String family,String label,String relatedSeed){this.id=id;this.family=family;this.label=label;this.relatedSeed=relatedSeed;}
        int routeCost(){return "SEMANTIC_CONJUNCTION".equals(family)?2:1;}
    }
    private static final class Route {
        final String id,intentId,family,type,query,ehQuery,seed;
        Route(String id,String intentId,String family,String type,String query,String ehQuery,String seed){this.id=id;this.intentId=intentId;this.family=family;this.type=type;this.query=query;this.ehQuery=ehQuery;this.seed=seed;}
    }
    private static final class Candidate {
        PicaClient.Comic comic;final LinkedHashSet<String> intentIds=new LinkedHashSet<>(),families=new LinkedHashSet<>();int bestProviderRank=Integer.MAX_VALUE;
        Candidate(PicaClient.Comic comic){this.comic=comic;}
    }
    private static final class Ranked {
        final Candidate candidate;final double score,authorAffinity,categorySimilarity,routeSupport,popularity;final String family,primaryIntent,reason;final List<String> fandomKeys;
        Ranked(Candidate candidate,double score,double authorAffinity,double categorySimilarity,double routeSupport,double popularity,String family,String primaryIntent,String reason,List<String> fandomKeys){this.candidate=candidate;this.score=score;this.authorAffinity=authorAffinity;this.categorySimilarity=categorySimilarity;this.routeSupport=routeSupport;this.popularity=popularity;this.family=family;this.primaryIntent=primaryIntent;this.reason=reason;this.fandomKeys=fandomKeys;}
        boolean relatedOnly(){return candidate.families.size()==1&&candidate.families.contains("RELATED");}
    }
    private NativeRecommendationEngine(){}
    static final class NoUnseenWorks extends Exception {NoUnseenWorks(){super("没有符合条件的新作品，本轮未生成；原有推荐和本轮想看均已保留。");}}

    static NativeRecommendationStore.Snapshot build(Context context,Progress progress) throws Exception {
        return build(context,progress,()->{});
    }

    static NativeRecommendationStore.Snapshot build(Context context,Progress progress,Control control) throws Exception {
        control.checkpoint();
        Context app=context.getApplicationContext();PicaClient client=new PicaClient(app);MobileTagRegistry registry=MobileTagRegistry.load(app);boolean picaConfigured=PicaClient.available(app);PortableRecommendationPackageStore.Snapshot portable=PortableRecommendationPackageStore.load(app);JSONObject policyState=RecommendationPolicyStore.snapshot(app);
        NativeRecommendationStore.Snapshot previous=NativeRecommendationStore.load(app);
        JSONObject requested=policyState.optJSONObject("sessionIntent");
        String token=requested!=null&&"TARGET".equals(requested.optString("mode"))?requested.optString("updatedAt")+"|"+requested.optString("targetType")+"|"+requested.optString("key"):"";
        if(!token.isEmpty()&&token.equals(previous.consumedTarget)){policyState.remove("sessionIntent");token="";}
        emit(progress,"正在同步 Pica / E-H 收藏画像",0,2);control.checkpoint();if(picaConfigured)try{PicaFavoriteQuickSync.Result sync=PicaFavoriteQuickSync.sync(app,client,(phase,done,total)->{control.checkpoint();emit(progress,phase,done,total);});if(!sync.observed.isEmpty())UnifiedPicaCatalogSync.mergeAll(app,sync.observed);}catch(InterruptedException stopped){throw stopped;}catch(Exception ignored){}emit(progress,"正在同步 Pica / E-H 收藏画像",1,2);control.checkpoint();
        if(EhClient.accountAvailable(app))try{EhFavoriteSync ehSync=new EhClient(app).favoritesSnapshot((phase,done,total)->{control.checkpoint();emit(progress,phase,done,total);});UnifiedEhCatalogSync.mergeAll(app,ehSync.comics);EhFavoriteStore.replaceRemote(app,ehSync);}catch(InterruptedException stopped){throw stopped;}catch(Exception ignored){}emit(progress,"正在同步 Pica / E-H 收藏画像",2,2);
        UnifiedCatalogStore.Snapshot knownFavorites=UnifiedCatalogStore.reconcileLocalReferences(app);List<PicaClient.Comic> favorites=new ArrayList<>();for(UnifiedCatalogStore.Entry known:knownFavorites.byId.values())if((known.favorite||RecommendationFeedbackStore.isLiked(app,known.id))&&!RecommendationFeedbackStore.isDisliked(app,known.id)&&!RecommendationPolicyStore.tasteExcluded(app,known.id)){if("eh".equals(known.providerId))favorites.add(ehCatalogFavorite(known));else favorites.add(catalogSeed(known));}
        LinkedHashMap<String,PicaClient.Comic> favoriteById=new LinkedHashMap<>();for(PicaClient.Comic comic:favorites)if(comic!=null&&!comic.id.isEmpty())favoriteById.put(comic.id,comic);favorites=new ArrayList<>(favoriteById.values());

        EhSemanticStore.Snapshot ehSemantics=EhSemanticStore.load(app);EhTagTranslationStore translations=EhTagTranslationStore.load(app);EhTagTranslationStore.scheduleUpdate(app,null);
        emit(progress,"正在构建本机 V3 兴趣画像",0,favorites.size());Map<String,Integer> authorCounts=new HashMap<>();Map<String,String> authorLabels=new HashMap<>();Map<String,Interest> interests=new LinkedHashMap<>();int seen=0;
        for(PicaClient.Comic comic:favorites){control.checkpoint();String authorKey=ReaderRoundPlanner.author(comic.author);if(!authorKey.isEmpty()){authorCounts.put(authorKey,authorCounts.getOrDefault(authorKey,0)+1);authorLabels.putIfAbsent(authorKey,comic.author);}Set<String> perComic=new HashSet<>();for(UnifiedInterestResolver.Signal signal:UnifiedInterestResolver.resolve(comic,registry,ehSemantics,translations)){if(!signal.eligible)continue;String key=signal.facet+"\u0000"+signal.key;if(!perComic.add(key))continue;Interest interest=interests.get(key);if(interest==null){interest=new Interest(signal);interests.put(key,interest);}else interest.absorb(signal);interest.comicIds.add(comic.id);}seen++;emit(progress,"正在构建本机 V3 兴趣画像",seen,favorites.size());}
        RecommendationPageReceipt.flush();ReaderRoundLedger ledger=ReaderRoundLedger.get(app);
        ReaderRoundPlanner.Profile taste=readerProfile(app,knownFavorites,portable,policyState);
        JSONObject target=policyState.optJSONObject("sessionIntent");
        boolean named=target!=null&&"TARGET".equals(target.optString("mode"))&&!target.optString("key").isEmpty();
        String focus=named?"":taste.focus(previous.focusHistory);
        List<String> authorSeeds=ReaderRoundPlanner.creatorSeeds(authorCounts,taste.familiar,ledger.following().keySet(),previous.creatorQueries,ledger.clocks(),3);
        Set<String> attemptedCreators=new HashSet<>();int nextOrdinal=previous.readerOrdinal+1;
        Set<String> previouslyShown=ledger.shown(),shownWorks=ledger.shownWorks(),following=ledger.following().keySet();
        for(String upload:previouslyShown)shownWorks.add(ReaderRoundPlanner.work(upload,portable.workId(upload)));
        Map<String,Integer> authorClocks=ledger.clocks();
        Map<String,PortableRecommendationPackageStore.Candidate> synced=new HashMap<>();for(PortableRecommendationPackageStore.Candidate c:portable.candidates)synced.put(c.comicId,c);
        java.util.function.Predicate<PicaClient.Comic> withheld=c->{
            if(previouslyShown.contains(c.id)||shownWorks.contains(ReaderRoundPlanner.work(c.id,portable.workId(c.id)))||RecommendationPolicyStore.blocked(policyState,c))return true;
            String by=ReaderRoundPlanner.author(candidateAuthor(c,knownFavorites,synced));
            return by.isEmpty()||following.contains(by)||(!taste.familiar.contains(by)&&authorClocks.getOrDefault(by,-100)>=nextOrdinal-ReaderRoundPlanner.REST);
        };
        List<Intent> priority=buildExplicitIntents(policyState);
        if(!focus.isEmpty())for(Interest x:interests.values()){
            String topic=focus.substring(2);
            if(("FANDOM_IP".equals(x.facet)||highUtility(x.utility))&&(topic.equals(ReaderRoundPlanner.normalize(x.observedLabel))||topic.equals(ReaderRoundPlanner.normalize(x.label)))){
                Intent i=new Intent("ROUND_FOCUS:"+x.key,"SEMANTIC_ANCHOR",x.label,"");addIntentQuery(i,x);priority.add(0,i);break;
            }
        }
        List<Intent> intents=mergeIntents(priority,buildIntents(favorites,authorSeeds,authorLabels,interests,nextOrdinal));List<Route> routes=routes(intents);
        String namedId=named?"V5_EXPLICIT:"+target.optString("targetType","TAG")+":"+target.optString("key"):"";
        routes.sort(Comparator.comparingInt(r->r.intentId.equals(namedId)?0:r.intentId.startsWith("ROUND_FOCUS:")?1:2));
        if(routes.isEmpty()&&!portable.available())throw new IllegalStateException("当前没有收藏画像或正向初始偏好。请到“推荐与画风 → 人工调整”添加标签，并设置为 6–10 后重新生成推荐。");

        LinkedHashMap<String,Candidate> candidates=new LinkedHashMap<>();int requests=0,ehRequests=0,exhRequests=0,consecutivePicaFailures=0,successfulRoutes=0;boolean picaDisabledForRun=false;final int EH_MAX_REQUESTS=4,EXH_MAX_REQUESTS=2;EhClient ehClient=new EhClient(app);EhCapabilityStore.Snapshot exhCapability=EhClient.accountAvailable(app)?EhCapabilityStore.refresh(app,false):EhCapabilityStore.load(app);boolean exhAvailable=exhCapability.available();List<EhClient.Comic> ehDiscovered=new ArrayList<>();Set<String> allFavoriteIds=new HashSet<>(favoriteById.keySet());for(UnifiedCatalogStore.Entry known:UnifiedCatalogStore.load(app).byId.values())if(known.favorite||known.phoneDownloaded||known.desktopDownloaded||known.inShelf||known.remoteAvailable)allFavoriteIds.add(known.id);allFavoriteIds.addAll(RecommendationFeedbackStore.feedbackIds(app));
        emit(progress,"正在从 Pica + E-H 召回候选",0,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);
        for(int page=1;page<=NativeRecommendationPolicy.MAX_PAGE&&requests<NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS&&candidates.size()<NativeRecommendationPolicy.TARGET_POOL;page++){
            for(Route route:routes){control.checkpoint();if(requests>=NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS||candidates.size()>=NativeRecommendationPolicy.TARGET_POOL)break;if(page>1&&"RELATED".equals(route.type))continue;
                if(route.intentId.startsWith("CREATOR:")&&((picaConfigured&&!picaDisabledForRun)||(page==1&&ehRequests<EH_MAX_REQUESTS)))attemptedCreators.add(route.intentId.substring(8));
                if(picaConfigured&&!picaDisabledForRun&&!("RELATED".equals(route.type)&&route.seed.startsWith("eh:"))){try{control.checkpoint();List<PicaClient.Comic> docs="RELATED".equals(route.type)?client.related(route.seed):client.search(route.query,page,"ld",Collections.emptyList()).comics;requests++;successfulRoutes++;consecutivePicaFailures=0;addCandidates(candidates,allFavoriteIds,withheld,registry,docs,route,(page-1)*20);}catch(Exception e){requests++;consecutivePicaFailures++;if(consecutivePicaFailures>=3){picaDisabledForRun=true;emit(progress,"Pica 网络连续失败，本轮停止 Pica 召回并继续其他来源",requests,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);}else emit(progress,"部分 Pica 召回路线失败，继续其他路线",requests,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);}}
                if(page==1&&!"RELATED".equals(route.type)&&ehRequests<EH_MAX_REQUESTS){ehRequests++;try{control.checkpoint();String q=route.ehQuery.isEmpty()?route.query:route.ehQuery;List<EhClient.Comic> ehDocs=ehClient.search(q,"eh");successfulRoutes++;ehDiscovered.addAll(ehDocs);List<PicaClient.Comic> converted=new ArrayList<>();for(EhClient.Comic comic:ehDocs)converted.add(ehCandidate(comic));addCandidates(candidates,allFavoriteIds,withheld,registry,converted,route,0);}catch(Exception ignored){}}
                if(page==1&&!"RELATED".equals(route.type)&&exhAvailable&&exhRequests<EXH_MAX_REQUESTS){exhRequests++;try{control.checkpoint();String q=route.ehQuery.isEmpty()?route.query:route.ehQuery;List<EhClient.Comic> docs=ehClient.search(q,"exh");successfulRoutes++;ehDiscovered.addAll(docs);List<PicaClient.Comic> converted=new ArrayList<>();for(EhClient.Comic comic:docs)converted.add(ehCandidate(comic));addCandidates(candidates,allFavoriteIds,withheld,registry,converted,route,0);}catch(Exception ignored){}}
                emit(progress,"正在从 Pica + E-H 召回候选",requests,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);
            }
        }
        if(portable.available()){Route reservoirRoute=new Route("PORTABLE_RESERVOIR","PORTABLE_RESERVOIR","PORTABLE_RESERVOIR","RESERVOIR","","","");List<PicaClient.Comic> reservoirDocs=new ArrayList<>();Map<String,Integer> reservoirRank=new HashMap<>();for(PortableRecommendationPackageStore.Candidate row:portable.candidates){PicaClient.Comic comic=row.asComic();reservoirDocs.add(comic);reservoirRank.put(comic.id,row.desktopPoolRank);}addCandidates(candidates,allFavoriteIds,withheld,registry,reservoirDocs,reservoirRoute,0);for(Candidate candidate:candidates.values())if(candidate.families.contains("PORTABLE_RESERVOIR"))candidate.bestProviderRank=Math.min(candidate.bestProviderRank,reservoirRank.getOrDefault(candidate.comic.id,Integer.MAX_VALUE));}
        if(portable.identityBindingCount()>0){
            Set<String> ownedWorks=new HashSet<>();
            for(String ownedId:allFavoriteIds){String workId=portable.workId(ownedId);if(!workId.isEmpty())ownedWorks.add(workId);}
            List<String> removeIds=new ArrayList<>();
            for(Map.Entry<String,Candidate> row:candidates.entrySet()){
                String comicId=row.getKey(),workId=portable.workId(comicId);
                if(workId.isEmpty())continue;
                if(ownedWorks.contains(workId)){removeIds.add(comicId);continue;}
                // The final planner chooses among confirmed editions by taste, not raw provider rank.
            }
            for(String removeId:removeIds)candidates.remove(removeId);
        }
        List<PicaClient.Comic> picaDiscovered=new ArrayList<>();for(Candidate candidate:candidates.values())if(!candidate.comic.id.startsWith("eh:"))picaDiscovered.add(candidate.comic);UnifiedPicaCatalogSync.mergeAll(app,picaDiscovered);UnifiedEhCatalogSync.mergeAll(app,ehDiscovered);

        emit(progress,"正在使用冻结兼容 Ranker 排序",0,candidates.size());Map<String,Intent> intentMap=new HashMap<>();for(Intent intent:intents)intentMap.put(intent.id,intent);List<Ranked> ranked=new ArrayList<>();int rankedDone=0;JSONObject rankingPolicy=policyState;String visualStrength=MobileVisualPolicyStore.strength(app);boolean visualLive=MobileVisualPolicyStore.live(app);
        for(Candidate candidate:candidates.values()){control.checkpoint();if(RecommendationPolicyStore.blocked(rankingPolicy,candidate.comic))continue;double author=authorAffinity(candidate.comic,favorites),category=categorySimilarity(candidate.comic,favorites),route=Math.min(1d,candidate.families.size()/3d),popularity=popularity(candidate.comic);double explicit=RecommendationPolicyStore.adjustment(rankingPolicy,candidate.comic),recent=RecommendationEvidenceStore.recentAdjustment(app,candidate.comic),session=RecommendationEvidenceStore.sessionAdjustment(app,candidate.comic);double score=NativeRecommendationPolicy.frozenNeutralScore(author,category,route,popularity)+explicit+recent+session;String family=primaryFamily(candidate.families),primaryIntent=primaryIntent(candidate.intentIds,family,intentMap),why=reason(family,primaryIntent,intentMap,author,category);if(session>0.01)why+=" · 本次兴趣";else if(recent>0.01)why+=" · 最近兴趣";ranked.add(new Ranked(candidate,score,author,category,route,popularity,family,primaryIntent,why,fandomKeys(registry,candidate.comic)));rankedDone++;emit(progress,"正在使用冻结兼容 Ranker 排序",rankedDone,candidates.size());}
        ranked.sort((a,b)->{int byScore=Double.compare(b.score,a.score);if(byScore!=0)return byScore;int provider=Integer.compare(a.candidate.bestProviderRank,b.candidate.bestProviderRank);return provider!=0?provider:a.candidate.comic.id.compareTo(b.candidate.comic.id);});

        NativeRecommendationStore.Snapshot snapshot=new NativeRecommendationStore.Snapshot();snapshot.cycleId=UUID.randomUUID().toString();snapshot.generatedAt=Instant.now().toString();snapshot.favoriteFingerprint=fingerprint(favorites);snapshot.registryFingerprint=registry.manifestFingerprint;snapshot.favoriteCount=favorites.size();snapshot.candidateCount=ranked.size();snapshot.readiness=NativeRecommendationPolicy.readiness(ranked.size());snapshot.batchIndex=0;snapshot.readerOrdinal=nextOrdinal;snapshot.consumedTarget=token.isEmpty()?previous.consumedTarget:token;snapshot.focusHistory.addAll(previous.focusHistory);
        for(Map.Entry<String,Integer> q:previous.creatorQueries.entrySet())if(authorCounts.containsKey(q.getKey()))snapshot.creatorQueries.put(q.getKey(),q.getValue());
        for(String a:attemptedCreators)snapshot.creatorQueries.put(a,nextOrdinal);
        emit(progress,"正在分配六页推荐",0,6);
        if(!focus.isEmpty()){snapshot.focusHistory.add(focus);while(snapshot.focusHistory.size()>24)snapshot.focusHistory.remove(0);}
        List<ReaderRoundPlanner.Pick> choices=new ArrayList<>();Map<String,Ranked> byId=new HashMap<>();
        for(Ranked value:ranked){
            PicaClient.Comic c=value.candidate.comic;
            PortableRecommendationPackageStore.Candidate remote=synced.get(c.id);
            String author=candidateAuthor(c,knownFavorites,synced);
            List<String> terms=new ArrayList<>(c.tags);terms.addAll(c.categories);
            boolean focusMatch=focus.length()>2&&terms.stream().anyMatch(t->ReaderRoundPlanner.normalize(t).equals(focus.substring(2)));
            boolean targetMatch=named&&RecommendationPolicyStore.matches(c,target.optString("targetType"),target.optString("key"));
            boolean explicitPositive=value.candidate.intentIds.stream().anyMatch(s->s.startsWith("V5_EXPLICIT:"));
            Double view=visualLive&&remote!=null&&remote.visualAvailable?portable.visualAdjustment(c.id,visualStrength):null;
            choices.add(new ReaderRoundPlanner.Pick(c.id,ReaderRoundPlanner.work(c.id,portable.workId(c.id)),author,c.id.startsWith("eh:")?"eh":"pica",targetMatch,focusMatch,taste.fit(terms),explicitPositive||value.candidate.families.contains("RELATED"),c.totalLikes,value.score,view));byId.put(c.id,value);
        }
        RecommendationPageReceipt.flush();
        Set<String> excluded=new HashSet<>(ledger.shownWorks());for(String id:ledger.shown()){excluded.add("upload:"+id);excluded.add(ReaderRoundPlanner.work(id,portable.workId(id)));}
        for(String id:allFavoriteIds)excluded.add(ReaderRoundPlanner.work(id,portable.workId(id)));
        for(List<ReaderRoundPlanner.Pick> page:ReaderRoundPlanner.plan(choices,taste.familiar,ledger.following().keySet(),excluded,ledger.clocks(),snapshot.readerOrdinal)){
            control.checkpoint();List<NativeRecommendationStore.Item> items=new ArrayList<>();
            for(ReaderRoundPlanner.Pick pick:page){Ranked value=byId.get(pick.id);PicaClient.Comic c=value.candidate.comic;
                items.add(NativeRecommendationStore.withWork(portable.workId(c.id),new NativeRecommendationStore.Item(c.id,c.title,pick.displayAuthor,value.reason,value.family,value.primaryIntent,value.score,c.tags,c.categories)));}
            snapshot.batches.add(items);emit(progress,"正在分配六页推荐",snapshot.batches.size(),6);
        }
        if(!snapshot.batches.isEmpty()&&ranked.size()<12)snapshot.readiness="READY_LIMITED";
        if(snapshot.batches.isEmpty()&&successfulRoutes==0&&requests+ehRequests+exhRequests>0&&!portable.available())
            throw new java.io.IOException("来源未返回可用结果；已保留原推荐，请检查连接后重试。");
        if(snapshot.batches.isEmpty())throw new NoUnseenWorks();
        control.checkpoint();NativeRecommendationStore.save(app,snapshot);RecommendationPolicyStore.markCacheBaseline(app);emit(progress,"手机原生 Recommendation V3 已更新",1,1);return snapshot;
    }

    private static String candidateAuthor(PicaClient.Comic c,UnifiedCatalogStore.Snapshot known,Map<String,PortableRecommendationPackageStore.Candidate> synced){
        UnifiedCatalogStore.Entry local=known.byId.get(c.id);PortableRecommendationPackageStore.Candidate remote=synced.get(c.id);
        if(local!=null&&!ReaderRoundPlanner.author(local.displayAuthor()).isEmpty())return local.displayAuthor();
        if(remote!=null&&!ReaderRoundPlanner.author(remote.canonicalAuthor).isEmpty())return remote.canonicalAuthor;
        return c.author;
    }
    private static ReaderRoundPlanner.Profile readerProfile(Context app,UnifiedCatalogStore.Snapshot catalog,PortableRecommendationPackageStore.Snapshot portable,JSONObject policy){
        ReaderRoundPlanner.Profile taste=new ReaderRoundPlanner.Profile();
        for(UnifiedCatalogStore.Entry e:catalog.byId.values()){
            boolean liked=RecommendationFeedbackStore.isLiked(app,e.id);
            if((!e.favorite&&!liked)||RecommendationFeedbackStore.isDisliked(app,e.id))continue;
            List<String> labels=new ArrayList<>(e.tags);labels.addAll(e.categories);
            if(RecommendationPolicyStore.tasteExcluded(policy,e.id))labels.clear();
            taste.add(e.displayAuthor(),ReaderRoundPlanner.work(e.id,portable.workId(e.id)),e.favorite,liked,liked&&RecommendationFeedbackStore.recentlyLiked(app,e.id),labels);
        }
        return taste;
    }
    private static List<Intent> buildExplicitIntents(JSONObject state){
        List<Intent> out=new ArrayList<>();JSONObject requested=state==null?null:state.optJSONObject("sessionIntent");
        if(requested!=null&&"TARGET".equals(requested.optString("mode"))&&!"STYLE_FAMILY".equals(requested.optString("targetType"))){
            String key=requested.optString("key").trim(),label=requested.optString("label",key),type=requested.optString("targetType","TAG");
            if(!key.isEmpty()){String family="AUTHOR".equals(type)?"CREATOR":"FANDOM".equals(type)?"FANDOM":"SEMANTIC_ANCHOR";
                Intent i=new Intent("V5_EXPLICIT:"+type+":"+key,family,label,"");i.queries.add(label.isEmpty()?key:label);
                i.ehQueries.add("AUTHOR".equals(type)?EhOnlineFilterSpec.exactCanonical("artist:"+key):label);out.add(i);}
        }
        JSONArray controls=state==null?null:state.optJSONArray("controls");if(controls==null)return out;
        List<JSONObject> positive=new ArrayList<>();for(int i=0;i<controls.length();i++){JSONObject row=controls.optJSONObject(i);if(row==null||!"PERSISTENT".equals(row.optString("scope","PERSISTENT"))||!"MORE".equals(row.optString("direction")))continue;String type=row.optString("targetType","TAG");if("STYLE_FAMILY".equals(type))continue;if(row.has("levelDelta")&&row.optInt("levelDelta",0)<1)continue;positive.add(row);}
        positive.sort((a,b)->{int byDelta=Integer.compare(b.optInt("levelDelta",2),a.optInt("levelDelta",2));return byDelta!=0?byDelta:b.optString("updatedAt","").compareTo(a.optString("updatedAt",""));});
        for(JSONObject row:positive){if(out.size()>=5)break;String type=row.optString("targetType","TAG"),key=row.optString("key","").trim(),label=row.optString("label",key).trim();if(key.isEmpty())continue;String family="AUTHOR".equals(type)?"CREATOR":"FANDOM".equals(type)?"FANDOM":"SEMANTIC_ANCHOR";Intent intent=new Intent("V5_EXPLICIT:"+type+":"+key,family,label.isEmpty()?key:label,"");String query=label.isEmpty()?key:label;intent.queries.add(query);if("AUTHOR".equals(type))intent.ehQueries.add(EhOnlineFilterSpec.exactCanonical("artist:"+query));else if(EhOnlineFilterSpec.validCanonical(key))intent.ehQueries.add(EhOnlineFilterSpec.exactCanonical(key));else intent.ehQueries.add(query);out.add(intent);}
        return out;
    }

    private static List<Intent> mergeIntents(List<Intent> explicit,List<Intent> base){
        LinkedHashMap<String,Intent> unique=new LinkedHashMap<>();for(Intent intent:explicit)unique.put(intent.id,intent);for(Intent intent:base)unique.putIfAbsent(intent.id,intent);
        List<Intent> out=new ArrayList<>();int cost=0;for(Intent intent:unique.values()){if(out.size()>=12)break;if(cost+intent.routeCost()>14)continue;out.add(intent);cost+=intent.routeCost();}return out;
    }

    private static boolean favoriteByIdContains(List<PicaClient.Comic> values,String id){for(PicaClient.Comic comic:values)if(comic.id.equals(id))return true;return false;}
    private static PicaClient.Comic catalogSeed(UnifiedCatalogStore.Entry entry){return new PicaClient.Comic(entry.id,entry.title,entry.displayAuthor(),entry.description,entry.picaCoverUrl,"",new ArrayList<>(entry.tags),new ArrayList<>(entry.categories),entry.finished,entry.favorite,entry.knownPictures,1,(int)Math.min(Integer.MAX_VALUE,Math.max(0L,entry.totalLikes)),(int)Math.min(Integer.MAX_VALUE,Math.max(0L,entry.totalViews)));}
    private static PicaClient.Comic ehCandidate(EhClient.Comic comic){List<String> categories=new ArrayList<>();if(comic.category!=null&&!comic.category.isEmpty())categories.add(comic.category);return new PicaClient.Comic(comic.id,comic.title,comic.author,"",comic.coverUrl,"",new ArrayList<>(comic.tags),categories,false,false,comic.pagesCount,1,0,0);}
    private static PicaClient.Comic ehCatalogFavorite(UnifiedCatalogStore.Entry entry){return new PicaClient.Comic(entry.id,entry.title,entry.displayAuthor(),entry.description,entry.ehCoverUrl,"",new ArrayList<>(entry.tags),new ArrayList<>(entry.categories),false,true,entry.knownPictures,1,0,0);}
    private static void addCandidates(LinkedHashMap<String,Candidate> candidates,Set<String> favoriteIds,java.util.function.Predicate<PicaClient.Comic> withheld,MobileTagRegistry registry,List<PicaClient.Comic> docs,Route route,int baseRank){for(int i=0;i<docs.size();i++){PicaClient.Comic comic=docs.get(i);if(comic==null||comic.id.isEmpty()||favoriteIds.contains(comic.id)||withheld.test(comic)||safetyExcluded(registry,comic))continue;Candidate candidate=candidates.get(comic.id);if(candidate==null){candidate=new Candidate(comic);candidates.put(comic.id,candidate);}else if(candidate.comic.tags.isEmpty()&&!comic.tags.isEmpty())candidate.comic=comic;candidate.intentIds.add(route.intentId);candidate.families.add(route.family);candidate.bestProviderRank=Math.min(candidate.bestProviderRank,baseRank+i+1);}}

    private static List<Intent> buildIntents(List<PicaClient.Comic> favorites,List<String> authorSeeds,Map<String,String> authorLabels,Map<String,Interest> interests,int ordinal){
        List<Interest> all=new ArrayList<>(interests.values());Comparator<Interest> strong=(a,b)->{int c=Integer.compare(b.support(),a.support());return c!=0?c:a.key.compareTo(b.key);};
        List<Intent> fandom=new ArrayList<>(),creator=new ArrayList<>(),conjunction=new ArrayList<>(),semanticAnchor=new ArrayList<>(),exploration=new ArrayList<>(),related=new ArrayList<>();
        List<Interest> fandoms=new ArrayList<>();for(Interest i:all)if("FANDOM_IP".equals(i.facet)&&i.support()>0)fandoms.add(i);fandoms.sort(strong);for(int i=0;i<Math.min(3,fandoms.size());i++){Interest x=fandoms.get(i);Intent intent=new Intent("FANDOM:"+x.key,"FANDOM",x.label,"");addIntentQuery(intent,x);fandom.add(intent);}
        for(String k:authorSeeds){String label=authorLabels.getOrDefault(k,k);Intent intent=new Intent("CREATOR:"+k,"CREATOR",label,"");intent.queries.add(label);intent.ehQueries.add(EhOnlineFilterSpec.exactCanonical("artist:"+label));creator.add(intent);}

        List<Interest> semanticPool=new ArrayList<>();for(Interest i:all)if(!"FANDOM_IP".equals(i.facet)&&!"BROAD_RECALL".equals(i.utility))semanticPool.add(i);
        class Pair {final Interest a,b;final int co;final double lift;Pair(Interest a,Interest b,int co,double lift){this.a=a;this.b=b;this.co=co;this.lift=lift;}}
        List<Pair> pairs=new ArrayList<>();for(int i=0;i<semanticPool.size();i++)for(int j=i+1;j<semanticPool.size();j++){Interest a=semanticPool.get(i),b=semanticPool.get(j);if(a.facet.equals(b.facet)||(!highUtility(a.utility)&&!highUtility(b.utility)))continue;int co=0;for(String id:a.comicIds)if(b.comicIds.contains(id))co++;if(!NativeRecommendationPolicy.conjunctionEligible(favorites.size(),a.support(),b.support(),co))continue;double expected=(double)a.support()*b.support()/Math.max(1,favorites.size());pairs.add(new Pair(a,b,co,expected>0?co/expected:0));}
        pairs.sort((a,b)->{int c=Integer.compare(b.co,a.co);if(c!=0)return c;c=Double.compare(b.lift,a.lift);return c!=0?c:(a.a.key+"|"+a.b.key).compareTo(b.a.key+"|"+b.b.key);});for(int i=0;i<Math.min(3,pairs.size());i++){Pair p=pairs.get(i);Intent intent=new Intent("SEMCONJ:"+p.a.key+"|"+p.b.key,"SEMANTIC_CONJUNCTION",p.a.label+" × "+p.b.label,"");addIntentQuery(intent,p.a);addIntentQuery(intent,p.b);conjunction.add(intent);}
        List<Interest> high=new ArrayList<>();for(Interest i:semanticPool)if(highUtility(i.utility))high.add(i);high.sort(strong);if(!high.isEmpty()){Interest x=high.get(0);Intent intent=new Intent("SEMANTIC_ANCHOR:"+x.key,"SEMANTIC_ANCHOR",x.label,"");addIntentQuery(intent,x);semanticAnchor.add(intent);}
        List<Interest> eligible=new ArrayList<>();for(Interest i:all)if(!"FANDOM_IP".equals(i.facet)&&i.support()>0&&!"PROFILE_ONLY".equals(i.utility)&&!"SAFETY_BLOCKED".equals(i.utility)&&!"EXCLUDE".equals(i.utility))eligible.add(i);eligible.sort((a,b)->{int c=Integer.compare(a.support(),b.support());return c!=0?c:a.key.compareTo(b.key);});if(!eligible.isEmpty()){Interest x=eligible.get(0);Intent intent=new Intent("EXPLORATION:"+x.key,"EXPLORATION",x.label,"");addIntentQuery(intent,x);exploration.add(intent);}
        List<PicaClient.Comic> sortedFavorites=new ArrayList<>(favorites);sortedFavorites.sort(Comparator.comparing(c->c.id));if(!sortedFavorites.isEmpty()){PicaClient.Comic seed=sortedFavorites.get(Math.floorMod(ordinal-1,sortedFavorites.size()));related.add(new Intent("RELATED:"+seed.id,"RELATED",seed.title,seed.id));}

        Map<String,List<Intent>> families=new LinkedHashMap<>();families.put("FANDOM",fandom);families.put("CREATOR",creator);families.put("SEMANTIC_CONJUNCTION",conjunction);families.put("SEMANTIC_ANCHOR",semanticAnchor);families.put("EXPLORATION",exploration);families.put("RELATED",related);List<Intent> out=new ArrayList<>();int cost=0;
        for(int round=0;round<3&&out.size()<12;round++)for(List<Intent> values:families.values()){if(round>=values.size()||out.size()>=12)continue;Intent candidate=values.get(round);if(cost+candidate.routeCost()>14)continue;out.add(candidate);cost+=candidate.routeCost();}
        return out;
    }

    private static void addIntentQuery(Intent intent,Interest interest){intent.queries.add(queryLabel(interest));intent.ehQueries.add(ehQueryLabel(interest));}
    private static List<Route> routes(List<Intent> intents){List<Route> out=new ArrayList<>();for(Intent intent:intents){if("RELATED".equals(intent.family)){out.add(new Route(intent.id+":RELATED",intent.id,intent.family,"RELATED","","",intent.relatedSeed));continue;}for(int i=0;i<intent.queries.size();i++){String query=intent.queries.get(i);if(query==null||query.trim().isEmpty())continue;String ehQuery=i<intent.ehQueries.size()?intent.ehQueries.get(i):query;String type="CREATOR".equals(intent.family)?"AUTHOR":"KEYWORD";out.add(new Route(intent.id+":"+type+":"+i,intent.id,intent.family,type,query.trim(),ehQuery==null?"":ehQuery.trim(),""));}}out.sort((a,b)->{int family=Integer.compare(NativeRecommendationPolicy.familyRank(a.family),NativeRecommendationPolicy.familyRank(b.family));return family!=0?family:a.id.compareTo(b.id);});return out;}
    private static boolean highUtility(String value){return "HIGH_PRECISION_ANCHOR".equals(value)||"CONJUNCTION_ANCHOR".equals(value);}
    private static String queryLabel(Interest interest){return interest.observedLabel==null||interest.observedLabel.trim().isEmpty()?interest.label:interest.observedLabel;}
    private static String ehQueryLabel(Interest interest){return interest.ehCanonicals.isEmpty()?queryLabel(interest):EhOnlineFilterSpec.exactCanonical(interest.ehCanonicals.iterator().next());}
    private static boolean safetyExcluded(MobileTagRegistry registry,PicaClient.Comic comic){for(String tag:comic.tags)if(registry.resolve(tag).safetyBlocked())return true;return false;}
    private static double authorAffinity(PicaClient.Comic candidate,List<PicaClient.Comic> favorites){String key=MobileTagRegistry.normalize(candidate.author);if(key.isEmpty())return 0;int n=0;for(PicaClient.Comic f:favorites)if(key.equals(MobileTagRegistry.normalize(f.author)))n++;return n/(double)Math.max(1,favorites.size());}
    private static double categorySimilarity(PicaClient.Comic candidate,List<PicaClient.Comic> favorites){Set<String> target=normalized(candidate.categories);double best=0;for(PicaClient.Comic f:favorites){Set<String> other=normalized(f.categories);int common=0;for(String x:target)if(other.contains(x))common++;best=Math.max(best,common/(double)Math.max(1,Math.max(target.size(),other.size())));}return best;}
    private static Set<String> normalized(List<String> values){Set<String> out=new HashSet<>();for(String value:values){String n=MobileTagRegistry.normalize(value);if(!n.isEmpty())out.add(n);}return out;}
    private static double popularity(PicaClient.Comic comic){double score=Math.log10(1+Math.max(0,comic.totalLikes))+Math.log10(1+Math.max(0,comic.totalViews));return score<3?0:score<6?.5:1;}
    private static String primaryFamily(Set<String> families){String best="RELATED";int rank=99;for(String family:families){int r=NativeRecommendationPolicy.familyRank(family);if(r<rank){rank=r;best=family;}}return best;}
    private static String primaryIntent(Set<String> ids,String family,Map<String,Intent> intents){List<String> values=new ArrayList<>();for(String id:ids){Intent i=intents.get(id);if(i!=null&&family.equals(i.family))values.add(id);}Collections.sort(values);return values.isEmpty()?"UNATTRIBUTED":values.get(0);}
    private static String reason(String family,String primaryIntent,Map<String,Intent> intents,double author,double category){Intent intent=intents.get(primaryIntent);if(primaryIntent.startsWith("V5_EXPLICIT:"))return "匹配你手动设置的偏好"+(intent==null?"":" · "+intent.label);String base="为你推荐";if("FANDOM".equals(family))base="常收藏题材"+(intent==null?"":" · "+intent.label);else if("CREATOR".equals(family))base="匹配常收藏作者"+(intent==null?"":" · "+intent.label);else if("SEMANTIC_CONJUNCTION".equals(family))base="匹配稳定的多标签组合"+(intent==null?"":" · "+intent.label);else if("SEMANTIC_ANCHOR".equals(family))base="匹配长期语义兴趣"+(intent==null?"":" · "+intent.label);else if("PORTABLE_RESERVOIR".equals(family))base="来自已同步候选池的本机重排";else if("EXPLORATION".equals(family))base="探索较少使用的兴趣"+(intent==null?"":" · "+intent.label);else if("RELATED".equals(family))base="基于收藏漫画的关联推荐";if(author>0&&!base.startsWith("匹配常收藏作者"))base+=" · 作者偏好";else if(category>0)base+=" · 分类相似";return base;}
    private static List<String> fandomKeys(MobileTagRegistry registry,PicaClient.Comic comic){LinkedHashSet<String> out=new LinkedHashSet<>();for(String tag:comic.tags){MobileTagRegistry.Resolved r=registry.resolve(tag);if(r.resolved&&"FANDOM_IP".equals(r.facet)&&!r.canonicalKey.isEmpty())out.add(r.canonicalKey);}return new ArrayList<>(out);}


    private static String fingerprint(List<PicaClient.Comic> favorites) throws Exception {List<String> ids=new ArrayList<>();for(PicaClient.Comic c:favorites)ids.add(c.id);Collections.sort(ids);MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] bytes=digest.digest(String.join("\n",ids).getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
    private static void emit(Progress progress,String phase,int done,int total){if(progress!=null)progress.update(phase,done,total);}
}
