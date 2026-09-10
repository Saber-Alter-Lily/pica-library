package com.picalibrary.android;

import android.content.Context;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;

/** Mobile-native Recommendation V3 using frozen registry authority and Desktop-compatible neutral ranking semantics. */
final class NativeRecommendationEngine {
    interface Progress { void update(String phase,int done,int total); }
    private static final class Interest {
        final String key,label,facet,utility,observedLabel;final LinkedHashSet<String> comicIds=new LinkedHashSet<>();
        Interest(MobileTagRegistry.Resolved r,String observed){key=r.canonicalKey;label=r.canonicalLabel;facet=r.facet;utility=r.retrievalUtility;observedLabel=observed;}
        int support(){return comicIds.size();}
    }
    private static final class Intent {
        final String id,family,label,relatedSeed;final List<String> queries=new ArrayList<>();
        Intent(String id,String family,String label,String relatedSeed){this.id=id;this.family=family;this.label=label;this.relatedSeed=relatedSeed;}
        int routeCost(){return "SEMANTIC_CONJUNCTION".equals(family)?2:1;}
    }
    private static final class Route {
        final String id,intentId,family,type,query,seed;
        Route(String id,String intentId,String family,String type,String query,String seed){this.id=id;this.intentId=intentId;this.family=family;this.type=type;this.query=query;this.seed=seed;}
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

