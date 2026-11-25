package com.picalibrary.android;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.function.Function;

/** A library display order. Re-rendering, changing filters and adding books never roll the seed. */
final class LibraryShuffleOrder {
    static final LibraryShuffleOrder EMPTY=new LibraryShuffleOrder(0L,"");
    final long seed;
    final String firstId;

    LibraryShuffleOrder(long seed,String firstId){
        this.seed=seed;this.firstId=firstId==null?"":firstId;
    }

    /** Visible IDs are unique catalog IDs, in the exact order the user was viewing. */
    LibraryShuffleOrder reroll(List<String> visibleIds,Random random){
        long next=random.nextLong();
        if(next==seed)next=~seed;
        int n=visibleIds.size();
        // Pick a different first book even for a two-book result; don't retry random permutations.
        String first=n==0?"":visibleIds.get(n==1?0:1+random.nextInt(n-1));
        return new LibraryShuffleOrder(next,first);
    }

    <T> void sort(List<T> rows,Function<T,String> idOf){
        if(rows.size()<2)return;
        Map<String,Long> ranks=new HashMap<>();
        for(T row:rows){String id=idOf.apply(row);ranks.put(id,rank(id));}
        rows.sort((a,b)->{
            String x=idOf.apply(a),y=idOf.apply(b);
            int c=Boolean.compare(firstId.equals(y),firstId.equals(x));
            if(c==0)c=Long.compareUnsigned(ranks.get(x),ranks.get(y));
            return c==0?x.compareTo(y):c;
        });
    }

    private long rank(String id){
        long h=seed^0xcbf29ce484222325L;
        for(int i=0;i<id.length();i++)h=(h^id.charAt(i))*0x100000001b3L;
        h=(h^(h>>>30))*0xbf58476d1ce4e5b9L;
        h=(h^(h>>>27))*0x94d049bb133111ebL;
        return h^(h>>>31);
    }
}
