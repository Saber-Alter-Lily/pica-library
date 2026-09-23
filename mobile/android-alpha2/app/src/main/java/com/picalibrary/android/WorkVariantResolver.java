package com.picalibrary.android;

import android.content.Context;
import android.graphics.Bitmap;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Work Identity V3 resolver.
 *
 * Paired Android prefers Desktop's full resolver. Offline Android independently
 * performs the same layered product logic: creator bucket -> title comparison ->
 * bounded perceptual-cover confirmation for ambiguous candidates. Synced
 * Canonical bindings remain higher priority than any local probable result.
 */
final class WorkVariantResolver {
    private static final String RESOLVER_VERSION="work-identity-v3-creator-title-cover-funnel";
    private static final int MAX_COVER_REVIEWS=4;
    private static final Pattern UPLOAD_NOISE=Pattern.compile("(chinese|english|translated|translation|汉化|漢化|翻译|翻譯|中文|中国翻訳|無修正|无修正|decensored|digital|dl版|修正|重制|重製|rev(?:ision)?\\.?\\s*\\d*|v\\d+)",Pattern.CASE_INSENSITIVE);
    private static final Pattern BRACKET_BLOCK=Pattern.compile("\\[[^\\]]{1,48}\\]");
    private static final Pattern PAREN_BLOCK=Pattern.compile("\\([^)]{1,48}\\)");
    private static final Pattern BRACE_BLOCK=Pattern.compile("\\{[^}]{1,48}\\}");
    private static final Pattern LEADING_CREATOR=Pattern.compile("^\\s*\\[([^\\]]{1,120})\\]\\s*");
    private static final Pattern CREATOR_PARENS=Pattern.compile("[（(][^（）()]{1,80}[）)]");
    private static final Pattern CHAPTER=Pattern.compile("\\b(?:chapter|chap|ch)\\.?\\s*(\\d+[a-z]?)\\b",Pattern.CASE_INSENSITIVE);
    private static final Pattern VOLUME=Pattern.compile("\\b(?:volume|vol)\\.?\\s*(\\d+[a-z]?)\\b",Pattern.CASE_INSENSITIVE);
    private static final Pattern PART=Pattern.compile("\\bpart\\.?\\s*(\\d+[a-z]?)\\b",Pattern.CASE_INSENSITIVE);
    private static final Pattern CJK_STRUCTURE=Pattern.compile("第?\\s*(\\d+[a-z]?)\\s*(話|话|章|巻|卷|冊|册|部)",Pattern.CASE_INSENSITIVE);
    private WorkVariantResolver(){}

    private static final class MetadataCandidate {
        final UnifiedCatalogStore.Entry entry;final boolean creatorMatch,pageCompatible;final double titleSimilarity,confidence;
        MetadataCandidate(UnifiedCatalogStore.Entry entry,boolean creatorMatch,boolean pageCompatible,double titleSimilarity,double confidence){
            this.entry=entry;this.creatorMatch=creatorMatch;this.pageCompatible=pageCompatible;this.titleSimilarity=titleSimilarity;this.confidence=confidence;
        }
    }

    static JSONObject load(Context context,String comicId){
        if(BridgeStore.paired(context)){
            try{return BridgeClient.workVariants(context,comicId);}
            catch(Exception ignored){}
        }
        return local(context,comicId);
    }

