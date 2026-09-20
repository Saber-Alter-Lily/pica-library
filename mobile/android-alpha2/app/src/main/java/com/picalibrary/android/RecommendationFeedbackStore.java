package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.Instant;
import java.util.*;
import org.json.JSONArray;
import org.json.JSONObject;

/** Local latest-wins recommendation feedback. Optional reasons never gate sentiment. */
final class RecommendationFeedbackStore {
    private static final String PREFS="recommendation-feedback-v1";
    private static final String SENTIMENT="sentiment:";
    private static final String REASONS="reasons:";
    private static final String UPDATED="updated:";
    private static final String DIRTY="dirty:";
    private static final String ASK_REASONS="ask_optional_reasons";
    private RecommendationFeedbackStore(){}

    private static SharedPreferences prefs(Context context){return context.getApplicationContext().getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    private static String cleanId(String comicId){return comicId==null?"":comicId.trim();}
    private static String cleanSentiment(String sentiment){String value=sentiment==null?"":sentiment.trim().toLowerCase(Locale.ROOT);if(!"like".equals(value)&&!"dislike".equals(value))throw new IllegalArgumentException("sentiment must be like or dislike");return value;}

    static void setSentiment(Context context,String comicId,String sentiment){
        String id=cleanId(comicId);if(id.isEmpty())throw new IllegalArgumentException("comic id is required");String value=cleanSentiment(sentiment);
        prefs(context).edit().putString(SENTIMENT+id,value).putString(UPDATED+id,Instant.now().toString()).putBoolean(DIRTY+id,true).remove(REASONS+id).apply();
    }
    static String sentiment(Context context,String comicId){return prefs(context).getString(SENTIMENT+cleanId(comicId),"");}
    static boolean isLiked(Context context,String comicId){return "like".equals(sentiment(context,comicId));}
    static boolean isDisliked(Context context,String comicId){return "dislike".equals(sentiment(context,comicId));}
    static boolean hasFeedback(Context context,String comicId){String value=sentiment(context,comicId);return "like".equals(value)||"dislike".equals(value);}
    static Set<String> feedbackIds(Context context){LinkedHashSet<String> ids=new LinkedHashSet<>();for(String key:prefs(context).getAll().keySet())if(key.startsWith(SENTIMENT)){String id=key.substring(SENTIMENT.length());if(!id.isEmpty())ids.add(id);}return ids;}

    static void setReasons(Context context,String comicId,String sentiment,Collection<String> reasons){
        String id=cleanId(comicId);String current=RecommendationFeedbackStore.sentiment(context,id);String expected=cleanSentiment(sentiment);if(!expected.equals(current))return;
        LinkedHashSet<String> values=new LinkedHashSet<>();if(reasons!=null)for(String reason:reasons){String value=reason==null?"":reason.trim();if(!value.isEmpty())values.add(value);}prefs(context).edit().putStringSet(REASONS+id,values).putBoolean(DIRTY+id,true).apply();
    }
    static Set<String> reasons(Context context,String comicId){Set<String> stored=prefs(context).getStringSet(REASONS+cleanId(comicId),Collections.emptySet());return new LinkedHashSet<>(stored==null?Collections.emptySet():stored);}

    static JSONArray dirtyPayload(Context context){JSONArray out=new JSONArray();SharedPreferences p=prefs(context);for(String key:p.getAll().keySet()){if(!key.startsWith(DIRTY)||!p.getBoolean(key,false))continue;String id=key.substring(DIRTY.length());String sentiment=RecommendationFeedbackStore.sentiment(context,id);if(!"like".equals(sentiment)&&!"dislike".equals(sentiment))continue;JSONObject row=new JSONObject();try{row.put("comicId",id);row.put("sentiment",sentiment);row.put("reasons",new JSONArray(RecommendationFeedbackStore.reasons(context,id)));row.put("updatedAt",p.getString(UPDATED+id,""));out.put(row);}catch(Exception ignored){}}return out;}
    static void clearDirty(Context context){SharedPreferences p=prefs(context);SharedPreferences.Editor edit=p.edit();for(String key:p.getAll().keySet())if(key.startsWith(DIRTY))edit.remove(key);edit.apply();}

    static synchronized void importSynced(Context context,JSONArray rows){
        if(rows==null)return;SharedPreferences p=prefs(context);SharedPreferences.Editor edit=p.edit();
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.optJSONObject(i);if(row==null)continue;
            String id=cleanId(row.optString("comicId","")),value=row.optString("sentiment","").trim().toLowerCase(Locale.ROOT);
            if(id.isEmpty()||(!"like".equals(value)&&!"dislike".equals(value))||p.getBoolean(DIRTY+id,false))continue;
            String remoteAt=row.optString("occurredAt",""),localAt=p.getString(UPDATED+id,"");
            if(localAt!=null&&!localAt.isEmpty()&&!remoteAt.isEmpty()&&localAt.compareTo(remoteAt)>0)continue;
            LinkedHashSet<String> reasons=new LinkedHashSet<>();
            JSONArray raw=row.optJSONArray("reasons");if(raw!=null)for(int j=0;j<raw.length();j++){String reason=raw.optString(j,"").trim();if(!reason.isEmpty())reasons.add(reason);}
            edit.putString(SENTIMENT+id,value).putString(UPDATED+id,remoteAt).putStringSet(REASONS+id,reasons).remove(DIRTY+id);
        }
        edit.apply();
    }

    static boolean askReasons(Context context){return prefs(context).getBoolean(ASK_REASONS,false);}
    static void setAskReasons(Context context,boolean enabled){prefs(context).edit().putBoolean(ASK_REASONS,enabled).apply();}
}
