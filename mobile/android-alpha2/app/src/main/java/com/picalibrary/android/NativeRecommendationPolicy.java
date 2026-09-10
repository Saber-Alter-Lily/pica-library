package com.picalibrary.android;

final class NativeRecommendationPolicy {
    static final int TARGET_POOL=250,MAX_PROVIDER_REQUESTS=24,MAX_PAGE=3,BATCH_SIZE=12,MAX_BATCHES=6;
    private NativeRecommendationPolicy(){}

    static boolean conjunctionEligible(int total,int leftSupport,int rightSupport,int coSupport){
        if(total<=0||coSupport<5)return false;
        double expected=(double)leftSupport*(double)rightSupport/(double)total;
        return expected>0&&coSupport/expected>=1.5;
    }

    static double frozenNeutralScore(double authorAffinity,double categorySimilarity,double routeSupport,double popularity){
        double score=authorAffinity*0.18+categorySimilarity*0.05+Math.min(1,Math.max(0,routeSupport))*0.06+Math.min(1,Math.max(0,popularity))*0.025+0.04;
        return Math.round(score*1_000_000d)/1_000_000d;
    }

    static int familyRank(String family){
        if("FANDOM".equals(family))return 0;
        if("CREATOR".equals(family))return 1;
        if("SEMANTIC_CONJUNCTION".equals(family))return 2;
        if("SEMANTIC_ANCHOR".equals(family))return 3;
        if("EXPLORATION".equals(family))return 4;
        if("RELATED".equals(family))return 5;
        return 99;
    }

    static int readinessRank(int candidates){return candidates>=180?3:candidates>=48?2:candidates>=12?1:0;}
    static String readiness(int candidates){return candidates>=180?"READY":candidates>=48?"READY_DEGRADED":candidates>=12?"READY_LIMITED":"FAILED_INSUFFICIENT_POOL";}
}