    static JSONObject local(Context context,String comicId){
        JSONObject root=new JSONObject();JSONArray items=new JSONArray();
        try{
            String id=comicId==null?"":comicId.trim();
            root.put("comicId",id);root.put("items",items);root.put("resolverVersion",RESOLVER_VERSION);
            UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(context);
            UnifiedCatalogStore.Entry current=catalog.byId.get(id);
            if(id.isEmpty()||current==null)return empty(root,items);

            LinkedHashMap<String,JSONObject> rows=new LinkedHashMap<>();
            PortableRecommendationPackageStore.Snapshot portable=PortableRecommendationPackageStore.load(context);
            PortableRecommendationPackageStore.Identity currentIdentity=portable.identityByComic.get(id);

            // Highest priority: already synced/confirmed Canonical Work bindings.
            if(currentIdentity!=null&&!currentIdentity.workId.isEmpty()){
                for(PortableRecommendationPackageStore.Identity identity:portable.identityByComic.values()){
                    if(identity==null||identity.comicId.equals(id)||!identity.workId.equals(currentIdentity.workId))continue;
                    UnifiedCatalogStore.Entry entry=catalog.byId.get(identity.comicId);
                    PortableRecommendationPackageStore.Candidate candidate=portable.candidateById.get(identity.comicId);
                    JSONObject row=new JSONObject();
                    row.put("comicId",identity.comicId);
                    boolean sameEdition=!currentIdentity.editionId.isEmpty()&&!identity.editionId.isEmpty()&&currentIdentity.editionId.equals(identity.editionId);
                    row.put("relation",sameEdition?"CONFIRMED_SAME_EDITION":"CONFIRMED_WORK_VARIANT");
                    row.put("confidence",Math.max(currentIdentity.confidence,identity.confidence));
                    row.put("workId",identity.workId);
                    row.put("editionId",identity.editionId.isEmpty()?JSONObject.NULL:identity.editionId);
                    row.put("editionLabel",identity.editionLabel);
                    fillRow(row,entry,candidate,identity);
                    rows.put(identity.comicId,row);
                }
            }

            AuthorConceptStore.Snapshot authors=AuthorConceptStore.build(context);
            ArrayList<MetadataCandidate> review=new ArrayList<>();
            for(UnifiedCatalogStore.Entry other:catalog.entries()){
                if(other==null||other.id.equals(id)||rows.containsKey(other.id))continue;
                boolean creator=sameCreator(authors,current,other);
                double similarity=titleSimilarity(current,other);
                boolean pages=closePages(pageCount(current),pageCount(other));
                if(structureConflict(current,other))continue;

                if(creator&&similarity>=.90d){
                    rows.put(other.id,probableRow(other,
                        pages?Math.min(.985d,.95d+(similarity-.90d)*.30d):Math.min(.97d,.94d+(similarity-.90d)*.30d),
                        "CREATOR_TITLE",similarity,pages,Double.NaN));
                    continue;
                }
                if(creator&&(similarity>=.68d||pages)){
                    double confidence=Math.min(.91d,.60d+Math.max(0d,similarity-.45d)*.70d+(pages?.06d:0d));
                    review.add(new MetadataCandidate(other,true,pages,similarity,confidence));
                    continue;
                }

                // Creator is deliberately not a hard gate. Missing/unresolved
                // author aliases may enter only through a very strong title
                // fallback, keeping full-catalog fuzzy search disabled.
                if(!creator&&similarity>=.985d&&pages){
                    rows.put(other.id,probableRow(other,.94d,"TITLE_FALLBACK",similarity,true,Double.NaN));
                }else if(!creator&&similarity>=.93d){
                    review.add(new MetadataCandidate(other,false,pages,similarity,pages?.86d:.82d));
                }
            }

            review.sort((a,b)->{
                int c=Double.compare(b.confidence,a.confidence);if(c!=0)return c;
                c=Double.compare(b.titleSimilarity,a.titleSimilarity);if(c!=0)return c;
                return a.entry.id.compareTo(b.entry.id);
            });

            Bitmap currentCover=null;boolean currentCoverAttempted=false;
            for(int i=0;i<review.size();i++){
                MetadataCandidate candidate=review.get(i);
                if(rows.containsKey(candidate.entry.id))continue;
                double cover=Double.NaN;
                if(i<MAX_COVER_REVIEWS){
                    if(!currentCoverAttempted){
                        currentCoverAttempted=true;
                        currentCover=CoverRepository.cacheNow(context,current);
                    }
                    Bitmap otherCover=CoverRepository.cacheNow(context,candidate.entry);
                    if(currentCover!=null&&otherCover!=null)cover=CoverIdentityHash.similarity(currentCover,otherCover);
                }

                if(!Double.isNaN(cover)&&cover>=.86d){
                    double confidence=Math.max(candidate.confidence,Math.min(.985d,.92d+(cover-.86d)*.35d+(candidate.creatorMatch?.02d:0d)));
                    rows.put(candidate.entry.id,probableRow(candidate.entry,confidence,
                        "COVER_CONFIRMATION",candidate.titleSimilarity,candidate.pageCompatible,cover));
                    continue;
                }

                // A comparable cover that clearly disagrees blocks the ambiguous
                // candidate. If no cover can be obtained, keep only stronger
                // creator-scoped metadata candidates visible for user review.
                if(Double.isNaN(cover)&&candidate.creatorMatch&&candidate.confidence>=.80d)
                    rows.put(candidate.entry.id,probableRow(candidate.entry,candidate.confidence,
                        "CREATOR_TITLE_REVIEW",candidate.titleSimilarity,candidate.pageCompatible,Double.NaN));
            }

            ArrayList<JSONObject> sorted=new ArrayList<>(rows.values());
            sorted.sort((a,b)->{
                int priority=Integer.compare(relationPriority(a.optString("relation","")),relationPriority(b.optString("relation","")));if(priority!=0)return priority;
                int confidence=Double.compare(b.optDouble("confidence",0d),a.optDouble("confidence",0d));if(confidence!=0)return confidence;
                int favorite=Boolean.compare(b.optBoolean("isFavorite"),a.optBoolean("isFavorite"));if(favorite!=0)return favorite;
                int downloaded=Integer.compare(b.optInt("downloadedPictures",0),a.optInt("downloadedPictures",0));if(downloaded!=0)return downloaded;
                return a.optString("title","").compareToIgnoreCase(b.optString("title",""));
            });
            int confirmed=0,favoriteCount=0,downloadedCount=0;
            for(JSONObject row:sorted){
                String relation=row.optString("relation","");
                if(relation.startsWith("CONFIRMED_")||relation.startsWith("ADJUDICATED_"))confirmed++;
                if(row.optBoolean("isFavorite",false))favoriteCount++;
                if(row.optInt("downloadedPictures",0)>0)downloadedCount++;
            }
            for(int i=0;i<sorted.size()&&i<48;i++)items.put(sorted.get(i));

            root.put("count",sorted.size());root.put("shownCount",items.length());
            root.put("confirmedCount",confirmed);root.put("probableCount",sorted.size()-confirmed);
            root.put("favoriteCount",favoriteCount);root.put("downloadedCount",downloadedCount);
            root.put("workId",currentIdentity!=null&&!currentIdentity.workId.isEmpty()?currentIdentity.workId:JSONObject.NULL);
            root.put("editionId",currentIdentity!=null&&!currentIdentity.editionId.isEmpty()?currentIdentity.editionId:JSONObject.NULL);
        }catch(Exception ignored){
            try{return empty(root,items);}catch(Exception ignored2){}
        }
        return root;
    }

