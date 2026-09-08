package com.picalibrary.android;
import org.junit.Test;
import static org.junit.Assert.*;

public class ShellPolicyTest {
    @Test public void verifiedCacheDisplaysBatch(){assertEquals("电脑当前推荐 · 已缓存 · 第 1 / 6 批",ShellPolicy.recommendationStatus("final-v3-current",true,0,6));}
    @Test public void legacyDoesNotClaimCache(){assertFalse(ShellPolicy.recommendationStatus("",false,0,6).contains("已缓存"));}
    @Test public void flagAloneDoesNotClaimCache(){assertFalse(ShellPolicy.recommendationStatus("legacy",true,0,6).contains("已缓存"));}
    @Test public void sourceAloneDoesNotClaimCache(){assertFalse(ShellPolicy.recommendationStatus("final-v3-current",false,0,6).contains("已缓存"));}
    @Test public void missingBatchDoesNotInventIt(){assertFalse(ShellPolicy.recommendationStatus("final-v3-current",true,-1,0).contains("批"));}
    @Test public void invalidBatchDoesNotDisplay(){assertFalse(ShellPolicy.recommendationStatus("final-v3-current",true,6,6).contains("批"));}
}
