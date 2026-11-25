package com.picalibrary.android;

import java.text.Normalizer;
import java.util.*;

/** Pure, provider- and Android-independent rules for a frozen six-page reader round. */
final class ReaderRoundPlanner {
    static final int PAGE_SIZE=12, PAGES=6, REST=2;
    private ReaderRoundPlanner(){}
    static String normalize(String s){
        return s==null?"":Normalizer.normalize(s,Normalizer.Form.NFKC).trim().toLowerCase(Locale.ROOT).replaceAll("\\s+"," ");
    }
    static String author(String name){
        String a=normalize(name);
        if(a.isEmpty()||a.matches("unknown( author)?|anonymous|various( artists)?|n/a|null|未知(作者)?|不详|匿名|佚名|多人|合集|[-?]+"))return "";
        return a;
    }
    static String work(String upload,String confirmed){return confirmed==null||confirmed.isEmpty()?"upload:"+upload:"work:"+confirmed;}

    /** Search budget is not a view. Rotate among positively established authors before contacting providers. */
    static List<String> creatorSeeds(Map<String,Integer> counts,Set<String> familiar,Set<String> followed,
                                     Map<String,Integer> attempted,Map<String,Integer> shown,int limit){
        List<String> keys=new ArrayList<>();
        for(String k:counts.keySet())if(!k.isEmpty()&&familiar.contains(k)&&!followed.contains(k))keys.add(k);
        keys.sort(Comparator.comparingInt((String k)->attempted.getOrDefault(k,0))
            .thenComparingInt(k->shown.getOrDefault(k,0))
            .thenComparing((a,b)->Integer.compare(counts.get(b),counts.get(a))).thenComparing(k->k));
        return new ArrayList<>(keys.subList(0,Math.min(keys.size(),Math.max(0,limit))));
    }