    private static JSONObject empty(JSONObject root,JSONArray items)throws Exception{
        root.put("count",0);root.put("shownCount",0);root.put("confirmedCount",0);root.put("probableCount",0);
        root.put("favoriteCount",0);root.put("downloadedCount",0);root.put("items",items);
        root.put("workId",JSONObject.NULL);root.put("editionId",JSONObject.NULL);return root;
    }

    private static int relationPriority(String relation){
        if("CONFIRMED_SAME_EDITION".equals(relation))return 0;
        if("CONFIRMED_WORK_VARIANT".equals(relation))return 1;
        if("ADJUDICATED_EDITION_VARIANT".equals(relation))return 2;
        if("ADJUDICATED_SAME_WORK".equals(relation))return 3;
        return 4;
    }

    private static JSONObject probableRow(UnifiedCatalogStore.Entry entry,double confidence,String stage,double titleSimilarity,boolean pages,double cover)throws Exception{
        JSONObject row=new JSONObject();row.put("comicId",entry.id);row.put("relation","PROBABLE_SAME_WORK");row.put("confidence",confidence);
        JSONObject evidence=new JSONObject();evidence.put("resolverVersion",RESOLVER_VERSION);evidence.put("funnelStage",stage);evidence.put("titleSimilarity",titleSimilarity);evidence.put("pageCountCompatible",pages);
        if(!Double.isNaN(cover))evidence.put("coverIdentitySimilarity",cover);
        row.put("identityEvidence",evidence);fillRow(row,entry,null,null);return row;
    }

