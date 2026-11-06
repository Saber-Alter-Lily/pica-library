package com.picalibrary.android.tags;

import static org.junit.Assert.*;
import java.util.*;
import org.junit.Test;

/** Plain JUnit: no Android runtime or JSON codec is needed for rule decisions. */
public class TagPolicyRulesTest {
    private static final String ID="pt_11111111111111111111111111111111";
    @Test public void policyAndBindingsAreDefensiveImmutableCopies(){
        List<String> selected=new ArrayList<>(Arrays.asList("private|"+ID)),ids=new ArrayList<>(Arrays.asList("local:1"));
        TagPolicyRules.PrivateTag tag=new TagPolicyRules.PrivateTag(ID,"Mine","MANUAL",ids,Collections.emptyList());
        TagPolicyRules policy=new TagPolicyRules("SELECTED",selected,Collections.emptyList(),Arrays.asList(tag));
        ids.clear();selected.clear();
        assertTrue(policy.matchesPrivate(TagPolicyRules.PRIVATE_PREFIX+ID,new TagPolicyRules.Comic("local:1",null,Collections.emptyList(),null,true)));
        assertTrue(policy.enabled("private|"+ID));
        try{policy.selected.clear();fail();}catch(UnsupportedOperationException expected){}
        try{tag.comicIds.clear();fail();}catch(UnsupportedOperationException expected){}
        try{policy.privateTags.clear();fail();}catch(UnsupportedOperationException expected){}
    }
    @Test public void explicitLocalProviderAndRawFactsStayIndependentOfCallerCollections(){
        List<String> tags=new ArrayList<>(Arrays.asList("line")),raw=new ArrayList<>(Arrays.asList("female:line"));
        TagPolicyRules.Comic comic=new TagPolicyRules.Comic("legacy","eh",tags,raw,true);raw.clear();tags.clear();
        assertEquals(Arrays.asList("female:line"),comic.facts);
        assertEquals("local",TagPolicyRules.provider("pica:1","local"));
    }
    @Test public void listAndTotalBindingLimitsAreIndependent(){
        try{new TagPolicyRules("ALL",Collections.nCopies(4097,"pica|same"),Collections.emptyList(),Collections.emptyList());fail();}catch(IllegalArgumentException expected){}
        List<String> ids=new ArrayList<>();for(int i=0;i<4096;i++)ids.add("local:"+i);
        TagPolicyRules.PrivateTag first=new TagPolicyRules.PrivateTag(ID,"First","MANUAL",ids,Collections.emptyList());
        TagPolicyRules.PrivateTag second=new TagPolicyRules.PrivateTag("pt_22222222222222222222222222222222","Second","MANUAL",Arrays.asList("local:other"),Collections.emptyList());
        try{new TagPolicyRules("ALL",Collections.emptyList(),Collections.emptyList(),Arrays.asList(first,second));fail();}catch(IllegalArgumentException expected){}
    }
    @Test public void duplicatePrivateIdsAndUnknownVersionsDoNotProducePartialPolicies(){
        TagPolicyRules.PrivateTag tag=new TagPolicyRules.PrivateTag(ID,"Mine","MANUAL",Collections.emptyList(),Collections.emptyList());
        try{new TagPolicyRules("ALL",Collections.emptyList(),Collections.emptyList(),Arrays.asList(tag,tag));fail();}catch(IllegalArgumentException expected){}
        try{new TagPolicyRules("FUTURE",Collections.emptyList(),Collections.emptyList(),Collections.emptyList());fail();}catch(IllegalArgumentException expected){}
    }
    @Test public void directoryOrdersGroupsThenFavoriteWorkCountAndKeepsRowsImmutable(){
        List<TagPolicyRules.Comic> catalog=Arrays.asList(new TagPolicyRules.Comic("local:1",null,Arrays.asList("rare","common","common"),null,true),new TagPolicyRules.Comic("local:2",null,Arrays.asList("common"),null,true));
        List<TagPolicyRules.DirectoryRow> rows=TagPolicyRules.legacy().directory(catalog,(provider,raw)->"OTHER",false);
        assertEquals("local|common",rows.get(0).identity);assertEquals(2,rows.get(0).favoriteIds.size());
        try{rows.get(0).favoriteIds.clear();fail();}catch(UnsupportedOperationException expected){}
    }
}