    static NativeRecommendationStore.Snapshot build(Context context,Progress progress) throws Exception {
        Context app=context.getApplicationContext();PicaClient client=new PicaClient(app);MobileTagRegistry registry=MobileTagRegistry.load(app);
        emit(progress,"正在读取 Pica 收藏",0,1);List<PicaClient.Comic> favorites=client.favoritesAll();if(favorites.isEmpty())throw new IllegalStateException("Pica 收藏为空，无法建立手机推荐画像");
        LinkedHashMap<String,PicaClient.Comic> favoriteById=new LinkedHashMap<>();for(PicaClient.Comic comic:favorites)if(comic!=null&&!comic.id.isEmpty())favoriteById.put(comic.id,comic);favorites=new ArrayList<>(favoriteById.values());UnifiedPicaCatalogSync.mergeAll(app,favorites);markPicaFavorites(app,favorites);

        emit(progress,"正在构建本机 V3 兴趣画像",0,favorites.size());Map<String,Integer> authorCounts=new HashMap<>();Map<String,String> authorLabels=new HashMap<>();Map<String,Interest> interests=new LinkedHashMap<>();int seen=0;
        for(PicaClient.Comic comic:favorites){String authorKey=MobileTagRegistry.normalize(comic.author);if(!authorKey.isEmpty()){authorCounts.put(authorKey,authorCounts.getOrDefault(authorKey,0)+1);authorLabels.putIfAbsent(authorKey,comic.author);}Set<String> perComic=new HashSet<>();for(String rawTag:comic.tags){MobileTagRegistry.Resolved r=registry.resolve(rawTag);if(!r.primaryEligible())continue;String key=r.facet+"\u0000"+r.canonicalKey;if(!perComic.add(key))continue;Interest interest=interests.get(key);if(interest==null){interest=new Interest(r,rawTag);interests.put(key,interest);}interest.comicIds.add(comic.id);}seen++;emit(progress,"正在构建本机 V3 兴趣画像",seen,favorites.size());}
        List<Intent> intents=buildIntents(favorites,authorCounts,authorLabels,interests);List<Route> routes=routes(intents);if(routes.isEmpty())throw new IllegalStateException("当前收藏缺少可用于 Pica 召回的 Recommendation V3 锚点");

        emit(progress,"正在从 Pica 多路召回候选",0,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);LinkedHashMap<String,Candidate> candidates=new LinkedHashMap<>();int requests=0;
        for(int page=1;page<=NativeRecommendationPolicy.MAX_PAGE&&requests<NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS&&candidates.size()<NativeRecommendationPolicy.TARGET_POOL;page++){
            for(Route route:routes){if(requests>=NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS||candidates.size()>=NativeRecommendationPolicy.TARGET_POOL)break;if(page>1&&"RELATED".equals(route.type))continue;List<PicaClient.Comic> docs;
                try{docs="RELATED".equals(route.type)?client.related(route.seed):client.search(route.query,page,"ld",Collections.emptyList()).comics;}catch(Exception e){requests++;emit(progress,"部分召回路线失败，继续其他路线",requests,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);continue;}
                requests++;int baseRank=(page-1)*20;for(int i=0;i<docs.size();i++){PicaClient.Comic comic=docs.get(i);if(comic==null||comic.id.isEmpty()||favoriteById.containsKey(comic.id)||safetyExcluded(registry,comic))continue;Candidate candidate=candidates.get(comic.id);if(candidate==null){candidate=new Candidate(comic);candidates.put(comic.id,candidate);}else if(candidate.comic.tags.isEmpty()&&!comic.tags.isEmpty())candidate.comic=comic;candidate.intentIds.add(route.intentId);candidate.families.add(route.family);candidate.bestProviderRank=Math.min(candidate.bestProviderRank,baseRank+i+1);}emit(progress,"正在从 Pica 多路召回候选",requests,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);
            }
        }
        List<PicaClient.Comic> discovered=new ArrayList<>();for(Candidate candidate:candidates.values())discovered.add(candidate.comic);UnifiedPicaCatalogSync.mergeAll(app,discovered);

        emit(progress,"正在使用冻结兼容 Ranker 排序",0,candidates.size());Map<String,Intent> intentMap=new HashMap<>();for(Intent intent:intents)intentMap.put(intent.id,intent);List<Ranked> ranked=new ArrayList<>();int rankedDone=0;
        for(Candidate candidate:candidates.values()){double author=authorAffinity(candidate.comic,favorites),category=categorySimilarity(candidate.comic,favorites),route=Math.min(1d,candidate.families.size()/3d),popularity=popularity(candidate.comic);double score=NativeRecommendationPolicy.frozenNeutralScore(author,category,route,popularity);String family=primaryFamily(candidate.families),primaryIntent=primaryIntent(candidate.intentIds,family,intentMap),why=reason(family,primaryIntent,intentMap,author,category);ranked.add(new Ranked(candidate,score,author,category,route,popularity,family,primaryIntent,why,fandomKeys(registry,candidate.comic)));rankedDone++;emit(progress,"正在使用冻结兼容 Ranker 排序",rankedDone,candidates.size());}
        ranked.sort((a,b)->{int byScore=Double.compare(b.score,a.score);if(byScore!=0)return byScore;int provider=Integer.compare(a.candidate.bestProviderRank,b.candidate.bestProviderRank);return provider!=0?provider:a.candidate.comic.id.compareTo(b.candidate.comic.id);});

        NativeRecommendationStore.Snapshot snapshot=new NativeRecommendationStore.Snapshot();snapshot.cycleId=UUID.randomUUID().toString();snapshot.generatedAt=Instant.now().toString();snapshot.favoriteFingerprint=fingerprint(favorites);snapshot.registryFingerprint=registry.manifestFingerprint;snapshot.favoriteCount=favorites.size();snapshot.candidateCount=ranked.size();snapshot.readiness=NativeRecommendationPolicy.readiness(ranked.size());snapshot.batchIndex=0;snapshot.cooldownIds.addAll(NativeRecommendationStore.cooldownForNextCycle(app));
        if(NativeRecommendationPolicy.readinessRank(ranked.size())>0){emit(progress,"正在分配 12 本推荐批次",0,NativeRecommendationPolicy.MAX_BATCHES);Set<String> allocated=new HashSet<>();for(int batch=0;batch<NativeRecommendationPolicy.MAX_BATCHES;batch++){List<Ranked> selected=allocate(ranked,allocated,snapshot.cooldownIds);if(selected.isEmpty())break;List<NativeRecommendationStore.Item> items=new ArrayList<>();for(Ranked value:selected){PicaClient.Comic comic=value.candidate.comic;items.add(new NativeRecommendationStore.Item(comic.id,comic.title,comic.author,value.reason,value.family,value.primaryIntent,value.score));allocated.add(comic.id);}snapshot.batches.add(items);emit(progress,"正在分配 12 本推荐批次",batch+1,NativeRecommendationPolicy.MAX_BATCHES);}}
        NativeRecommendationStore.save(app,snapshot);emit(progress,"手机原生 Recommendation V3 已更新",1,1);return snapshot;
    }

