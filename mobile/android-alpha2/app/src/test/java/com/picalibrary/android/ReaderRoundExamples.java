package com.picalibrary.android;
import java.util.*;

/** Runs as JUnit's fixture or directly with a plain offline JDK. No Android services or account. */
public final class ReaderRoundExamples {
    static void check(boolean ok,String name){if(!ok)throw new AssertionError(name);}
    static ReaderRoundPlanner.Pick p(String id,String by,boolean target,int fit,long likes){
        return new ReaderRoundPlanner.Pick(id,"upload:"+id,by,"pica",target,false,fit,false,likes,1d,null);
    }
    static List<List<ReaderRoundPlanner.Pick>> run(List<ReaderRoundPlanner.Pick> r,Set<String> familiar){
        return ReaderRoundPlanner.plan(r,familiar,Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),1);
    }
    static Set<String> ids(List<List<ReaderRoundPlanner.Pick>> pages){
        Set<String> ids=new HashSet<>();for(List<ReaderRoundPlanner.Pick> page:pages)for(ReaderRoundPlanner.Pick p:page)check(ids.add(p.id),"duplicate upload");return ids;
    }
    public static void main(String[] args){
        ReaderRoundPlanner.Profile profile=new ReaderRoundPlanner.Profile();
        profile.add("乙","work:x",false,true,false,Arrays.asList("科幻","推理"));
        profile.add("乙","work:x",false,true,false,Arrays.asList("科幻","推理"));
        check(!profile.familiar.contains("乙"),"two translations are one like");
        profile.add("乙","work:y",false,true,true,Arrays.asList("推理"));check(profile.familiar.contains("乙"),"two distinct likes");
        profile.add("甲","work:z",true,false,false,Arrays.asList("科幻"));check(profile.familiar.contains("甲"),"one favorite");
        List<ReaderRoundPlanner.Pick> rows=new ArrayList<>();Set<String> known=new HashSet<>();
        for(int i=0;i<24;i++){known.add("f"+i);for(int j=0;j<3;j++)rows.add(p("f"+i+"-"+j,"f"+i,true,4,20-j));}
        for(int i=0;i<40;i++){rows.add(p("n"+i+"-a","n"+i,false,2,50));rows.add(p("n"+i+"-b","n"+i,false,2,200));}
        List<List<ReaderRoundPlanner.Pick>> pages=run(rows,known);check(pages.size()==6,"six pages with enough supply");
        Map<String,Integer> counts=new HashMap<>();
        for(List<ReaderRoundPlanner.Pick> page:pages){Set<String> pageAuthors=new HashSet<>();int fam=0,targets=0;
            for(ReaderRoundPlanner.Pick c:page){check(pageAuthors.add(c.author),"one author/page");if(known.contains(c.author))fam++;if(c.target)targets++;
                counts.put(c.author,counts.getOrDefault(c.author,0)+1);if(!known.contains(c.author))check(c.id.endsWith("-b"),"popular fitting representative");}
            check(page.size()==12&&fam==6&&targets==6,"6 familiar target + 6 unfamiliar other");}
        for(Map.Entry<String,Integer> e:counts.entrySet())check(e.getValue()<=(known.contains(e.getKey())?2:1),"round author cap");
        check(ids(pages).size()==72,"72 distinct titles");
        List<ReaderRoundPlanner.Pick> scarce=new ArrayList<>();for(int i=0;i<9;i++)scarce.add(p("a"+i,"f"+i,true,1,0));for(int i=0;i<3;i++)scarce.add(p("u"+i,"u"+i,false,1,0));
        check(run(scarce,known).get(0).size()==12,"9 plus 3");scarce.remove(0);
        check(run(scarce,known).get(0).size()==11,"both short: do not relax");
        ReaderRoundPlanner.Pick first=p("first","乙",false,1,1000), second=p("second","乙",false,3,50);
        check(run(Arrays.asList(first,second),Collections.emptySet()).get(0).get(0).id.equals("second"),"taste before popularity");
        Set<String> seen=Collections.singleton(second.work);Map<String,Integer> last=Collections.singletonMap("乙",1);
        for(int n=2;n<=4;n++){
            List<List<ReaderRoundPlanner.Pick>> round=ReaderRoundPlanner.plan(Arrays.asList(first,second),Collections.emptySet(),Collections.emptySet(),seen,last,n);
            check(n==4?ids(round).equals(Collections.singleton("first")):round.isEmpty(),"two skipped whole rounds: "+n);}
        check(ReaderRoundPlanner.plan(Arrays.asList(first),Collections.emptySet(),Collections.singleton("乙"),Collections.emptySet(),Collections.emptyMap(),1).isEmpty(),"subscriptions remove author");
        ReaderRoundPlanner.Pick translated=new ReaderRoundPlanner.Pick("copy","work:confirmed","a","eh",false,false,1,false,2,1,null);
        check(ReaderRoundPlanner.plan(Arrays.asList(translated),Collections.emptySet(),Collections.emptySet(),Collections.singleton("work:confirmed"),Collections.emptyMap(),20).isEmpty(),"confirmed version permanently excluded");
        check(ReaderRoundPlanner.plan(Arrays.asList(translated),Collections.emptySet(),Collections.emptySet(),Collections.singleton("upload:copy"),Collections.emptyMap(),20).isEmpty(),"same upload even if its identity later changes");
        List<ReaderRoundPlanner.Pick> compare=new ArrayList<>();compare.add(p("recent","f0",false,2,1));compare.add(p("rested","f1",false,2,1));
        check(ReaderRoundPlanner.plan(compare,known,Collections.emptySet(),Collections.emptySet(),Collections.singletonMap("f0",4),5).get(0).get(0).id.equals("rested"),"familiar tie rotation");
        check(ReaderRoundPlanner.plan(Arrays.asList(first),Collections.emptySet(),Collections.emptySet(),seen,Collections.emptyMap(),99).size()==1,"another work stays eligible");
        check(SubscriptionDiff.updates(null,7,false,100,95).isEmpty(),"no historical alerts");
        check(SubscriptionDiff.updates(null,7,false,100,0).isEmpty(),"partial first scan not evidence");
        check(SubscriptionDiff.updates(null,1,true,100,101).equals(Arrays.asList(0)),"new work");
        check(SubscriptionDiff.updates(7,9,true,100,95).equals(Arrays.asList(8,9)),"unfollowed serial substantive chapters");
        check(SubscriptionDiff.updates(9,9,true,100,95).isEmpty(),"metadata-only not update");
        check(SubscriptionDiff.updates(0,9,true,100,95).isEmpty(),"unknown count is not 9 new chapters");
        Map<String,Integer> support=new HashMap<>(),attempted=new HashMap<>();
        for(int i=0;i<32;i++)support.put("creator"+i,45-i);
        Set<String> subscribed=Collections.singleton("creator0");
        Set<String> familiar=new HashSet<>(support.keySet());familiar.remove("creator1");
        for(int r=1;r<=10;r++){
            List<String> keys=ReaderRoundPlanner.creatorSeeds(support,familiar,subscribed,attempted,Collections.emptyMap(),3);
            check(keys.size()==3&&!keys.contains("creator0")&&!keys.contains("creator1"),"only eligible creator searches");
            for(String key:keys)check(attempted.put(key,r)==null,"no re-search before all equally eligible authors have a turn");
        }
        check(attempted.size()==30,"ten rounds reach 30 authors, not the first three");
        Set<String> knownTen=new HashSet<>(),seenTen=new HashSet<>();Map<String,Integer> clockTen=new HashMap<>();
        List<ReaderRoundPlanner.Pick> supply=new ArrayList<>();
        for(int i=0;i<60;i++){String by="known-"+i;knownTen.add(by);for(int j=0;j<8;j++)supply.add(p(by+"-"+j,by,false,2,100-j));}
        for(int i=0;i<180;i++){String by="new-"+i;for(int j=0;j<4;j++)supply.add(p(by+"-"+j,by,false,2,100-j));}
        for(int r=1;r<=10;r++){
            List<List<ReaderRoundPlanner.Pick>> fixed=ReaderRoundPlanner.plan(supply,knownTen,Collections.emptySet(),seenTen,clockTen,r);
            check(fixed.size()==6,"full synthetic supply should give six pages in round "+r);
            Map<String,Integer> thisRound=new HashMap<>();
            for(List<ReaderRoundPlanner.Pick> page:fixed){
                int familiarSeats=0;Set<String> onPage=new HashSet<>();
                for(ReaderRoundPlanner.Pick book:page){
                    boolean isKnown=knownTen.contains(book.author);if(isKnown)familiarSeats++;
                    check(onPage.add(book.author),"repeated author on page");check(seenTen.add(book.work),"work repeated across ten rounds");
                    if(!isKnown)check(clockTen.getOrDefault(book.author,-10)<r-2,"unfamiliar author returned early");
                    int used=thisRound.merge(book.author,1,Integer::sum);check(used<=(isKnown?2:1),"author quota across six pages");
                }
                check(page.size()==12&&familiarSeats==6,"balanced page across ten rounds");
            }
            for(String by:thisRound.keySet())clockTen.put(by,r); // simulate confirming all six pages, not just fetching them
        }
        check(seenTen.size()==720,"ten reviewed rounds expose 720 unique works");
        ReaderRoundPlanner.Pick nv=new ReaderRoundPlanner.Pick("b","upload:b","b","pica",false,false,2,false,0,.995,null);
        ReaderRoundPlanner.Pick a=new ReaderRoundPlanner.Pick("a","upload:a","a","pica",false,false,2,false,0,1d,.01);
        ReaderRoundPlanner.Pick z=new ReaderRoundPlanner.Pick("z","upload:z","z","pica",false,false,2,false,0,.97,.98);
        check(run(Arrays.asList(a,nv,z),Collections.emptySet()).get(0).get(1)==nv,"missing visual is neutral");
        check(run(Arrays.asList(a,z),Collections.emptySet()).get(0).get(0)==a,"visual cannot overturn a meaningful relevance lead");
        ReaderRoundPlanner.Pick v=new ReaderRoundPlanner.Pick("v","upload:v","v","pica",false,false,2,false,0,.999,.98);
        check(run(Arrays.asList(a,v),Collections.emptySet()).get(0).get(0)==v,"only comparable pairs use visual");
        System.out.println("PASS: Android reader-round and subscription scenarios; 10 synthetic rounds, 60 pages, 720 unique displayed works, 30 distinct creator searches");
    }
}
