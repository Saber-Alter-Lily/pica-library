package com.picalibrary.android;
import java.util.*;

/** Zero identifies a new work; positive numbers identify individual new chapters. */
final class SubscriptionDiff{
    static List<Integer> updates(Integer previous,int now,boolean completeBaseline,long subscribedAt,long publication){
        if(previous==null){
            if(publication>0)return publication>subscribedAt?Collections.singletonList(0):Collections.emptyList();
            return completeBaseline?Collections.singletonList(0):Collections.emptyList();
        }
        if(previous<=0||now<=previous)return Collections.emptyList(); // unknown count becoming known is not an update
        List<Integer> changes=new ArrayList<>();for(int c=previous+1;c<=now;c++)changes.add(c);return changes;
    }
    private SubscriptionDiff(){}
}
