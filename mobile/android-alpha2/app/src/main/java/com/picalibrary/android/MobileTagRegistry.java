package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.*;
import org.json.*;

/** Android read-only loader for the frozen Recommendation V3 tag/entity authority. */
final class MobileTagRegistry {
    static final class Resolved {
        final String rawTag,normalizedTag,canonicalKey,canonicalLabel,facet,recommendationRole,retrievalUtility,safetyStatus,resolutionType;
        final boolean resolved,recommendationEligible;
        Resolved(String rawTag,String normalizedTag,String canonicalKey,String canonicalLabel,String facet,String recommendationRole,String retrievalUtility,boolean recommendationEligible,String safetyStatus,String resolutionType,boolean resolved){
            this.rawTag=rawTag;this.normalizedTag=normalizedTag;this.canonicalKey=canonicalKey;this.canonicalLabel=canonicalLabel;this.facet=facet;this.recommendationRole=recommendationRole;this.retrievalUtility=retrievalUtility;this.recommendationEligible=recommendationEligible;this.safetyStatus=safetyStatus;this.resolutionType=resolutionType;this.resolved=resolved;
        }
        boolean safetyBlocked(){return "SAFETY_EXCLUDE".equals(recommendationRole)||"SAFETY_BLOCKED".equals(retrievalUtility)||"BLOCK_MINOR_EXPLICIT".equals(safetyStatus);}
        boolean primaryEligible(){return resolved&&recommendationEligible&&!safetyBlocked()&&("CORE".equals(recommendationRole)||"SECONDARY".equals(recommendationRole));}
    }

    private static final String ROOT="native-v3/";
    private static volatile MobileTagRegistry INSTANCE;
    private final Map<String,Map<String,String>> semantic=new HashMap<>(),entities=new HashMap<>();
    private final Map<String,String> aliases=new HashMap<>();
    private final Set<String> unresolved=new HashSet<>();
    final String manifestFingerprint;

    private MobileTagRegistry(Context context) throws Exception {
        verifyAuthority(context);
        JSONObject manifest=new JSONObject(readText(context,"PICA_REGISTRY_V3_FINAL_MANIFEST.json"));
        manifestFingerprint=sha256(readBytes(context,"PICA_REGISTRY_V3_FINAL_MANIFEST.json"));
        for(Map<String,String> row:parseCsv(readText(context,"PICA_TAG_LIBRARY_V2_REVIEWED.csv"))){
            Map<String,String> a=new HashMap<>();a.put("raw_tag",row.getOrDefault("raw_tag",""));a.put("normalized_tag",row.getOrDefault("normalized_tag",""));a.put("canonical_tag",row.getOrDefault("proposed_canonical_tag",""));a.put("facet",row.getOrDefault("proposed_facet_v2",""));a.put("recommendation_role",row.getOrDefault("proposed_recommendation_role",""));a.put("retrieval_utility",row.getOrDefault("proposed_retrieval_utility",""));a.put("recommendation_eligible",row.getOrDefault("recommendation_eligible","False"));a.put("safety_status",row.getOrDefault("safety_status",""));indexSemantic(a);
        }
        for(Map<String,String> row:parseCsv(readText(context,manifest.optString("runtime_semantic_file","PICA_TAG_REGISTRY_V3_RUNTIME.csv")))){
            Map<String,String> a=new HashMap<>();a.put("normalized_tag",row.getOrDefault("normalized_tag",""));a.put("canonical_tag",row.getOrDefault("canonical_tag",""));a.put("facet",row.getOrDefault("facet",""));a.put("recommendation_role",row.getOrDefault("recommendation_role",""));a.put("retrieval_utility",row.getOrDefault("retrieval_utility",""));a.put("recommendation_eligible",row.getOrDefault("recommendation_eligible","False"));a.put("safety_status",row.getOrDefault("safety_status",""));indexSemantic(a);
        }
        for(Map<String,String> row:parseCsv(readText(context,"PICA_ENTITY_REGISTRY_V3_FINAL.csv"))){
            Map<String,String> a=new HashMap<>();String type=row.getOrDefault("entity_type","");a.put("normalized_tag",row.getOrDefault("normalized_source_tag",""));a.put("canonical_name",row.getOrDefault("canonical_name",""));a.put("entity_key",row.getOrDefault("entity_key",""));a.put("entity_type",type);a.put("parent_entity_key",row.getOrDefault("parent_entity_key",""));a.put("facet","FANDOM_IP".equals(type)?"FANDOM_IP":"FANDOM_CHARACTER".equals(type)?"FANDOM_CHARACTER":row.getOrDefault("facet",""));a.put("recommendation_role",row.getOrDefault("recommendation_role",""));a.put("retrieval_utility",row.getOrDefault("retrieval_utility",""));a.put("recommendation_eligible",row.getOrDefault("recommendation_eligible","False"));a.put("safety_status",row.getOrDefault("safety_status",""));indexEntity(a);
        }
        JSONArray v2Aliases=new JSONArray(readText(context,"PICA_TAG_ALIAS_MAP_V2.json"));
        for(int i=0;i<v2Aliases.length();i++){JSONObject o=v2Aliases.optJSONObject(i);if(o==null)continue;String raw=o.optString("raw_tag","").trim(),target=o.optString("proposed_canonical_tag","").trim();if(!raw.isEmpty()&&!target.isEmpty())aliases.put(normalize(raw),target);}
        JSONObject v3Aliases=new JSONObject(readText(context,"PICA_TAG_ALIAS_MAP_V3_FINAL.json"));
        Iterator<String> keys=v3Aliases.keys();while(keys.hasNext()){String key=keys.next();String target=v3Aliases.optString(key,"").trim();if(!target.isEmpty())aliases.put(normalize(key),target);}
        for(Map<String,String> row:parseCsv(readText(context,"PICA_TAG_UNRESOLVED_V3_FINAL_WATCHLIST.csv"))){String value=normalize(row.getOrDefault("normalized_tag",""));if(!value.isEmpty())unresolved.add(value);}
    }

