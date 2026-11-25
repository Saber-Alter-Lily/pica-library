package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import java.util.*;
import java.util.concurrent.*;

/** Never starts a provider merely to display subscription status. Scans use existing sessions. */
final class ReaderSubscriptionSync {
    interface Callback {void done(int unread,boolean partial);}
    private static final ExecutorService worker=Executors.newSingleThreadExecutor();
    private static final List<Callback> callbacks=new ArrayList<>();
    private static boolean running,lastPartial,forcePending;
    private static long last;
    private static final Handler main=new Handler(Looper.getMainLooper());
    private ReaderSubscriptionSync(){}
    static synchronized void refresh(Context ctx,boolean force,Callback cb){
        Context app=ctx.getApplicationContext();if(cb!=null)callbacks.add(cb);if(running){if(force)forcePending=true;return;}running=true;
        final boolean check=force||System.currentTimeMillis()-last>=15*60000L;
        worker.execute(()->{
            boolean partial=lastPartial;int unread=0;
            try{
                ReaderRoundLedger db=ReaderRoundLedger.get(app);Map<String,String> authors=db.following();
                if(check){partial=false;
                    if(!authors.isEmpty()){
                        SharedPreferences pref=app.getSharedPreferences("reader-subscription-cursors",Context.MODE_PRIVATE);
                        List<String> keys=new ArrayList<>(authors.keySet());int start=Math.floorMod(pref.getInt("next-author",0),keys.size()),n=Math.min(6,keys.size());
                        for(int i=0;i<n;i++){
                            String key=keys.get((start+i)%keys.size());
                            if(scanAuthor(app,db,pref,key,authors.get(key)))partial=true;
                        }
                        pref.edit().putInt("next-author",(start+n)%keys.size()).apply();partial|=n<keys.size();
                    }
                }
                unread=db.inbox().size();
            }catch(Exception ex){partial=true;}
            final boolean incomplete=partial; final int count=unread;final List<Callback> listeners;
            synchronized(ReaderSubscriptionSync.class){if(check)last=System.currentTimeMillis();lastPartial=partial;running=false;
                if(forcePending){forcePending=false;refresh(app,true,null);return;}
                listeners=new ArrayList<>(callbacks);callbacks.clear();}
            main.post(()->{for(Callback c:listeners)c.done(count,incomplete);});
        });
    }
    private static boolean scanAuthor(Context c,ReaderRoundLedger db,SharedPreferences pref,String key,String label){
        long started=System.currentTimeMillis(),since=db.subscriptionSince(key);boolean partial=false,enabled=false;
        if(since<0)return false;
        if(PicaClient.available(c)){
            enabled=true;try{
                PicaClient client=new PicaClient(c);
                // Always check the newest page, then continue walking the author's older serials.
                String cursorKey="pica:"+key;int resume=pref.getLong(cursorKey+":since",-1)==since?Math.max(2,pref.getInt(cursorKey,2)):2;int page=1;
                Map<String,PicaClient.Comic> matched=new LinkedHashMap<>();boolean completed=false;int next=resume;
                for(int calls=0;calls<4;calls++){
                    PicaClient.ComicPage found;try{found=client.search(label,page,"dd",Collections.emptyList());}catch(Exception unavailable){partial=true;break;}
                    if(found.page!=page||found.pages<1){partial=true;break;}
                    for(PicaClient.Comic book:found.comics)if(!book.id.isEmpty()&&ReaderRoundPlanner.author(book.author).equals(key))
                        matched.put(book.id,book);
                    boolean lastPage=page>=found.pages;
                    if(lastPage){completed=true;break;}
                    next=page==1?Math.min(resume,found.pages):page+1;page=next;if(calls==3)partial=true;
                }
                // Some search summaries don't carry chapter totals. Query at most two real
                // details, rotate the budget, and never infer chapters from a changed title/date.
                List<String> missing=new ArrayList<>();for(PicaClient.Comic b:matched.values())if(b.epsCount<=0)missing.add(b.id);
                if(!missing.isEmpty()){
                    int offset=Math.floorMod(pref.getInt(cursorKey+":details",0),missing.size()),n=Math.min(2,missing.size());
                    for(int i=0;i<n;i++){String id=missing.get((offset+i)%missing.size());try{
                        PicaClient.Comic detail=client.comic(id);
                        if(id.equals(detail.id)&&detail.epsCount>0)matched.put(id,detail);else partial=true;
                    }catch(Exception unavailable){partial=true;}}
                    pref.edit().putInt(cursorKey+":details",(offset+n)%missing.size()).apply();partial|=n<missing.size();
                }
                List<ReaderRoundLedger.Observation> observations=new ArrayList<>();
                for(PicaClient.Comic b:matched.values())observations.add(new ReaderRoundLedger.Observation(b.id,b.title,b.epsCount,b.publishedAt));
                db.observe(key,"pica",observations,completed,started);
                if(completed)pref.edit().remove(cursorKey).apply();
                else pref.edit().putInt(cursorKey,next).putLong(cursorKey+":since",since).apply();
            }catch(Exception ex){partial=true;}
        }
        if(EhClient.accountAvailable(c)){
            enabled=true;List<String> surfaces=new ArrayList<>();surfaces.add("eh");
            if(EhCapabilityStore.load(c).available())surfaces.add("exh");
            for(String site:surfaces)try{
                List<ReaderRoundLedger.Observation> observations=new ArrayList<>();
                for(EhClient.Comic b:new EhClient(c).search(EhOnlineFilterSpec.exactCanonical("artist:"+label),site)){
                    if(!ReaderRoundPlanner.author(b.author).equals(key)&&b.authors.stream().noneMatch(a->key.equals(ReaderRoundPlanner.author(a))))continue;
                    observations.add(new ReaderRoundLedger.Observation(b.id,b.title,1,b.posted>0?b.posted*1000L:0));
                }
                // EH exposes a window, not an exhaustive author feed. Trust dated new works only.
                db.observe(key,site,observations,false,started);
            }catch(Exception ex){partial=true;}
        }
        return partial||!enabled;
    }
}
