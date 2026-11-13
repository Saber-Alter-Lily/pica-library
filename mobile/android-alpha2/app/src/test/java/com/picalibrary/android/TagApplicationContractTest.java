package com.picalibrary.android;

import static org.junit.Assert.*;
import android.content.Context;
import java.util.*;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

/** Exercise the compatibility facade and real score/save callers, not just the extracted rules. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk={28,35},manifest=Config.NONE)
public class TagApplicationContractTest {
    private JSONObject state(JSONObject policy) throws Exception {return new JSONObject().put("tagPolicy",policy);}
    @Test public void localSelectionParticipatesInUnscopedControls() throws Exception {
        JSONObject policy=TagParticipation.normalize(null).put("mode","SELECTED").put("selected",new JSONArray().put("local|line"));
        TagParticipation tags=TagParticipation.of(state(policy));
        assertTrue(tags.controlEnabled("TAG","line",null));
        assertTrue(tags.controlEnabled("FANDOM","line","local:1"));
        assertFalse(tags.controlEnabled("TAG","line","pica:1"));
    }
    @Test public void allModeDoesNotResurrectStaleEhSelections() throws Exception {
        JSONObject policy=TagParticipation.normalize(null).put("selected",new JSONArray().put("eh|female:line"))
                .put("disabled",new JSONArray(Arrays.asList("pica|line","eh|line","jm|line","local|line")));
        TagParticipation tags=TagParticipation.of(state(policy));
        assertFalse(tags.controlEnabled("TAG","line",null));
        assertTrue(tags.controlEnabled("AUTHOR","line",null));
    }
    @Test public void currentComicFactsReachSoftControlsBeforeAnySidecarLoad() throws Exception {
        JSONObject policy=TagParticipation.normalize(null).put("mode","SELECTED").put("selected",new JSONArray().put("eh|female:schoolgirl"));
        JSONObject current=state(policy).put("controls",new JSONArray().put(new JSONObject().put("targetType","TAG").put("key","schoolgirl").put("direction","MORE")));
        PicaClient.Comic comic=new PicaClient.Comic("eh:synthetic","Title","Creator","","","",Arrays.asList("schoolgirl","female:schoolgirl"),Collections.emptyList(),false,false,0,0,0,0);
        assertTrue(RecommendationPolicyStore.adjustment(current,comic)>0);
        assertEquals(Arrays.asList("schoolgirl","female:schoolgirl"),comic.tags);
    }
    @Test public void malformedSchemeCannotReplacePersistedPolicyOrPendingMutation() throws Exception {
        Context context=RuntimeEnvironment.getApplication();
        JSONObject initial=RecommendationPolicyStore.snapshot(context);
        RecommendationPolicyStore.setLocalTagPolicy(context,TagParticipation.normalize(null).put("mode","SELECTED"),initial);
        Map<String,?> persisted=new HashMap<>(context.getSharedPreferences("recommendation-policy-v5",0).getAll());
        JSONObject invalid=TagParticipation.normalize(null).put("privateTags",new JSONArray().put(new JSONObject()
                .put("id","pt_11111111111111111111111111111111").put("name",123).put("kind","MANUAL")
                .put("comicIds",new JSONArray()).put("mappings",new JSONArray())));
        try {RecommendationPolicyStore.setLocalTagPolicy(context,invalid,RecommendationPolicyStore.snapshot(context));fail("accepted a malformed scheme");}
        catch(IllegalArgumentException expected){}
        assertEquals(persisted,context.getSharedPreferences("recommendation-policy-v5",0).getAll());
        assertTrue(RecommendationPolicyStore.hasPendingPortableChanges(context));
    }
}