    static MobileTagRegistry load(Context context) throws Exception {
        MobileTagRegistry value=INSTANCE;if(value!=null)return value;
        synchronized(MobileTagRegistry.class){if(INSTANCE==null)INSTANCE=new MobileTagRegistry(context.getApplicationContext());return INSTANCE;}
    }

    Resolved resolve(String rawTag){
        String raw=rawTag==null?"":rawTag,normalized=normalize(raw);String alias=aliases.get(normalized);
        if(alias!=null){Map<String,String> row=semantic.get(normalize(alias));if(row==null)row=entities.get(normalize(alias));Resolved r=resolved(raw,normalized,alias,row,"ALIAS");if(row!=null&&"AGE_AMBIGUOUS_REVIEW".equals(row.get("safety_status")))return new Resolved(r.rawTag,r.normalizedTag,r.canonicalKey,r.canonicalLabel,r.facet,r.recommendationRole,"PROFILE_ONLY",false,r.safetyStatus,r.resolutionType,true);return r;}
        Map<String,String> row=semantic.get(normalized);if(row!=null){boolean safety="SAFETY_EXCLUDE".equals(row.get("recommendation_role"))||"SAFETY_BLOCKED".equals(row.get("retrieval_utility"))||"BLOCK_MINOR_EXPLICIT".equals(row.get("safety_status"));return resolved(raw,normalized,row.getOrDefault("canonical_tag",""),row,safety?"SAFETY":"SEMANTIC");}
        row=entities.get(normalized);if(row!=null)return resolved(raw,normalized,row.getOrDefault("entity_key",""),row,"ENTITY");
        return new Resolved(raw,normalized,"","","","UNRESOLVED","UNRESOLVED",false,"",unresolved.contains(normalized)?"WATCHLIST":"OPEN_WORLD",false);
    }

    private Resolved resolved(String raw,String normalized,String key,Map<String,String> row,String type){
        if(row==null)return new Resolved(raw,normalized,key,key,"","UNRESOLVED","UNRESOLVED",false,"",type,true);
        String label=row.getOrDefault("canonical_tag",row.getOrDefault("canonical_name",key));boolean eligible="true".equalsIgnoreCase(row.getOrDefault("recommendation_eligible","false"));
        return new Resolved(raw,normalized,key,label,row.getOrDefault("facet",""),row.getOrDefault("recommendation_role","UNRESOLVED"),row.getOrDefault("retrieval_utility","UNRESOLVED"),eligible,row.getOrDefault("safety_status",""),type,true);
    }

