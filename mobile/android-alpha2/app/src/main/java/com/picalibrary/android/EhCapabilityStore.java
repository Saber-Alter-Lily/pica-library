package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Persisted ExH capability state. ExH is optional and must never gate core E-H/Pica readiness. */
final class EhCapabilityStore {
    enum State { NOT_CONNECTED, UNKNOWN, AVAILABLE, CURRENTLY_UNAVAILABLE, NETWORK_ERROR }

    static final class Snapshot {
        final State state;final long checkedAt;
        Snapshot(State state,long checkedAt){this.state=state==null?State.UNKNOWN:state;this.checkedAt=Math.max(0L,checkedAt);}
        boolean available(){return state==State.AVAILABLE;}
        boolean fresh(long now){if(checkedAt<=0)return false;long age=Math.max(0L,now-checkedAt);if(state==State.NETWORK_ERROR)return age<=15L*60L*1000L;if(state==State.AVAILABLE||state==State.CURRENTLY_UNAVAILABLE)return age<=6L*60L*60L*1000L;return false;}
        String label(){switch(state){case AVAILABLE:return "当前可用";case CURRENTLY_UNAVAILABLE:return "当前不可访问";case NETWORK_ERROR:return "暂无法确认";case NOT_CONNECTED:return "需 E-H 登录";default:return "待检查";}}
    }

    interface Callback { void complete(Snapshot snapshot); }
    private static final String PREF="eh-capability-v1";
    private static final ExecutorService CHECKER=Executors.newSingleThreadExecutor();
    private EhCapabilityStore(){}

    static Snapshot load(Context context){Context app=context.getApplicationContext();if(!EhAccountStore.load(app).configured())return new Snapshot(State.NOT_CONNECTED,0);SharedPreferences p=app.getSharedPreferences(PREF,Context.MODE_PRIVATE);State state=State.UNKNOWN;try{state=State.valueOf(p.getString("exhState",State.UNKNOWN.name()));}catch(Exception ignored){}return new Snapshot(state,p.getLong("checkedAt",0));}

    static synchronized Snapshot refresh(Context context,boolean force){Context app=context.getApplicationContext();if(!EhAccountStore.load(app).configured()){clear(app);return new Snapshot(State.NOT_CONNECTED,0);}long now=System.currentTimeMillis();Snapshot prior=load(app);if(!force&&prior.fresh(now))return prior;String raw=new EhClient(app).probeExH();State state="AVAILABLE".equals(raw)?State.AVAILABLE:"NETWORK_ERROR".equals(raw)?State.NETWORK_ERROR:State.CURRENTLY_UNAVAILABLE;Snapshot next=new Snapshot(state,now);save(app,next);return next;}

    static void refreshAsync(Context context,boolean force,Callback callback){Context app=context.getApplicationContext();CHECKER.submit(()->{Snapshot snapshot;try{snapshot=refresh(app,force);}catch(Exception e){snapshot=new Snapshot(State.NETWORK_ERROR,System.currentTimeMillis());save(app,snapshot);}if(callback!=null){Snapshot value=snapshot;new Handler(Looper.getMainLooper()).post(()->callback.complete(value));}});}

    static void invalidate(Context context){Context app=context.getApplicationContext();if(!EhAccountStore.load(app).configured()){clear(app);return;}app.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString("exhState",State.UNKNOWN.name()).putLong("checkedAt",0).apply();}
    static void clear(Context context){context.getApplicationContext().getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().clear().apply();}

    private static void save(Context context,Snapshot snapshot){context.getApplicationContext().getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString("exhState",snapshot.state.name()).putLong("checkedAt",snapshot.checkedAt).apply();}
}
