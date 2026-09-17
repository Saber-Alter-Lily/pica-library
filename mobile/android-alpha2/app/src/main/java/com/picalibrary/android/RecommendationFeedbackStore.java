package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.Instant;
import java.util.*;

/** Local latest-wins recommendation feedback. Optional reasons never gate sentiment. */
final class RecommendationFeedbackStore {
    private static final String PREFS="recommendation-feedback-v1";
    private static final String SENTIMENT="sentiment:";
    private static final String REASONS="reasons:";
    private static final String UPDATED="updated:";
    private static final String ASK_REASONS="ask_optional_reasons";
    private RecommendationFeedbackStore(){}

    private static SharedPreferences prefs(Context context){return context.getApplicationContext().getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    private static String cleanId(String comicId){return comicId==null?"":comicId.trim();}
    private static String cleanSentiment(String sentiment){String value=sentiment==null?"":sentiment.trim().toLowerCase(Locale.ROOT);if(!"like".equals(value)&&!"dislike".equals(value))throw new IllegalArgumentException("sentiment must be like or dislike");return value;}

    static void setSentiment(Context context,String comicId,String sentiment){
        String id=cleanId(comicId);if(id.isEmpty())throw new IllegalArgumentException("comic id is required");String value=cleanSentiment(sentiment);
        prefs(context).edit().putString(SENTIMENT+id,value).putString(UPDATED+id,Instant.now().toString()).remove(REASONS+id).apply();
    }
    static String sentiment(Context context,String comicId){return prefs(context).getString(SENTIMENT+cleanId(comicId),"");}
    static boolean isLiked(Context context,String comicId){return "like".equals(sentiment(context,comicId));}
    static boolean isDisliked(Context context,String comicId){return "dislike".equals(sentiment(context,comicId));}
    static boolean hasFeedback(Context context,String comicId){String value=sentiment(context,comicId);return "like".equals(value)||"dislike".equals(value);}
    static Set<String> feedbackIds(Context context){LinkedHashSet<String> ids=new LinkedHashSet<>();for(String key:prefs(context).getAll().keySet())if(key.startsWith(SENTIMENT)){String id=key.substring(SENTIMENT.length());if(!id.isEmpty())ids.add(id);}return ids;}

    static void setReasons(Context context,String comicId,String sentiment,Collection<String> reasons){
        String id=cleanId(comicId);String current=RecommendationFeedbackStore.sentiment(context,id);String expected=cleanSentiment(sentiment);if(!expected.equals(current))return;
        LinkedHashSet<String> values=new LinkedHashSet<>();if(reasons!=null)for(String reason:reasons){String value=reason==null?"":reason.trim();if(!value.isEmpty())values.add(value);}prefs(context).edit().putStringSet(REASONS+id,values).apply();
    }
    static Set<String> reasons(Context context,String comicId){Set<String> stored=prefs(context).getStringSet(REASONS+cleanId(comicId),Collections.emptySet());return new LinkedHashSet<>(stored==null?Collections.emptySet():stored);}

    static boolean askReasons(Context context){return prefs(context).getBoolean(ASK_REASONS,false);}
    static void setAskReasons(Context context,boolean enabled){prefs(context).edit().putBoolean(ASK_REASONS,enabled).apply();}
}
