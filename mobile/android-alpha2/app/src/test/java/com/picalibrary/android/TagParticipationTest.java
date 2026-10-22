package com.picalibrary.android;

import static org.junit.Assert.*;
import android.content.Context;
import java.util.*;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=35)
public final class TagParticipationTest {
    private Context context;
    private static final String MANUAL="pt_11111111111111111111111111111111",MAPPED="pt_22222222222222222222222222222222";
    @Before public void reset(){context=RuntimeEnvironment.getApplication();context.getSharedPreferences("recommendation-policy-v5",0).edit().clear().commit();context.getSharedPreferences("recommendation-evidence-v1",0).edit().clear().commit();}
    private JSONObject state(JSONObject policy) throws Exception {return new JSONObject().put("tagPolicy",policy);}
    private JSONObject off() throws Exception {return TagParticipation.normalize(null).put("mode","SELECTED");}
    private PicaClient.Comic comic(String id,List<String> tags){return new PicaClient.Comic(id,"Title","Creator","","","",tags,Collections.emptyList(),false,false,0,0,0,0);}
    private JSONObject privatePolicy() throws Exception {
        return TagParticipation.normalize(off().put("selected",new JSONArray(Arrays.asList("private|"+MANUAL,"private|"+MAPPED))).put("privateTags",new JSONArray()
            .put(new JSONObject().put("id",MANUAL).put("name","My lines").put("kind","MANUAL").put("comicIds",new JSONArray().put("pica:1")).put("mappings",new JSONArray()))
            .put(new JSONObject().put("id",MAPPED).put("name","My school").put("kind","MAPPED").put("comicIds",new JSONArray()).put("mappings",new JSONArray(Arrays.asList("pica|school","eh|female:schoolgirl"))))));
    }
    @Test public void legacyDefaultsAndUnicodeNormalizationMatchDesktop() throws Exception {
        assertEquals(Arrays.asList("School"),TagParticipation.of(new JSONObject()).tags("pica:1",Arrays.asList("School"),true));
        assertEquals("school tag",TagParticipation.norm("\u2028 ＳＣＨＯＯＬ\u3000TAG\uFEFF"));
        JSONObject names=privatePolicy();names.getJSONArray("privateTags").getJSONObject(0).put("name","\u2028 My Lines\uFEFF");assertEquals("My Lines",TagParticipation.normalize(names).getJSONArray("privateTags").getJSONObject(0).getString("name"));
        assertTrue(TagParticipation.same(new JSONObject(),state(TagParticipation.normalize(null))));
    }
    @Test public void selectedOnlyIsProviderScopedAndKeepsRawFacts() throws Exception {
        TagParticipation policy=TagParticipation.of(state(off().put("selected",new JSONArray().put("pica|school"))));
        PicaClient.Comic raw=comic("eh:1",Arrays.asList("School","New tag"));assertTrue(policy.project(raw,true).tags.isEmpty());assertEquals(2,raw.tags.size());
        assertEquals(Arrays.asList("School"),policy.tags("pica:1",raw.tags,false));
    }
    @Test public void manualAndAnyMappingsStayIndependentOfRawTagParticipation() throws Exception {
        TagParticipation policy=TagParticipation.of(state(privatePolicy()));
        assertEquals(Arrays.asList(TagParticipation.PREFIX+MANUAL,TagParticipation.PREFIX+MAPPED),policy.tags("pica:1",Arrays.asList("School"),true));
        assertEquals(Arrays.asList(TagParticipation.PREFIX+MAPPED),policy.tags("eh:2",Arrays.asList("female:schoolgirl"),true));
        assertTrue(policy.tags("eh:2",Arrays.asList("School"),true).isEmpty());
        assertTrue(policy.tags("pica:2",Arrays.asList(TagParticipation.PREFIX+MANUAL),true).isEmpty());
    }
    @Test public void invalidStateAndMixedModesFailClosed() throws Exception {
        try{TagParticipation.normalize(off().put("schemaVersion",2));fail();}catch(IllegalArgumentException expected){}
        JSONObject invalid=privatePolicy();invalid.getJSONArray("privateTags").getJSONObject(0).put("mappings",new JSONArray().put("pica|school"));
        try{TagParticipation.normalize(invalid);fail();}catch(IllegalArgumentException expected){}
        JSONArray tooMany=new JSONArray();for(int i=0;i<4097;i++)tooMany.put("pica|x");try{TagParticipation.normalize(off().put("selected",tooMany));fail();}catch(IllegalArgumentException expected){}
    }
    @Test public void disabledSoftTagDoesNotBypassRawBlock() throws Exception {
        JSONObject current=state(off()).put("controls",new JSONArray().put(new JSONObject().put("targetType","TAG").put("key","school").put("direction","MORE")));
        PicaClient.Comic raw=comic("pica:1",Arrays.asList("School"));assertEquals(0,RecommendationPolicyStore.adjustment(current,raw),0.000001);
        current.getJSONArray("controls").getJSONObject(0).put("direction","BLOCK");assertTrue(RecommendationPolicyStore.blocked(current,raw));
        current=state(privatePolicy()).put("controls",new JSONArray().put(new JSONObject().put("targetType","TAG").put("key",TagParticipation.PREFIX+MANUAL).put("direction","MORE")));
        assertTrue(RecommendationPolicyStore.adjustment(current,raw)>0);
    }
    @Test public void saveIsExplicitCasAndQueuesWholeSchemeWithBase() throws Exception {
        JSONObject before=RecommendationPolicyStore.snapshot(context),policy=off();assertFalse(RecommendationPolicyStore.hasPendingPortableChanges(context));
        RecommendationPolicyStore.setLocalTagPolicy(context,policy,before);JSONObject pending=RecommendationPolicyStore.syncPayload(context);
        assertTrue(RecommendationPolicyStore.hasPendingPortableChanges(context));assertEquals("SELECTED",pending.getJSONObject("tagPolicy").getString("mode"));assertEquals("ALL",pending.getJSONObject("baseTagPolicy").getString("mode"));
        // snapshot() includes a read-time default SessionIntent timestamp. Compare
        // persisted policy, base, dirty flag and mutation ID, not that transient view.
        Map<String,?> stored=new HashMap<>(context.getSharedPreferences("recommendation-policy-v5",0).getAll());try{RecommendationPolicyStore.setLocalTagPolicy(context,TagParticipation.normalize(null),before);fail();}catch(IllegalStateException expected){}
        assertEquals(stored,context.getSharedPreferences("recommendation-policy-v5",0).getAll());
    }
    @Test public void staleAcknowledgementCannotEraseNewLocalTagEdits() throws Exception {
        JSONObject base=RecommendationPolicyStore.snapshot(context);RecommendationPolicyStore.setLocalTagPolicy(context,off(),base);JSONObject oldPayload=RecommendationPolicyStore.syncPayload(context);
        JSONObject first=RecommendationPolicyStore.snapshot(context);RecommendationPolicyStore.setLocalTagPolicy(context,privatePolicy(),first);
        JSONObject reply=new JSONObject().put("acknowledgedMutationId",oldPayload.getString("mutationId")).put("snapshot",first);
        try{RecommendationPolicyStore.acknowledge(context,reply,oldPayload.getString("mutationId"));fail();}catch(IllegalStateException expected){}
        assertTrue(RecommendationPolicyStore.hasPendingPortableChanges(context));assertEquals(2,RecommendationPolicyStore.syncPayload(context).getJSONObject("tagPolicy").getJSONArray("privateTags").length());
    }
    @Test public void cachedRankIsRebasedNotKeptWhenTagSchemeChanges() throws Exception {
        RecommendationPolicyStore.saveCacheBaseline(context,new JSONObject());RecommendationPolicyStore.setLocalTagPolicy(context,off(),RecommendationPolicyStore.snapshot(context));
        NativeRecommendationStore.Snapshot source=new NativeRecommendationStore.Snapshot();source.cycleId="synthetic";source.batches.add(Arrays.asList(new NativeRecommendationStore.Item("z-old","Old","","Old tag reason","FANDOM","old",1,Arrays.asList("school"),Collections.emptyList()),new NativeRecommendationStore.Item("a-new","New","","Other reason","RELATED","other",0,Collections.emptyList(),Collections.emptyList())));
        NativeRecommendationStore.Snapshot result=RecommendationPolicyStore.applyLocalPolicy(context,source);
        assertEquals("a-new",result.current().get(0).comicId);assertEquals(2,result.candidateCount);assertEquals("CACHE_TAG_REBASE",result.current().get(0).family);
        assertEquals("Old tag reason",source.current().get(0).reason);assertEquals(Arrays.asList("school"),source.current().get(0).tags);
    }
    @Test public void tagOnlyBehaviorEvidenceIsMaskedButRawLedgerIsRetained() throws Exception {
        RecommendationEvidenceStore.recordReaderComplete(context,"read","Different",Arrays.asList("school"),Collections.emptyList());
        PicaClient.Comic candidate=comic("candidate",Arrays.asList("school"));assertTrue(RecommendationEvidenceStore.recentAdjustment(context,candidate)>0);
        JSONObject disabled=state(off());assertEquals(0,RecommendationEvidenceStore.recentAdjustment(context,candidate,disabled),0.000001);assertTrue(RecommendationEvidenceStore.recentCount(context)>0);
    }
    @Test public void directoryCountsFavoriteWorksNotDuplicateTagsOrLikingStrength(){
        UnifiedCatalogStore.Snapshot catalog=new UnifiedCatalogStore.Snapshot();UnifiedCatalogStore.Entry first=new UnifiedCatalogStore.Entry("pica:1"),second=new UnifiedCatalogStore.Entry("pica:2");first.favorite=true;first.tags.addAll(Arrays.asList("School","School"));second.tags.add("Other");catalog.byId.put(first.id,first);catalog.byId.put(second.id,second);
        List<TagParticipationActivity.Row> rows=TagParticipationActivity.directory(catalog,null);assertEquals(2,rows.size());assertEquals("School",rows.get(0).label);assertEquals(1,rows.get(0).favoriteIds.size());
    }
    @Test public void ehNamespaceFactsRemainDistinctFromDisplayTagsAcrossCatalogRoundTrip() throws Exception {
        String femaleId="eh:123:1111111111",maleId="eh:124:2222222222";UnifiedCatalogStore.Snapshot catalog=new UnifiedCatalogStore.Snapshot();
        UnifiedCatalogStore.Entry female=new UnifiedCatalogStore.Entry(femaleId),male=new UnifiedCatalogStore.Entry(maleId);female.favorite=true;male.favorite=true;female.tags.add("schoolgirl");male.tags.add("schoolgirl");female.providerRawTags.add("female:schoolgirl");male.providerRawTags.add("male:schoolgirl");catalog.byId.put(femaleId,female);catalog.byId.put(maleId,male);UnifiedCatalogStore.save(context,catalog);
        JSONObject selectedState=state(off().put("selected",new JSONArray().put("eh|female:schoolgirl"))).put("controls",new JSONArray().put(new JSONObject().put("targetType","TAG").put("key","schoolgirl").put("direction","MORE")));
        TagParticipation policy=TagParticipation.of(context,selectedState);assertEquals(Arrays.asList("schoolgirl"),policy.tags(femaleId,female.tags,false));assertTrue(policy.tags(maleId,male.tags,false).isEmpty());assertTrue(RecommendationPolicyStore.adjustment(selectedState,comic(femaleId,female.tags))>0);assertEquals(0,RecommendationPolicyStore.adjustment(selectedState,comic(maleId,male.tags)),0.000001);
        UnifiedCatalogStore.Snapshot restored=UnifiedCatalogStore.load(context);assertEquals(Arrays.asList("female:schoolgirl"),restored.byId.get(femaleId).providerRawTags);assertEquals(Arrays.asList("schoolgirl"),restored.byId.get(femaleId).tags);
        List<TagParticipationActivity.Row> rows=TagParticipationActivity.directory(restored,null,policy);assertEquals(2,rows.size());assertTrue(rows.stream().anyMatch(r->r.identity.equals("eh|female:schoolgirl")));assertTrue(rows.stream().anyMatch(r->r.identity.equals("eh|male:schoolgirl")));
        EhSemanticStore.Snapshot original=new EhSemanticStore.Snapshot(),view=policy.semanticView(original);assertTrue(original.byComicId.isEmpty());assertEquals("female:schoolgirl",view.byComicId.get(femaleId).rawTags.get(0).canonical);
    }
    @Test public void portableCandidatesCarryLosslessPublicTagsForOfflinePrivateMatching() throws Exception {
        String id="eh:125:3333333333";JSONObject candidate=new JSONObject().put("comicId",id).put("providerId","eh").put("tags",new JSONArray().put("schoolgirl")).put("providerRawTags",new JSONArray().put("female:schoolgirl"));
        PortableRecommendationPackageStore.Snapshot portable=PortableRecommendationPackageStore.save(context,new JSONObject().put("schemaVersion",1).put("reservoir",new JSONObject().put("candidates",new JSONArray().put(candidate))));
        assertEquals(Arrays.asList("female:schoolgirl"),portable.candidates.get(0).providerRawTags);JSONObject privateState=state(privatePolicy());TagParticipation policy=TagParticipation.of(context,privateState);
        assertTrue(policy.matchesPrivate(TagParticipation.PREFIX+MAPPED,id,Arrays.asList("schoolgirl")));assertEquals(Arrays.asList(TagParticipation.PREFIX+MAPPED),policy.tags(id,Arrays.asList("schoolgirl"),true));
    }
}
