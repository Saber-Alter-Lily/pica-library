package com.picalibrary.android;

import java.net.URLEncoder;
import java.util.*;

/** Provider-native E-H online query state. Separate from local unified-library filtering. */
final class EhOnlineFilterSpec {
    static final int MISC=0x1,DOUJINSHI=0x2,MANGA=0x4,ARTIST_CG=0x8,GAME_CG=0x10,IMAGE_SET=0x20,COSPLAY=0x40,ASIAN_PORN=0x80,NON_H=0x100,WESTERN=0x200,ALL=0x3ff;
    enum Mode { LATEST,POPULAR,WATCHED,TOPLIST,FAVORITES }
    Mode mode=Mode.LATEST;
    int includeCategories=ALL;
    final List<String> includeTags=new ArrayList<>(),excludeTags=new ArrayList<>();
    String language="",freeText="";
    int minRating=-1,pageFrom=-1,pageTo=-1,favoriteSlot=-1;
    String toplist="15";

    EhOnlineFilterSpec copy(){EhOnlineFilterSpec s=new EhOnlineFilterSpec();s.mode=mode;s.includeCategories=includeCategories;s.includeTags.addAll(includeTags);s.excludeTags.addAll(excludeTags);s.language=language;s.freeText=freeText;s.minRating=minRating;s.pageFrom=pageFrom;s.pageTo=pageTo;s.favoriteSlot=favoriteSlot;s.toplist=toplist;return s;}
    boolean hasAdvanced(){return includeCategories!=ALL||!includeTags.isEmpty()||!excludeTags.isEmpty()||!language.isEmpty()||minRating>0||pageFrom>0||pageTo>0;}

    String canonicalQuery(){ArrayList<String> parts=new ArrayList<>();if(freeText!=null&&!freeText.trim().isEmpty())parts.add(freeText.trim());for(String tag:includeTags)if(validCanonical(tag))parts.add(exact(tag));for(String tag:excludeTags)if(validCanonical(tag))parts.add("-"+exact(tag));if(language!=null&&!language.trim().isEmpty()){String value=language.trim().toLowerCase(Locale.ROOT);parts.add("language:\""+escape(value)+"\"");}return String.join(" ",parts);}

    String buildUrl(String surface) throws Exception {
        String origin="exh".equals(surface)?EhClient.EXH_ORIGIN:EhClient.ORIGIN;
        if(mode==Mode.POPULAR)return origin+"/popular";
        if(mode==Mode.WATCHED)return origin+"/watched"+normalQuerySuffix();
        if(mode==Mode.TOPLIST)return EhClient.ORIGIN+"/toplist.php?tl="+enc(validToplist(toplist)?toplist:"15");
        if(mode==Mode.FAVORITES){String slot=favoriteSlot>=0&&favoriteSlot<=9?String.valueOf(favoriteSlot):"all";String q=canonicalQuery();return origin+"/favorites.php?favcat="+slot+(q.isEmpty()?"":"&f_search="+enc(q));}
        return origin+"/"+normalQuerySuffix();
    }

    private String normalQuerySuffix() throws Exception {ArrayList<String> q=new ArrayList<>();String query=canonicalQuery();if(!query.isEmpty())q.add("f_search="+enc(query));if(includeCategories!=ALL&&includeCategories>=0){int excluded=(~includeCategories)&ALL;q.add("f_cats="+excluded);}if(minRating>0||pageFrom>0||pageTo>0){q.add("advsearch=1");if(minRating>0)q.add("f_srdd="+minRating);if(pageFrom>0)q.add("f_spf="+pageFrom);if(pageTo>0)q.add("f_spt="+pageTo);}return q.isEmpty()?"":"?"+String.join("&",q);}

    static String categoryLabel(int bit){switch(bit){case DOUJINSHI:return "同人志";case MANGA:return "漫画";case ARTIST_CG:return "画师 CG";case GAME_CG:return "游戏 CG";case IMAGE_SET:return "图片集";case COSPLAY:return "Cosplay";case ASIAN_PORN:return "亚洲色情";case NON_H:return "非 H";case WESTERN:return "西方作品";case MISC:return "其他";default:return "";}}
    static int[] categoryBits(){return new int[]{DOUJINSHI,MANGA,ARTIST_CG,GAME_CG,IMAGE_SET,COSPLAY,ASIAN_PORN,NON_H,WESTERN,MISC};}
    static boolean validCanonical(String value){return value!=null&&value.matches("^[a-zA-Z0-9 _.-]+:[^\\r\\n\"]+$");}
    private static String exact(String canonical){int at=canonical.indexOf(':');return canonical.substring(0,at+1)+"\""+escape(canonical.substring(at+1))+"\"";}
    private static String escape(String value){return value.replace("\\","\\\\").replace("\"","\\\"");}
    private static String enc(String value) throws Exception{return URLEncoder.encode(value,"UTF-8").replace("+","%20");}
    private static boolean validToplist(String value){return "11".equals(value)||"12".equals(value)||"13".equals(value)||"15".equals(value);}
}
