package com.picalibrary.android;
import org.junit.Test;
import static org.junit.Assert.*;

public class ShellPolicyTest {
    @Test public void acceptedBottomNavigationIsStable(){assertArrayEquals(new String[]{"书库","推荐","在线","连接"},ShellPolicy.bottomTabs());}
    @Test public void tabClampMatchesFourTabShell(){assertEquals(0,ShellPolicy.clampTab(-1));assertEquals(0,ShellPolicy.clampTab(0));assertEquals(3,ShellPolicy.clampTab(3));assertEquals(3,ShellPolicy.clampTab(9));}
    @Test public void mobileShellDoesNotReintroduceAtlas(){for(String tab:ShellPolicy.bottomTabs())assertNotEquals("图鉴",tab);}
    @Test public void verifiedCacheDisplaysBatch(){assertEquals("电脑推荐已就绪 · 第 1 / 6 批",ShellPolicy.recommendationStatus("final-v3-current",true,0,6));}
    @Test public void legacyDoesNotClaimReady(){assertFalse(ShellPolicy.recommendationStatus("",false,0,6).contains("已就绪"));}
    @Test public void flagAloneDoesNotClaimReady(){assertFalse(ShellPolicy.recommendationStatus("legacy",true,0,6).contains("已就绪"));}
    @Test public void sourceAloneDoesNotClaimReady(){assertFalse(ShellPolicy.recommendationStatus("final-v3-current",false,0,6).contains("已就绪"));}
    @Test public void missingBatchDoesNotInventIt(){assertFalse(ShellPolicy.recommendationStatus("final-v3-current",true,-1,0).contains("批"));}
    @Test public void invalidBatchDoesNotDisplay(){assertFalse(ShellPolicy.recommendationStatus("final-v3-current",true,6,6).contains("批"));}
}
