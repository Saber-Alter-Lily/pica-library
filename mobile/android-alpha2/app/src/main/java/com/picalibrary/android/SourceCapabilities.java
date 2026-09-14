package com.picalibrary.android;

/** Single authority for online-source labels and source-specific UI capabilities. */
final class SourceCapabilities {
    static final class Source {
        final String id,label;
        final boolean supportsBrowse,supportsFilter,requiresPicaAccount,requiresEhSession,cloudFavorites,categories,leaderboard,popular,watched;
        Source(String id,String label,boolean supportsBrowse,boolean supportsFilter,boolean requiresPicaAccount,boolean requiresEhSession,boolean cloudFavorites,boolean categories,boolean leaderboard,boolean popular,boolean watched){this.id=id;this.label=label;this.supportsBrowse=supportsBrowse;this.supportsFilter=supportsFilter;this.requiresPicaAccount=requiresPicaAccount;this.requiresEhSession=requiresEhSession;this.cloudFavorites=cloudFavorites;this.categories=categories;this.leaderboard=leaderboard;this.popular=popular;this.watched=watched;}
    }

    static final Source ALL=new Source("all","全部来源",false,false,false,false,false,false,false,false,false);
    static final Source PICA=new Source("pica","Pica",true,false,true,false,true,true,true,false,false);
    static final Source EH=new Source("eh","E-Hentai",true,true,false,false,true,true,true,true,true);
    static final Source EXH=new Source("exh","ExHentai",true,true,false,true,true,true,false,true,true);
    private static final Source[] VALUES={ALL,PICA,EH,EXH};

    private SourceCapabilities(){}
    static Source[] values(){return VALUES.clone();}
    static Source byId(String id){for(Source value:VALUES)if(value.id.equals(id))return value;return ALL;}
    static String searchHint(Source source){if(source==PICA)return "搜索 Pica";if(source==EH)return "搜索 E-Hentai";if(source==EXH)return "搜索 ExHentai";return "搜索漫画、作者、标签";}
}
