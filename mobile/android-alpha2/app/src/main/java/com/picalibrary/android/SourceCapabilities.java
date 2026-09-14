package com.picalibrary.android;

import java.util.*;

/** Single authority for online-source labels and source-specific UI capabilities. */
final class SourceCapabilities {
    static final class Source {
        final String id,label;
        final boolean supportsBrowse,requiresPicaAccount,requiresEhSession,cloudFavorites,categories,leaderboard;
        Source(String id,String label,boolean supportsBrowse,boolean requiresPicaAccount,boolean requiresEhSession,boolean cloudFavorites,boolean categories,boolean leaderboard){this.id=id;this.label=label;this.supportsBrowse=supportsBrowse;this.requiresPicaAccount=requiresPicaAccount;this.requiresEhSession=requiresEhSession;this.cloudFavorites=cloudFavorites;this.categories=categories;this.leaderboard=leaderboard;}
    }

    static final Source ALL=new Source("all","全部来源",false,false,false,false,false,false);
    static final Source PICA=new Source("pica","Pica",true,true,false,true,true,true);
    static final Source EH=new Source("eh","E-Hentai",true,false,false,true,false,false);
    static final Source EXH=new Source("exh","ExHentai",true,false,true,false,false,false);
    private static final Source[] VALUES={ALL,PICA,EH,EXH};

    private SourceCapabilities(){}
    static Source[] values(){return VALUES.clone();}
    static Source byId(String id){for(Source value:VALUES)if(value.id.equals(id))return value;return ALL;}
    static String searchHint(Source source){if(source==PICA)return "搜索 Pica";if(source==EH)return "搜索 E-Hentai";if(source==EXH)return "搜索 ExHentai";return "搜索漫画、作者、标签";}
}