    private void indexSemantic(Map<String,String> row){String raw=normalize(row.getOrDefault("raw_tag","")),normalized=normalize(row.getOrDefault("normalized_tag","")),canonical=normalize(row.getOrDefault("canonical_tag",""));if(!raw.isEmpty())semantic.put(raw,row);if(!normalized.isEmpty())semantic.put(normalized,row);if(!canonical.isEmpty())semantic.put(canonical,row);}
    private void indexEntity(Map<String,String> row){String normalized=normalize(row.getOrDefault("normalized_tag","")),canonical=normalize(row.getOrDefault("canonical_name",""));if(!normalized.isEmpty())entities.put(normalized,row);if(!canonical.isEmpty())entities.put(canonical,row);}

    static String normalize(String value){String text=Normalizer.normalize(value==null?"":value,Normalizer.Form.NFKC).replace("\u200b","").replace("\u200c","").replace("\u200d","").replace("\ufeff","").replace('\u3000',' ').trim().toLowerCase(Locale.ROOT);return text.replaceAll("\\s+"," ");}

    private static void verifyAuthority(Context context) throws Exception {
        JSONObject manifest=new JSONObject(readText(context,"PICA_REGISTRY_V3_FINAL_MANIFEST.json"));JSONObject production=manifest.getJSONObject("production_registry_sha256");
        verify(context,manifest.optString("runtime_semantic_file","PICA_TAG_REGISTRY_V3_RUNTIME.csv"),production.getString("semantic"));verify(context,"PICA_ENTITY_REGISTRY_V3_FINAL.csv",production.getString("entity"));verify(context,"PICA_TAG_ALIAS_MAP_V3_FINAL.json",production.getString("alias"));verify(context,"PICA_TAG_UNRESOLVED_V3_FINAL_WATCHLIST.csv",production.getString("watchlist"));verify(context,"PICA_TAG_LIBRARY_V2_REVIEWED.csv",manifest.getString("source_v2_registry_sha256"));verify(context,"PICA_TAG_ALIAS_MAP_V2.json",manifest.getString("source_v2_alias_sha256"));
    }
    private static void verify(Context context,String file,String expected) throws Exception {String actual=sha256(readBytes(context,file));if(!actual.equalsIgnoreCase(expected))throw new IOException("Native V3 registry integrity failure: "+file);}
    private static byte[] readBytes(Context context,String file) throws Exception {try(InputStream in=context.getAssets().open(ROOT+file);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[32768];int n;while((n=in.read(b))>0)out.write(b,0,n);return out.toByteArray();}}
    private static String readText(Context context,String file) throws Exception {return new String(readBytes(context,file),StandardCharsets.UTF_8);}
    private static String sha256(byte[] bytes) throws Exception {byte[] digest=MessageDigest.getInstance("SHA-256").digest(bytes);StringBuilder out=new StringBuilder();for(byte b:digest)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}

    static List<Map<String,String>> parseCsv(String text){
        List<List<String>> rows=new ArrayList<>();List<String> row=new ArrayList<>();StringBuilder cell=new StringBuilder();boolean quoted=false;
        for(int i=0;i<text.length();i++){char ch=text.charAt(i);if(ch=='"'){if(quoted&&i+1<text.length()&&text.charAt(i+1)=='"'){cell.append('"');i++;}else quoted=!quoted;}else if(ch==','&&!quoted){row.add(cell.toString());cell.setLength(0);}else if((ch=='\n'||ch=='\r')&&!quoted){if(ch=='\r'&&i+1<text.length()&&text.charAt(i+1)=='\n')i++;row.add(cell.toString());cell.setLength(0);boolean any=false;for(String value:row)if(!value.isEmpty()){any=true;break;}if(any)rows.add(row);row=new ArrayList<>();}else cell.append(ch);}
        if(cell.length()>0||!row.isEmpty()){row.add(cell.toString());rows.add(row);}if(rows.isEmpty())return new ArrayList<>();List<String> headers=rows.remove(0);if(!headers.isEmpty())headers.set(0,headers.get(0).replace("\ufeff",""));List<Map<String,String>> out=new ArrayList<>();for(List<String> values:rows){Map<String,String> map=new HashMap<>();for(int i=0;i<headers.size();i++)map.put(headers.get(i),i<values.size()?values.get(i):"");out.add(map);}return out;
    }
}