package com.picalibrary.android;

import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;

public class EhSemanticArchitectureTest {
    @Test public void canonicalTagKeepsNamespace(){EhSemanticStore.Tag tag=new EhSemanticStore.Tag("Female","Big   Breasts");assertEquals("female",tag.namespace);assertEquals("big breasts",tag.value);assertEquals("female:big breasts",tag.canonical);}

    @Test public void chinesePresentationDoesNotChangeCanonicalQuery() throws Exception {EhOnlineFilterSpec spec=new EhOnlineFilterSpec();spec.includeTags.add("female:big breasts");spec.includeTags.add("character:tatsumaki");String q=spec.canonicalQuery();assertTrue(q.contains("female:\"big breasts$\""));assertTrue(q.contains("character:\"tatsumaki$\""));assertFalse(q.contains("巨乳"));}

    @Test public void languageFilterIsExactCanonicalTag() throws Exception {EhOnlineFilterSpec spec=new EhOnlineFilterSpec();spec.language="chinese";assertTrue(spec.canonicalQuery().contains("language:\"chinese$\""));}

    @Test public void categoryMaskUsesEhExcludedCategoriesContract() throws Exception {EhOnlineFilterSpec spec=new EhOnlineFilterSpec();spec.includeCategories=EhOnlineFilterSpec.MANGA|EhOnlineFilterSpec.DOUJINSHI;String url=spec.buildUrl("eh");int expected=(~spec.includeCategories)&EhOnlineFilterSpec.ALL;assertTrue(url.contains("f_cats="+expected));}

    @Test public void browseModesHaveNativeRoutes() throws Exception {EhOnlineFilterSpec spec=new EhOnlineFilterSpec();spec.mode=EhOnlineFilterSpec.Mode.POPULAR;assertEquals("https://e-hentai.org/popular",spec.buildUrl("eh"));spec.mode=EhOnlineFilterSpec.Mode.WATCHED;assertTrue(spec.buildUrl("eh").startsWith("https://e-hentai.org/watched"));spec.mode=EhOnlineFilterSpec.Mode.TOPLIST;spec.toplist="13";assertEquals("https://e-hentai.org/toplist.php?tl=13",spec.buildUrl("eh"));}

    @Test public void parsesUserRenamedFavoriteCategories(){String html="<input type='text' name='favorite_0' value='最喜欢'>"+"<input value='待看' name='favorite_1' type='text'>";List<String> names=EhClient.parseFavoriteCategoryNames(html);assertEquals("最喜欢",names.get(0));assertEquals("待看",names.get(1));assertEquals(10,names.size());}

    @Test public void stableChineseNamespaceAndCategoryLabels(){assertEquals("女性",EhTagTranslationStore.namespaceLabel("female"));assertEquals("原作",EhTagTranslationStore.namespaceLabel("parody"));assertEquals("漫画",EhTagTranslationStore.categoryLabel("Manga"));assertEquals("画师 CG",EhTagTranslationStore.categoryLabel("Artist CG"));}
}
