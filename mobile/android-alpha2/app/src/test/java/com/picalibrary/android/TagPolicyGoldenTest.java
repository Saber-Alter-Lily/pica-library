package com.picalibrary.android;

import static org.junit.Assert.*;
import com.picalibrary.android.tags.TagPolicyRules;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk={28,35},manifest=Config.NONE)
public class TagPolicyGoldenTest {
    private JSONObject fixture() throws Exception {
        try(InputStream stream=getClass().getClassLoader().getResourceAsStream("golden-v1.json")){
            assertNotNull("The shared tracked Desktop fixture must be present",stream);
            return new JSONObject(new String(stream.readAllBytes(),StandardCharsets.UTF_8));
        }
    }
    private List<String> strings(JSONArray array){List<String> out=new ArrayList<>();if(array!=null)for(int i=0;i<array.length();i++)out.add(array.optString(i));return out;}
    private TagPolicyRules read(Object input){
        if(input==null||input==JSONObject.NULL)return TagPolicyRules.legacy();
        if(!(input instanceof JSONObject))throw new IllegalArgumentException("Invalid explicit policy");
        return TagPolicyJson.read((JSONObject)input);
    }
    private TagPolicyRules.Comic comic(JSONObject value){
        JSONObject metadata=value.optJSONObject("providerMetadata");
        return new TagPolicyRules.Comic(value.optString("comicId"),value.optString("providerId",null),strings(value.optJSONArray("tags")),
                metadata==null?null:strings(metadata.optJSONArray("rawTags")),value.optBoolean("isFavorite",false));
    }
    @Test public void versionedFixtureHasUniqueCoveredKinds() throws Exception {
        JSONObject fixture=fixture();assertEquals(1,fixture.getInt("schemaVersion"));JSONArray cases=fixture.getJSONArray("cases");assertEquals(44,cases.length());
        Set<String> ids=new HashSet<>(),kinds=new HashSet<>();
        for(int i=0;i<cases.length();i++){JSONObject row=cases.getJSONObject(i);assertTrue(ids.add(row.getString("id")));kinds.add(row.getString("kind"));}
        assertEquals(new HashSet<>(Arrays.asList("normalize","key","project","control","match","invalid","invalid-state","directory")),kinds);
    }
    @Test public void normalizedPoliciesAndKeys() throws Exception { run("normalize","key"); }
    @Test public void providerAndPrivateProjections() throws Exception { run("project"); }
    @Test public void controlsWithAndWithoutComicContext() throws Exception { run("control"); }
    @Test public void manualAndMappedPrivateMatches() throws Exception { run("match"); }
    @Test public void invalidExplicitStateIsNotReset() throws Exception { run("invalid","invalid-state"); }
    @Test public void uniqueWorkCountsAreNotTagFrequencyOrLikingStrength() throws Exception { run("directory"); }

    private void run(String... requested) throws Exception {
        JSONObject fixture=fixture(),policies=fixture.getJSONObject("policies");JSONArray cases=fixture.getJSONArray("cases");int exercised=0;
        for(int i=0;i<cases.length();i++){
            JSONObject row=cases.getJSONObject(i);String kind=row.getString("kind"),id=row.getString("id");
            if(!Arrays.asList(requested).contains(kind))continue;
            exercised++;String before=fixture.toString();TagPolicyRules policy=read(policies.opt(row.optString("policy")));
            TagPolicyRules.Comic comic=row.has("comic")?comic(row.getJSONObject("comic")):null;
            switch(kind){
                case "normalize": assertEquals(id,policies.getJSONObject(row.getString("expectedPolicy")).toString(),TagPolicyJson.write(read(row.has("inputPolicy")?policies.get(row.getString("inputPolicy")):row.get("input"))).toString());break;
                case "key": assertEquals(id,row.getString("expected"),TagPolicyRules.normalizeKey(row.getString("input")));break;
                case "project": assertEquals(id,row.getJSONArray("expected").toString(),new JSONArray(policy.tags(comic,row.optBoolean("includePrivate",true))).toString());break;
                case "control": assertEquals(id,row.getBoolean("expected"),policy.controlEnabled(row.getString("type"),row.getString("key"),comic));break;
                case "match": assertEquals(id,row.getBoolean("expected"),policy.matchesPrivate(row.getString("key"),comic));break;
                case "invalid":
                    try{read(row.get("input"));fail(id+": malformed policy accepted");}catch(IllegalArgumentException expected){}break;
                case "invalid-state":
                    try{TagParticipation.of(new JSONObject().put("tagPolicy",row.get("input")));fail(id+": malformed state reset");}catch(IllegalArgumentException expected){}break;
                case "directory":
                    List<TagPolicyRules.Comic> catalog=new ArrayList<>();JSONArray raw=row.getJSONArray("catalog");for(int j=0;j<raw.length();j++)catalog.add(comic(raw.getJSONObject(j)));
                    List<TagPolicyRules.DirectoryRow> rows=policy.directory(catalog,(provider,tag)->"OTHER",true);rows.sort(Comparator.comparing(r->r.identity));JSONArray actual=new JSONArray();
                    for(TagPolicyRules.DirectoryRow item:rows)actual.put(new JSONObject().put("identity",item.identity).put("supportCount",item.favoriteIds.size()).put("catalogCount",item.catalogIds.size()).put("enabled",item.enabled));
                    assertEquals(id,row.getJSONArray("expected").toString(),actual.toString());break;
                default: fail("Uncovered kind "+kind);
            }
            assertEquals(id+": input was mutated",before,fixture.toString());
        }
        assertTrue("Expected fixture cases to execute",exercised>0);
    }
}