    private static void markPicaFavorites(Context context,List<PicaClient.Comic> favorites){UnifiedCatalogStore.Snapshot snapshot=UnifiedCatalogStore.load(context);for(PicaClient.Comic comic:favorites){UnifiedCatalogStore.Entry entry=snapshot.byId.get(comic.id);if(entry!=null)entry.favorite=true;}UnifiedCatalogStore.save(context,snapshot);}

    private static List<Intent> buildIntents(List<PicaClient.Comic> favorites,Map<String,Integer> authorCounts,Map<String,String> authorLabels,Map<String,Interest> interests){
        List<Interest> all=new ArrayList<>(interests.values());Comparator<Interest> strong=(a,b)->{int c=Integer.compare(b.support(),a.support());return c!=0?c:a.key.compareTo(b.key);};
        List<Intent> fandom=new ArrayList<>(),creator=new ArrayList<>(),conjunction=new ArrayList<>(),semanticAnchor=new ArrayList<>(),exploration=new ArrayList<>(),related=new ArrayList<>();
        List<Interest> fandoms=new ArrayList<>();for(Interest i:all)if("FANDOM_IP".equals(i.facet)&&i.support()>0)fandoms.add(i);fandoms.sort(strong);for(int i=0;i<Math.min(3,fandoms.size());i++){Interest x=fandoms.get(i);Intent intent=new Intent("FANDOM:"+x.key,"FANDOM",x.label,"");intent.queries.add(queryLabel(x));fandom.add(intent);}
        List<Map.Entry<String,Integer>> authors=new ArrayList<>(authorCounts.entrySet());authors.sort((a,b)->{int c=Integer.compare(b.getValue(),a.getValue());return c!=0?c:a.getKey().compareTo(b.getKey());});for(int i=0;i<Math.min(3,authors.size());i++){Map.Entry<String,Integer> row=authors.get(i);String label=authorLabels.getOrDefault(row.getKey(),row.getKey());Intent intent=new Intent("CREATOR:"+row.getKey(),"CREATOR",label,"");intent.queries.add(label);creator.add(intent);}

        List<Interest> semanticPool=new ArrayList<>();for(Interest i:all)if(!"FANDOM_IP".equals(i.facet)&&!"BROAD_RECALL".equals(i.utility))semanticPool.add(i);
        class Pair {final Interest a,b;final int co;final double lift;Pair(Interest a,Interest b,int co,double lift){this.a=a;this.b=b;this.co=co;this.lift=lift;}}
        List<Pair> pairs=new ArrayList<>();for(int i=0;i<semanticPool.size();i++)for(int j=i+1;j<semanticPool.size();j++){Interest a=semanticPool.get(i),b=semanticPool.get(j);if(a.facet.equals(b.facet)||(!highUtility(a.utility)&&!highUtility(b.utility)))continue;int co=0;for(String id:a.comicIds)if(b.comicIds.contains(id))co++;if(!NativeRecommendationPolicy.conjunctionEligible(favorites.size(),a.support(),b.support(),co))continue;double expected=(double)a.support()*b.support()/Math.max(1,favorites.size());pairs.add(new Pair(a,b,co,expected>0?co/expected:0));}
        pairs.sort((a,b)->{int c=Integer.compare(b.co,a.co);if(c!=0)return c;c=Double.compare(b.lift,a.lift);return c!=0?c:(a.a.key+"|"+a.b.key).compareTo(b.a.key+"|"+b.b.key);});for(int i=0;i<Math.min(3,pairs.size());i++){Pair p=pairs.get(i);Intent intent=new Intent("SEMCONJ:"+p.a.key+"|"+p.b.key,"SEMANTIC_CONJUNCTION",p.a.label+" × "+p.b.label,"");intent.queries.add(queryLabel(p.a));intent.queries.add(queryLabel(p.b));conjunction.add(intent);}
        List<Interest> high=new ArrayList<>();for(Interest i:semanticPool)if(highUtility(i.utility))high.add(i);high.sort(strong);if(!high.isEmpty()){Interest x=high.get(0);Intent intent=new Intent("SEMANTIC_ANCHOR:"+x.key,"SEMANTIC_ANCHOR",x.label,"");intent.queries.add(queryLabel(x));semanticAnchor.add(intent);}
        List<Interest> eligible=new ArrayList<>();for(Interest i:all)if(!"FANDOM_IP".equals(i.facet)&&i.support()>0&&!"PROFILE_ONLY".equals(i.utility)&&!"SAFETY_BLOCKED".equals(i.utility)&&!"EXCLUDE".equals(i.utility))eligible.add(i);eligible.sort((a,b)->{int c=Integer.compare(a.support(),b.support());return c!=0?c:a.key.compareTo(b.key);});if(!eligible.isEmpty()){Interest x=eligible.get(0);Intent intent=new Intent("EXPLORATION:"+x.key,"EXPLORATION",x.label,"");intent.queries.add(queryLabel(x));exploration.add(intent);}
        List<PicaClient.Comic> sortedFavorites=new ArrayList<>(favorites);sortedFavorites.sort(Comparator.comparing(c->c.id));if(!sortedFavorites.isEmpty()){PicaClient.Comic seed=sortedFavorites.get(0);related.add(new Intent("RELATED:"+seed.id,"RELATED",seed.title,seed.id));}

        Map<String,List<Intent>> families=new LinkedHashMap<>();families.put("FANDOM",fandom);families.put("CREATOR",creator);families.put("SEMANTIC_CONJUNCTION",conjunction);families.put("SEMANTIC_ANCHOR",semanticAnchor);families.put("EXPLORATION",exploration);families.put("RELATED",related);List<Intent> out=new ArrayList<>();int cost=0;
        for(int round=0;round<3&&out.size()<12;round++)for(List<Intent> values:families.values()){if(round>=values.size()||out.size()>=12)continue;Intent candidate=values.get(round);if(cost+candidate.routeCost()>14)continue;out.add(candidate);cost+=candidate.routeCost();}
        return out;
    }