    private static void fillRow(JSONObject row,UnifiedCatalogStore.Entry entry,PortableRecommendationPackageStore.Candidate candidate,PortableRecommendationPackageStore.Identity identity)throws Exception{
        String title=entry!=null?entry.title:candidate!=null?candidate.title:identity!=null?identity.workTitle:"";
        String author=entry!=null?entry.author:candidate!=null?candidate.author:"";
        String canonical=entry!=null?entry.canonicalAuthor:candidate!=null?candidate.canonicalAuthor:"";
        int pages=entry!=null?pageCount(entry):candidate!=null?candidate.pagesCount:0;
        String provider=entry!=null&&!entry.providerId.isEmpty()?entry.providerId:candidate!=null?candidate.providerId:row.optString("comicId","").startsWith("eh:")?"eh":"pica";
        row.put("title",title);row.put("author",author);row.put("canonicalAuthor",canonical);row.put("pagesCount",Math.max(0,pages));row.put("providerId",provider);
        if(entry!=null)row.put("alternateTitles",new JSONArray(entry.alternateTitles));
        if(candidate!=null&&!candidate.coverUrl.isEmpty())row.put("coverUrl",candidate.coverUrl);
        row.put("isFavorite",entry!=null&&entry.favorite);
        int downloaded=entry==null?0:Math.max(entry.desktopDownloadedPictures,entry.phoneDownloaded?entry.knownPictures:0);
        row.put("downloadedPictures",Math.max(0,downloaded));row.put("knownPictures",entry==null?Math.max(0,pages):Math.max(0,entry.knownPictures));
        if(entry!=null&&!entry.desktopCoverPath.isEmpty())row.put("coverPath",entry.desktopCoverPath);
    }

    static double titleSimilarity(UnifiedCatalogStore.Entry left,UnifiedCatalogStore.Entry right){
        ArrayList<String> a=titles(left),b=titles(right);double best=0d;
        for(String x:a)for(String y:b){
            if(x.equals(y))return 1d;
            best=Math.max(best,editSimilarity(x,y));
            if(x.length()>=4&&y.length()>=4&&(x.contains(y)||y.contains(x))){
                double ratio=Math.min(x.length(),y.length())/(double)Math.max(x.length(),y.length());
                best=Math.max(best,.86d+.14d*ratio);
            }
        }
        return Math.max(0d,Math.min(1d,best));
    }

