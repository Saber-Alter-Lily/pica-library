package com.picalibrary.android;

import static org.junit.Assert.*;
import android.content.Context;
import org.robolectric.RuntimeEnvironment;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.Before;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=35)
public class PreferenceDraftTest {
    @Before public void stableSession(){RecommendationPolicyStore.clearLocalSessionIntent(RuntimeEnvironment.getApplication());}
    @Test public void multipleSearchEditsStayLocalUntilOneExplicitCommit() throws Exception {
        Context context=RuntimeEnvironment.getApplication();
        PreferenceDraft draft=new PreferenceDraft();
        String before=RecommendationPolicyStore.snapshot(context).toString();
        draft.stage("TAG","雙馬尾","雙馬尾","MORE",3,null);
        draft.stage("AUTHOR","writer","Writer","LESS",-2,null);
        assertEquals(2,draft.size());assertEquals(before,RecommendationPolicyStore.snapshot(context).toString());
        RecommendationPolicyStore.setLocalControls(context,draft.mutations());
        assertEquals(2,RecommendationPolicyStore.controls(context).length());
        assertEquals(2,RecommendationPolicyStore.pendingControlCount(context));
        assertEquals("雙馬尾",RecommendationPolicyStore.controls(context).getJSONObject(0).getString("key"));
    }
    @Test public void resetAndUndoDoNotPersist() throws Exception {
        PreferenceDraft draft=new PreferenceDraft();
        draft.stage("TAG","one","One","MORE",2,null);
        draft.stage("TAG","one","One","DEFAULT",0,null);
        assertTrue(draft.isEmpty());
        draft.stage("TAG","one","One","BLOCK",null,null);draft.clear();assertTrue(draft.isEmpty());
    }
    @Test public void rotationPreservesDefaultRemovalAndOriginalKey() throws Exception {
        JSONObject persisted=new JSONObject("{\"targetType\":\"TAG\",\"key\":\"雙馬尾\",\"direction\":\"BLOCK\"}");
        PreferenceDraft first=new PreferenceDraft();first.stage("TAG","雙馬尾","雙馬尾","DEFAULT",null,persisted);
        PreferenceDraft restored=new PreferenceDraft();restored.restore(new JSONArray(first.mutations().toString()));
        assertEquals(1,restored.size());assertNull(restored.effective("TAG","雙馬尾",persisted));
    }
    @Test public void invalidBatchCannotPartiallyWritePolicyOrSyncQueue() throws Exception {
        Context context=RuntimeEnvironment.getApplication();String before=RecommendationPolicyStore.snapshot(context).toString();int pending=RecommendationPolicyStore.pendingControlCount(context);
        JSONArray batch=new JSONArray("[{\"targetType\":\"TAG\",\"key\":\"valid\",\"direction\":\"MORE\"},{\"targetType\":\"INVALID\",\"key\":\"bad\",\"direction\":\"MORE\"}]");
        try{RecommendationPolicyStore.setLocalControls(context,batch);fail("must reject invalid batch");}catch(IllegalStateException expected){}
        assertEquals(before,RecommendationPolicyStore.snapshot(context).toString());assertEquals(pending,RecommendationPolicyStore.pendingControlCount(context));
    }
    @Test public void packagedSearchFindsChineseVariantsWithoutMutatingIdentity() throws Exception {
        Context context=RuntimeEnvironment.getApplication();PreferenceSearchIndex index=PreferenceSearchIndex.load(context);
        JSONObject row=new JSONObject("{\"targetType\":\"TAG\",\"key\":\"雙馬尾\",\"label\":\"雙馬尾\"}");
        assertTrue(index.matches(row,"双马尾"));assertEquals("雙馬尾",row.getString("key"));
        assertEquals("头发的发展",index.fold("頭髮的發展"));
    }
}