    private static List<Route> routes(List<Intent> intents){List<Route> out=new ArrayList<>();for(Intent intent:intents){if("RELATED".equals(intent.family)){out.add(new Route(intent.id+":RELATED",intent.id,intent.family,"RELATED","",intent.relatedSeed));continue;}for(int i=0;i<intent.queries.size();i++){String query=intent.queries.get(i);if(query==null||query.trim().isEmpty())continue;String type="CREATOR".equals(intent.family)?"AUTHOR":"KEYWORD";out.add(new Route(intent.id+":"+type+":"+i,intent.id,intent.family,type,query.trim(),""));}}out.sort((a,b)->{int family=Integer.compare(NativeRecommendationPolicy.familyRank(a.family),NativeRecommendationPolicy.familyRank(b.family));return family!=0?family:a.id.compareTo(b.id);});return out;}
    private static boolean highUtility(String value){return "HIGH_PRECISION_ANCHOR".equals(value)||"CONJUNCTION_ANCHOR".equals(value);}
    private static String queryLabel(Interest interest){return interest.observedLabel==null||interest.observedLabel.trim().isEmpty()?interest.label:interest.observedLabel;}
    private static boolean safetyExcluded(MobileTagRegistry registry,PicaClient.Comic comic){for(String tag:comic.tags)if(registry.resolve(tag).safetyBlocked())return true;return false;}
    private static double authorAffinity(PicaClient.Comic candidate,List<PicaClient.Comic> favorites){String key=MobileTagRegistry.normalize(candidate.author);if(key.isEmpty())return 0;int n=0;for(PicaClient.Comic f:favorites)if(key.equals(MobileTagRegistry.normalize(f.author)))n++;return n/(double)Math.max(1,favorites.size());}
    private static double categorySimilarity(PicaClient.Comic candidate,List<PicaClient.Comic> favorites){Set<String> target=normalized(candidate.categories);double best=0;for(PicaClient.Comic f:favorites){Set<String> other=normalized(f.categories);int common=0;for(String x:target)if(other.contains(x))common++;best=Math.max(best,common/(double)Math.max(1,Math.max(target.size(),other.size())));}return best;}
    private static Set<String> normalized(List<String> values){Set<String> out=new HashSet<>();for(String value:values){String n=MobileTagRegistry.normalize(value);if(!n.isEmpty())out.add(n);}return out;}
    private static double popularity(PicaClient.Comic comic){double score=Math.log10(1+Math.max(0,comic.totalLikes))+Math.log10(1+Math.max(0,comic.totalViews));return score<3?0:score<6?.5:1;}
    private static String primaryFamily(Set<String> families){String best="RELATED";int rank=99;for(String family:families){int r=NativeRecommendationPolicy.familyRank(family);if(r<rank){rank=r;best=family;}}return best;}
    private static String primaryIntent(Set<String> ids,String family,Map<String,Intent> intents){List<String> values=new ArrayList<>();for(String id:ids){Intent i=intents.get(id);if(i!=null&&family.equals(i.family))values.add(id);}Collections.sort(values);return values.isEmpty()?"UNATTRIBUTED":values.get(0);}
    private static String reason(String family,String primaryIntent,Map<String,Intent> intents,double author,double category){Intent intent=intents.get(primaryIntent);String base="为你推荐";if("FANDOM".equals(family))base="常收藏题材"+(intent==null?"":" · "+intent.label);else if("CREATOR".equals(family))base="匹配常收藏作者"+(intent==null?"":" · "+intent.label);else if("SEMANTIC_CONJUNCTION".equals(family))base="匹配稳定的多标签组合"+(intent==null?"":" · "+intent.label);else if("SEMANTIC_ANCHOR".equals(family))base="匹配长期语义兴趣"+(intent==null?"":" · "+intent.label);else if("EXPLORATION".equals(family))base="探索较少使用的兴趣"+(intent==null?"":" · "+intent.label);else if("RELATED".equals(family))base="基于收藏漫画的关联推荐";if(author>0&&!base.startsWith("匹配常收藏作者"))base+=" · 作者偏好";else if(category>0)base+=" · 分类相似";return base;}
    private static List<String> fandomKeys(MobileTagRegistry registry,PicaClient.Comic comic){LinkedHashSet<String> out=new LinkedHashSet<>();for(String tag:comic.tags){MobileTagRegistry.Resolved r=registry.resolve(tag);if(r.resolved&&"FANDOM_IP".equals(r.facet)&&!r.canonicalKey.isEmpty())out.add(r.canonicalKey);}return new ArrayList<>(out);}