    private static ArrayList<String> titles(UnifiedCatalogStore.Entry entry){
        ArrayList<String> out=new ArrayList<>();addTitle(out,entry.title);for(String value:entry.alternateTitles)addTitle(out,value);return out;
    }
    private static void addTitle(ArrayList<String> out,String value){String title=cleanTitle(value);if(!title.isEmpty()&&!out.contains(title))out.add(title);}
    private static String replaceNoiseBlocks(String text,Pattern pattern){
        Matcher matcher=pattern.matcher(text);StringBuffer out=new StringBuffer();
        while(matcher.find())matcher.appendReplacement(out,UPLOAD_NOISE.matcher(matcher.group()).find()?" ":Matcher.quoteReplacement(matcher.group()));
        matcher.appendTail(out);return out.toString();
    }
    private static String stripLeadingCreatorCredit(String value){
        Matcher prefix=LEADING_CREATOR.matcher(value);
        if(!prefix.find()||!CREATOR_PARENS.matcher(prefix.group(1)).find())return value;
        return value.substring(prefix.end()).trim();
    }
    private static String cleanTitle(String value){
        String text=Normalizer.normalize(value==null?"":value,Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        text=stripLeadingCreatorCredit(text);
        text=replaceNoiseBlocks(text,BRACKET_BLOCK);
        text=replaceNoiseBlocks(text,PAREN_BLOCK);
        text=replaceNoiseBlocks(text,BRACE_BLOCK);
        text=text.replaceAll("(?i)\\b(chinese|english|translated|digital|decensored|rev(?:ision)?\\.?\\s*\\d*|v\\d+)\\b"," ");
        text=text.replaceAll("(汉化|漢化|翻译|翻譯|中文|無修正|无修正|修正|重制|重製)"," ");
        return text.replaceAll("[\\p{P}\\p{S}_\\s]+","").trim();
    }
    private static void addStructure(Map<String,Set<String>> out,String kind,String token){
        String normalized=token==null?"":token.toLowerCase(Locale.ROOT).replaceFirst("^0+(?=\\d)","");
        if(normalized.isEmpty())return;out.computeIfAbsent(kind,k->new LinkedHashSet<>()).add(normalized);
    }
    private static void collectStructure(Map<String,Set<String>> out,String raw){
        String text=Normalizer.normalize(raw==null?"":raw,Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        Matcher m=CHAPTER.matcher(text);while(m.find())addStructure(out,"chapter",m.group(1));
        m=VOLUME.matcher(text);while(m.find())addStructure(out,"volume",m.group(1));
        m=PART.matcher(text);while(m.find())addStructure(out,"part",m.group(1));
        m=CJK_STRUCTURE.matcher(text);while(m.find()){
            String suffix=m.group(2),kind=("話".equals(suffix)||"话".equals(suffix)||"章".equals(suffix))?"chapter":(("巻".equals(suffix)||"卷".equals(suffix)||"冊".equals(suffix)||"册".equals(suffix))?"volume":"part");
            addStructure(out,kind,m.group(1));
        }
    }
    private static Map<String,Set<String>> structure(UnifiedCatalogStore.Entry entry){
        Map<String,Set<String>> out=new LinkedHashMap<>();collectStructure(out,entry.title);for(String value:entry.alternateTitles)collectStructure(out,value);return out;
    }
    static boolean structureConflict(UnifiedCatalogStore.Entry left,UnifiedCatalogStore.Entry right){
        Map<String,Set<String>> a=structure(left),b=structure(right);
        for(Map.Entry<String,Set<String>> item:a.entrySet()){
            Set<String> other=b.get(item.getKey());if(other==null||other.isEmpty())continue;
            boolean overlap=false;for(String value:item.getValue())if(other.contains(value)){overlap=true;break;}
            if(!overlap)return true;
        }
        return false;
    }

    private static double editSimilarity(String left,String right){
        if(left.equals(right))return 1d;if(left.isEmpty()||right.isEmpty())return 0d;
        int[] previous=new int[right.length()+1];for(int j=0;j<=right.length();j++)previous[j]=j;
        for(int i=1;i<=left.length();i++){int[] current=new int[right.length()+1];current[0]=i;for(int j=1;j<=right.length();j++)current[j]=Math.min(Math.min(current[j-1]+1,previous[j]+1),previous[j-1]+(left.charAt(i-1)==right.charAt(j-1)?0:1));previous=current;}
        return Math.max(0d,1d-previous[right.length()]/(double)Math.max(left.length(),right.length()));
    }

    private static boolean sameCreator(AuthorConceptStore.Snapshot authors,UnifiedCatalogStore.Entry left,UnifiedCatalogStore.Entry right){
        if(left.authorId!=null&&!left.authorId.isEmpty()&&left.authorId.equals(right.authorId))return true;
        String a=norm(left.canonicalAuthor.isEmpty()?left.author:left.canonicalAuthor),b=norm(right.canonicalAuthor.isEmpty()?right.author:right.canonicalAuthor);
        if(!a.isEmpty()&&a.equals(b))return true;
        for(AuthorConceptStore.Concept concept:authors.forComic(left.id))if(concept.comicIds.contains(right.id))return true;
        return false;
    }

    private static int pageCount(UnifiedCatalogStore.Entry entry){return Math.max(Math.max(entry.knownPictures,entry.desktopDownloadedPictures),entry.remotePageCount);}
    private static boolean closePages(int left,int right){if(left<=0||right<=0)return false;int delta=Math.abs(left-right);return delta<=Math.max(4,(int)Math.ceil(Math.max(left,right)*.08d));}
    private static String norm(String value){return Normalizer.normalize(value==null?"":value,Normalizer.Form.NFKC).replaceAll("\\s+"," ").trim().toLowerCase(Locale.ROOT);}
}
