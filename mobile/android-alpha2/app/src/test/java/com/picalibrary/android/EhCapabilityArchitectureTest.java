package com.picalibrary.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class EhCapabilityArchitectureTest {
    @Test public void providerRolesKeepExhOptional(){
        assertTrue(SourceCapabilities.PICA.core());
        assertTrue(SourceCapabilities.EH.core());
        assertTrue(SourceCapabilities.PICA.baseRecommendationSource);
        assertTrue(SourceCapabilities.EH.baseRecommendationSource);
        assertTrue(SourceCapabilities.EXH.optionalCapability());
        assertEquals("eh",SourceCapabilities.EXH.parentId);
        assertFalse(SourceCapabilities.EXH.baseRecommendationSource);
    }

    @Test public void exhStatusWordingIsObservedNotPermanent(){
        assertEquals("当前可用",new EhCapabilityStore.Snapshot(EhCapabilityStore.State.AVAILABLE,1).label());
        assertEquals("当前不可访问",new EhCapabilityStore.Snapshot(EhCapabilityStore.State.CURRENTLY_UNAVAILABLE,1).label());
        assertEquals("暂无法确认",new EhCapabilityStore.Snapshot(EhCapabilityStore.State.NETWORK_ERROR,1).label());
        assertEquals("待检查",new EhCapabilityStore.Snapshot(EhCapabilityStore.State.UNKNOWN,0).label());
        assertEquals("需 E-H 登录",new EhCapabilityStore.Snapshot(EhCapabilityStore.State.NOT_CONNECTED,0).label());
        for(EhCapabilityStore.State state:EhCapabilityStore.State.values())assertFalse(new EhCapabilityStore.Snapshot(state,1).label().contains("无权限"));
    }

    @Test public void capabilityTtlRetriesNetworkErrorsSooner(){
        long now=10L*60L*60L*1000L;
        assertTrue(new EhCapabilityStore.Snapshot(EhCapabilityStore.State.AVAILABLE,now-5L*60L*60L*1000L).fresh(now));
        assertFalse(new EhCapabilityStore.Snapshot(EhCapabilityStore.State.AVAILABLE,now-7L*60L*60L*1000L).fresh(now));
        assertTrue(new EhCapabilityStore.Snapshot(EhCapabilityStore.State.NETWORK_ERROR,now-10L*60L*1000L).fresh(now));
        assertFalse(new EhCapabilityStore.Snapshot(EhCapabilityStore.State.NETWORK_ERROR,now-20L*60L*1000L).fresh(now));
    }
}