    private static List<Ranked> allocate(List<Ranked> ranked,Set<String> already,Set<String> recent){List<Ranked> selected=new ArrayList<>();Set<String> selectedIds=new HashSet<>();Map<String,Integer> fandom=new HashMap<>(),author=new HashMap<>(),intent=new HashMap<>();int[] related={0};int[][] caps={{4,3,4,2},{5,4,5,3},{Integer.MAX_VALUE,Integer.MAX_VALUE,Integer.MAX_VALUE,Integer.MAX_VALUE}};boolean[] recentPass=recent.isEmpty()?new boolean[]{true}:new boolean[]{false,true};for(boolean allowRecent:recentPass){for(int[] cap:caps){for(Ranked value:ranked){if(selected.size()>=NativeRecommendationPolicy.BATCH_SIZE)break;String id=value.candidate.comic.id;if(already.contains(id)||selectedIds.contains(id)||(!allowRecent&&recent.contains(id)))continue;String authorKey=MobileTagRegistry.normalize(value.candidate.comic.author);boolean capped=false;for(String key:value.fandomKeys)if(fandom.getOrDefault(key,0)>=cap[0]){capped=true;break;}if(capped||(!authorKey.isEmpty()&&author.getOrDefault(authorKey,0)>=cap[1])||intent.getOrDefault(value.primaryIntent,0)>=cap[2]||(value.relatedOnly()&&related[0]>=cap[3]))continue;selected.add(value);selectedIds.add(id);for(String key:new HashSet<>(value.fandomKeys))fandom.put(key,fandom.getOrDefault(key,0)+1);if(!authorKey.isEmpty())author.put(authorKey,author.getOrDefault(authorKey,0)+1);intent.put(value.primaryIntent,intent.getOrDefault(value.primaryIntent,0)+1);if(value.relatedOnly())related[0]++;}}if(selected.size()>=NativeRecommendationPolicy.BATCH_SIZE)break;}return selected;}
    private static String fingerprint(List<PicaClient.Comic> favorites) throws Exception {List<String> ids=new ArrayList<>();for(PicaClient.Comic c:favorites)ids.add(c.id);Collections.sort(ids);MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] bytes=digest.digest(String.join("\n",ids).getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
    private static void emit(Progress progress,String phase,int done,int total){if(progress!=null)progress.update(phase,done,total);}
}