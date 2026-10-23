package com.picalibrary.android.sources;

import java.io.IOException;
import java.util.*;

/** Pure source authorization. No Android, credentials, storage, reader or network ownership. */
public final class SourceAccessPolicy {
    public static final List<String> IDS=Collections.unmodifiableList(Arrays.asList("pica","eh","jm"));
    private static final long MAX_REVISION=9007199254740991L;
    public static final class Disabled extends IllegalStateException {
        public final String source;
        public Disabled(String source){super("SOURCE_DISABLED: "+source);this.source=source;}
    }
    public static final class Stale extends IllegalStateException {
        public Stale(){super("SOURCE_POLICY_STALE");}
    }
    public static final class Snapshot {
        public final long revision;
        public final Set<String> enabled;
        public Snapshot(long revision,Collection<String> enabled){
            if(revision<0||revision>MAX_REVISION||enabled==null||enabled.size()>IDS.size())throw new IllegalArgumentException("Invalid source policy");
            Set<String> unique=new HashSet<>();for(String id:enabled)if(!IDS.contains(id)||!unique.add(id))throw new IllegalArgumentException("Invalid source identity");
            LinkedHashSet<String> sorted=new LinkedHashSet<>();for(String id:IDS)if(unique.contains(id))sorted.add(id);
            this.revision=revision;this.enabled=Collections.unmodifiableSet(sorted);
        }
    }
    public interface Persistence {void write(Snapshot value) throws IOException;}
    public interface Commit<T> {T run() throws Exception;}
    public interface Registration extends AutoCloseable {@Override void close();}
    private Snapshot state;
    private final Map<String,Long> epochs=new HashMap<>();
    private final Map<String,Set<Runnable>> cancellations=new HashMap<>();
    public SourceAccessPolicy(Snapshot initial){state=initial;for(String id:IDS){epochs.put(id,0L);cancellations.put(id,new HashSet<>());}}
    public synchronized Snapshot snapshot(){return state;}
    public synchronized boolean enabled(String id){requireId(id);return state.enabled.contains(id);}
    private static void requireId(String id){if(!IDS.contains(id))throw new IllegalArgumentException("Unknown source: "+id);}

    /** Binding is lazy: constructing a source must not enable it or start a worker. */
    public synchronized Permit bind(String id){requireId(id);return new Permit(id,epochs.get(id));}
    public final class Permit {
        public final String source;
        private final long epoch;
        private Permit(String source,long epoch){this.source=source;this.epoch=epoch;}
        public void check(){synchronized(SourceAccessPolicy.this){if(!state.enabled.contains(source)||epochs.get(source)!=epoch)throw new Disabled(source);}}
        public boolean current(){synchronized(SourceAccessPolicy.this){return epochs.get(source)==epoch;}}
        public Registration onCancel(Runnable action){
            synchronized(SourceAccessPolicy.this){check();cancellations.get(source).add(action);}
            return ()->{synchronized(SourceAccessPolicy.this){cancellations.get(source).remove(action);}};
        }
        /** Use only for short local commits, never blocking remote work. */
        public <T>T commit(Commit<T> action) throws Exception {synchronized(SourceAccessPolicy.this){check();return action.run();}}
    }
    public Snapshot save(long expected,Collection<String> enabled,Persistence persistence) throws IOException {
        List<Runnable> abort=new ArrayList<>();Snapshot next;
        synchronized(this){
            if(expected!=state.revision)throw new Stale();
            next=new Snapshot(expected,enabled);
            if(next.enabled.equals(state.enabled))return state;
            next=new Snapshot(expected+1,enabled);
            persistence.write(next); // failed disk write must not change access or abort a request
            for(String id:IDS)if(state.enabled.contains(id)&&!next.enabled.contains(id)){
                epochs.put(id,epochs.get(id)+1);abort.addAll(cancellations.get(id));cancellations.get(id).clear();
            }
            state=next;
        }
        // Never hold the policy lock across a transport/UI callback.
        for(Runnable action:abort)try{action.run();}catch(RuntimeException ignored){}
        return next;
    }
}
