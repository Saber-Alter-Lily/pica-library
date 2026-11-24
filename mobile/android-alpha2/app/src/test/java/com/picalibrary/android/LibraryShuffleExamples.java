package com.picalibrary.android;

import java.util.*;

/** Executable on a plain offline JDK, as well as from Android JUnit. Contains no user data. */
public final class LibraryShuffleExamples {
    private static void check(boolean ok,String name){if(!ok)throw new AssertionError(name);}
    private static List<String> view(LibraryShuffleOrder order,Collection<String> ids){
        List<String> copy=new ArrayList<>(ids);order.sort(copy,s->s);return copy;
    }
    public static void main(String[] args){
        Random random=new Random(720);LibraryShuffleOrder order=LibraryShuffleOrder.EMPTY;
        List<String> books=new ArrayList<>(Arrays.asList("甲","乙","Aa","BB"));
        for(int i=0;i<1200;i++)books.add("test-work-"+i);
        List<String> before=new ArrayList<>(books);
        Set<String> members=new HashSet<>(books);
        for(int i=0;i<128;i++){
            LibraryShuffleOrder rolled=order.reroll(before,random);
            check(rolled.seed!=order.seed,"a fresh seed on every tap");order=rolled;
            List<String> after=view(order,books);
            check(!after.get(0).equals(before.get(0)),"different first book on every tap");
            check(after.size()==books.size()&&new HashSet<>(after).equals(members),"only reorders existing books");
            check(after.equals(view(new LibraryShuffleOrder(order.seed,order.firstId),books)),"restored seed and first ID keep order");
            Collections.reverse(books);check(after.equals(view(order,books)),"catalog refresh / different input order");
            before=after;
        }
        List<String> subset=new ArrayList<>(books.subList(0,15));List<String> expected=new ArrayList<>(before);
        expected.retainAll(subset);check(view(order,subset).equals(expected),"search/filter keeps relative order");
        List<String> expanded=new ArrayList<>(books);expanded.add("new-sync-book");List<String> synced=view(order,expanded);
        synced.remove("new-sync-book");check(synced.equals(before),"new arrivals do not reorder existing books");
        List<String> pair=Arrays.asList("Aa","BB");
        for(int i=0;i<64;i++){order=order.reroll(pair,random);List<String> next=view(order,pair);
            check(!pair.get(0).equals(next.get(0)),"two visible books always swap");pair=next;}
        for(List<String> small:Arrays.asList(Collections.<String>emptyList(),Collections.singletonList("only"))){
            check(view(order.reroll(small,random),small).equals(small),"empty/singleton remains valid");
        }
        Random same=new Random(0){@Override public long nextLong(){return 123L;}};
        LibraryShuffleOrder duplicateSeed=new LibraryShuffleOrder(123,"Aa");
        check(duplicateSeed.reroll(pair,same).seed!=123,"repeated entropy does not reuse prior seed");
        System.out.println("PASS: 128 reshuffles of 1204 synthetic books; 64 two-book swaps; refresh, restore, filters, arrivals, empty and singleton.");
    }
}
