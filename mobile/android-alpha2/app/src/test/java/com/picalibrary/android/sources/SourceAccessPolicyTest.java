package com.picalibrary.android.sources;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public class SourceAccessPolicyTest {
    private SourceAccessPolicy policy(String... ids){return new SourceAccessPolicy(new SourceAccessPolicy.Snapshot(0,Arrays.asList(ids)));}
    @Test public void freshPolicyIsOptInAndExhIsNotAnIndependentSource(){
        SourceAccessPolicy p=policy();assertFalse(p.enabled("pica"));assertFalse(p.enabled("eh"));assertFalse(p.enabled("jm"));
        assertThrows(IllegalArgumentException.class,()->p.bind("exh"));assertThrows(SourceAccessPolicy.Disabled.class,()->p.bind("pica").check());
    }
    @Test public void sameChoiceIsIdempotentAndDoesNotWrite() throws Exception {
        SourceAccessPolicy p=policy("pica");assertEquals(0,p.save(0,Arrays.asList("pica"),s->{fail();}).revision);
    }
    @Test public void storageFailureRetainsPolicyAndDoesNotCancel() throws Exception {
        SourceAccessPolicy p=policy("pica");AtomicInteger aborts=new AtomicInteger();SourceAccessPolicy.Permit old=p.bind("pica");old.onCancel(aborts::incrementAndGet);
        assertThrows(IOException.class,()->p.save(0,Collections.emptyList(),s->{throw new IOException("disk fixture");}));old.check();assertEquals(0,aborts.get());assertEquals(0,p.snapshot().revision);
    }
    @Test public void staleRevisionCannotOverwriteNewerIntent() throws Exception {
        SourceAccessPolicy p=policy();p.save(0,Arrays.asList("pica"),s->{});
        assertThrows(SourceAccessPolicy.Stale.class,()->p.save(0,Arrays.asList("eh"),s->fail()));assertTrue(p.enabled("pica"));assertFalse(p.enabled("eh"));
    }
    @Test public void revocationIsPerSourceAndOldResultsNeverRevive() throws Exception {
        SourceAccessPolicy p=policy("pica","eh");SourceAccessPolicy.Permit old=p.bind("pica"),eh=p.bind("eh");AtomicInteger aborts=new AtomicInteger();old.onCancel(aborts::incrementAndGet);
        p.save(0,Arrays.asList("eh"),s->{});assertEquals(1,aborts.get());eh.check();
        p.save(1,Arrays.asList("pica","eh"),s->{});p.bind("pica").check();assertFalse(old.current());
        assertThrows(SourceAccessPolicy.Disabled.class,()->old.commit(()->{fail("late catalog write");return null;}));
    }
    @Test public void completedTransportCanUnregisterItsCancellation() throws Exception {
        SourceAccessPolicy p=policy("jm");AtomicInteger aborts=new AtomicInteger();p.bind("jm").onCancel(aborts::incrementAndGet).close();p.save(0,Collections.emptyList(),s->{});assertEquals(0,aborts.get());
    }
    @Test public void malformedPolicyCannotOptInOrWrapRevision(){
        for(List<String> ids:Arrays.asList(Arrays.asList("pica","pica"),Arrays.asList("unknown"),Arrays.asList("exh")))assertThrows(IllegalArgumentException.class,()->new SourceAccessPolicy.Snapshot(0,ids));
        assertThrows(IllegalArgumentException.class,()->new SourceAccessPolicy.Snapshot(-1,Collections.emptyList()));
        assertThrows(IllegalArgumentException.class,()->new SourceAccessPolicy.Snapshot(9007199254740992L,Collections.emptyList()));
    }
    @Test public void callbacksRunOutsidePolicyLockAndOneFailureDoesNotSkipOthers() throws Exception {
        SourceAccessPolicy p=policy("pica");AtomicInteger calls=new AtomicInteger();ExecutorService worker=Executors.newSingleThreadExecutor();
        try{p.bind("pica").onCancel(()->{throw new IllegalStateException("fixture");});p.bind("pica").onCancel(()->{try{assertFalse(worker.submit(()->p.enabled("pica")).get(1,TimeUnit.SECONDS));calls.incrementAndGet();}catch(Exception e){throw new AssertionError(e);}});p.save(0,Collections.emptyList(),s->{});assertEquals(1,calls.get());}finally{worker.shutdownNow();}
    }
    @Test public void immutableSnapshotAndCanonicalOrder(){
        SourceAccessPolicy p=policy("jm","pica");assertEquals(Arrays.asList("pica","jm"),new ArrayList<>(p.snapshot().enabled));assertThrows(UnsupportedOperationException.class,()->p.snapshot().enabled.add("eh"));
    }
}