    static final class Profile {
        final Set<String> familiar=new HashSet<>();
        final Map<String,Set<String>> likedWorks=new HashMap<>(), support=new HashMap<>(),recent=new HashMap<>();
        void add(String by,String work,boolean favorite,boolean liked,boolean recentlyPositive,Collection<String> labels){
            if(!favorite&&!liked)return;
            String key=author(by);
            if(!key.isEmpty()){
                if(favorite)familiar.add(key);
                if(liked){Set<String> s=likedWorks.computeIfAbsent(key,k->new HashSet<>());s.add(work);if(s.size()>=2)familiar.add(key);}
            }
            for(String label:labels){String t=normalize(label);if(t.isEmpty())continue;
                support.computeIfAbsent(t,k->new HashSet<>()).add(work);
                if(recentlyPositive)recent.computeIfAbsent(t,k->new HashSet<>()).add(work);}
        }
        int fit(Collection<String> terms){
            List<Integer> hits=new ArrayList<>();Set<String> once=new HashSet<>();
            for(String s:terms){String t=normalize(s);if(!once.add(t)||!support.containsKey(t))continue;
                hits.add(Math.min(4,32-Integer.numberOfLeadingZeros(support.get(t).size())));}
            hits.sort(Collections.reverseOrder());int score=0;for(int i=0;i<Math.min(3,hits.size());i++)score+=hits.get(i);return score;
        }
        String focus(List<String> past){
            if(support.isEmpty())return "";
            Map<String,Set<String>> recentTopics=new HashMap<>();
            int max=0;for(Map.Entry<String,Set<String>> e:recent.entrySet())if(e.getValue().size()*2>=support.getOrDefault(e.getKey(),Collections.emptySet()).size()){
                recentTopics.put(e.getKey(),e.getValue());max=Math.max(max,e.getValue().size());}
            int spacing=max<2?7:3;
            boolean recentTurn=!recentTopics.isEmpty()&&past.size()>=spacing&&past.subList(Math.max(0,past.size()-spacing),past.size()).stream().noneMatch(s->s.startsWith("R:"));
            Map<String,Set<String>> pool=recentTurn?recentTopics:support;
            String best="";double weight=-1;
            for(Map.Entry<String,Set<String>> e:pool.entrySet()){
                int uses=0;for(String f:past.subList(Math.max(0,past.size()-12),past.size()))if(f.length()>2&&f.substring(2).equals(e.getKey()))uses++;
                double w=Math.sqrt(e.getValue().size())/(1+uses);
                if(w>weight||(w==weight&&e.getKey().compareTo(best)<0)){best=e.getKey();weight=w;}
            }
            return (recentTurn?"R:":"L:")+best;
        }
    }
    static final class Pick {
        final String id,work,author,displayAuthor,provider;final int fit;final boolean target,focus,related;
        final long likes;final double base;final Double visual;
        Pick(String id,String work,String by,String provider,boolean target,boolean focus,int fit,boolean related,long likes,double base,Double visual){
            this.id=id;this.work=work;this.author=author(by);this.displayAuthor=by;this.provider=provider;this.target=target;this.focus=focus;
            this.fit=fit;this.related=related;this.likes=likes;this.base=base;this.visual=visual;
        }
    }
    private static int relevance(Pick a,Pick b){
        int c=Boolean.compare(b.target,a.target);if(c==0)c=Boolean.compare(b.focus,a.focus);return c!=0?c:Integer.compare(b.fit,a.fit);
    }
    private static int baseline(Pick a,Pick b){int c=Double.compare(b.base,a.base);return c!=0?c:a.id.compareTo(b.id);}
    private static Pick best(List<Pick> group,Set<String> used,boolean known){
        Map<String,Pick> perSource=new HashMap<>();
        for(Pick p:group){
            if(used.contains(p.work))continue;
            Pick prev=perSource.get(p.provider);if(prev==null){perSource.put(p.provider,p);continue;}
            int c=relevance(p,prev);if(c==0&&!known)c=Long.compare(prev.likes,p.likes);if(c==0)c=baseline(p,prev);
            if(c<0)perSource.put(p.provider,p);
        }
        Pick first=null;for(Pick p:perSource.values())if(first==null||relevance(p,first)<0||(relevance(p,first)==0&&baseline(p,first)<0))first=p;
        return first;
    }
    static List<List<Pick>> plan(List<Pick> input,Set<String> familiar,Set<String> subscribed,Set<String> excludedWorks,Map<String,Integer> last,int ordinal){
        Map<String,List<Pick>> groups=new LinkedHashMap<>();Set<String> used=new HashSet<>(excludedWorks);
        for(Pick p:input){
            if(p.author.isEmpty()||subscribed.contains(p.author)||used.contains(p.work)||used.contains("upload:"+p.id))continue;
            if(!familiar.contains(p.author)&&(last.getOrDefault(p.author,-100)>=ordinal-REST||(!p.target&&p.fit==0&&!p.related)))continue;
            groups.computeIfAbsent(p.author,k->new ArrayList<>()).add(p);
        }
        List<List<Pick>> pages=new ArrayList<>();Map<String,Integer> uses=new HashMap<>();
        for(int page=0;page<PAGES;page++){
            List<Pick> old=new ArrayList<>(),fresh=new ArrayList<>();Set<String> onPage=new HashSet<>();
            for(int pass=0;pass<4;pass++){
                boolean known=(pass%2==0);List<Pick> dest=known?old:fresh;
                int cap=pass<2?6:PAGE_SIZE-old.size()-fresh.size();if(cap<=0)continue;
                List<Pick> choices=new ArrayList<>();
                for(Map.Entry<String,List<Pick>> e:groups.entrySet()){
                    String a=e.getKey();if(familiar.contains(a)!=known||onPage.contains(a)||uses.getOrDefault(a,0)>=(known?2:1))continue;
                    Pick p=best(e.getValue(),used,known);if(p!=null)choices.add(p);
                }
                choices.sort((a,b)->{int c=relevance(a,b);if(c==0&&known)c=Integer.compare(last.getOrDefault(a.author,-1),last.getOrDefault(b.author,-1));return c!=0?c:baseline(a,b);});
                // Only reorder contiguous, genuinely comparable pairs. A missing vector is an immovable boundary.
                for(int i=0;i<choices.size();){Pick a=choices.get(i);if(a.visual==null){i++;continue;}
                    int j=i+1;while(j<choices.size()){Pick b=choices.get(j);if(b.visual==null||relevance(a,b)!=0||Math.abs(a.base-b.base)>.01||
                        (known&&!Objects.equals(last.get(a.author),last.get(b.author))))break;j++;}
                    if(j>i+1)choices.subList(i,j).sort((x,y)->Double.compare(y.visual,x.visual));i=j;}
                for(Pick p:choices){if(cap==0)break;if(used.contains(p.work))p=best(groups.get(p.author),used,known);if(p==null)continue;
                    dest.add(p);used.add(p.work);onPage.add(p.author);uses.put(p.author,uses.getOrDefault(p.author,0)+1);cap--;}
            }
            if(old.isEmpty()&&fresh.isEmpty())break;
            List<Pick> mixed=new ArrayList<>();for(int i=0;i<Math.max(old.size(),fresh.size());i++){if(i<old.size())mixed.add(old.get(i));if(i<fresh.size())mixed.add(fresh.get(i));}
            pages.add(mixed);
        }
        return pages;
    }
}
