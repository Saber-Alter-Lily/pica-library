package com.picalibrary.android;

import java.math.BigInteger;
import java.util.*;
import org.json.*;

/** Pinned Suwayomi 2.4 subset. Parses facts, never executes extensions or arbitrary GraphQL. */
final class HostProtocol {
    static final class Source {final String id,name,language;Source(String id,String name,String language){this.id=id;this.name=name;this.language=language;}}
    static final class Sources {final List<Source> rows;final boolean next;Sources(List<Source> rows,boolean next){this.rows=Collections.unmodifiableList(rows);this.next=next;}}
    static final class Manga {final int id;final String source,url,title;final boolean inLibrary;Manga(JSONObject row)throws Exception{id=integer(row.get("id"),false);source=sourceId(row.get("sourceId"));url=text(row.get("url"),2048);title=text(row.get("title"),500);inLibrary=bool(row.get("inLibrary"));}}
    static final class Chapter {final int id,mangaId,sourceOrder,pageCount;final String url,title;final double number;Chapter(JSONObject row)throws Exception{id=integer(row.get("id"),false);mangaId=integer(row.get("mangaId"),false);sourceOrder=integer(row.get("sourceOrder"),true);pageCount=chapterPageCount(row.get("pageCount"));url=text(row.get("url"),2048);title=text(row.get("name"),500);Object n=row.get("chapterNumber");if(!(n instanceof Number)||!Double.isFinite(((Number)n).doubleValue()))throw invalid();number=((Number)n).doubleValue();}}
    static final class ChapterPage {final List<Chapter> rows;final int total;final boolean next;ChapterPage(List<Chapter> rows,int total,boolean next){this.rows=Collections.unmodifiableList(rows);this.total=total;this.next=next;}}
    static final class Search {final List<Manga> rows;final boolean next;Search(List<Manga> rows,boolean next){this.rows=Collections.unmodifiableList(rows);this.next=next;}}
    private HostProtocol(){}
    static JSONObject data(JSONObject root)throws Exception {if(root.has("errors")&&(!(root.get("errors") instanceof JSONArray)||root.getJSONArray("errors").length()!=0))throw invalid();return root.getJSONObject("data");}
    static void server(JSONObject root)throws Exception {JSONObject row=data(root).getJSONObject("aboutServer");String name=text(row.get("name"),100),version=text(row.get("version"),60);if(!name.matches("(?i)suwayomi(?:[ -]server)?")||!version.matches("v?2\\.4\\.[0-9]{1,9}"))throw new IllegalArgumentException("SOURCE_HOST_UNSUPPORTED");}
    static String sourceId(Object value) {if(!(value instanceof String)||!((String)value).matches("0|-?[1-9][0-9]{0,18}"))throw invalid();BigInteger n=new BigInteger((String)value);if(n.compareTo(BigInteger.valueOf(Long.MIN_VALUE))<0||n.compareTo(BigInteger.valueOf(Long.MAX_VALUE))>0)throw invalid();return (String)value;}
    static int integer(Object value,boolean zero) {if(!(value instanceof Number))throw invalid();double n=((Number)value).doubleValue();if(!Double.isFinite(n)||n!=Math.floor(n)||n<(zero?0:1)||n>Integer.MAX_VALUE)throw invalid();return (int)n;}
    // Only the pinned upstream -1 sentinel means unknown metadata, never a ready page list.
    private static int chapterPageCount(Object value) {if(value instanceof Number&&((Number)value).doubleValue()==-1)return -1;int count=integer(value,true);if(count>10000)throw invalid();return count;}
    static boolean bool(Object value) {if(!(value instanceof Boolean))throw invalid();return (Boolean)value;}
    static String text(Object value,int max) {if(!(value instanceof String)||((String)value).trim().isEmpty()||((String)value).length()>max||((String)value).matches("(?s).*[\\x00-\\x1f\\x7f].*")||!unicode((String)value))throw invalid();return (String)value;}
    static boolean unicode(String value){for(int i=0;i<value.length();i++){char c=value.charAt(i);if(Character.isHighSurrogate(c)){if(i+1>=value.length()||!Character.isLowSurrogate(value.charAt(++i)))return false;}else if(Character.isLowSurrogate(c))return false;}return true;}
    static Sources sources(JSONObject root)throws Exception {
        JSONObject source=data(root).getJSONObject("sources"),page=source.getJSONObject("pageInfo");JSONArray rows=source.getJSONArray("nodes");if(rows.length()>25)throw invalid();integer(source.get("totalCount"),true);bool(page.get("hasPreviousPage"));boolean next=bool(page.get("hasNextPage"));Set<String> seen=new HashSet<>();List<Source> out=new ArrayList<>();
        for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);String id=sourceId(row.get("id"));if(!seen.add(id))throw invalid();bool(row.get("supportsLatest"));out.add(new Source(id,text(row.get("name"),200),text(row.get("lang"),32)));}return new Sources(out,next);
    }
    static Search search(JSONObject root,String selected)throws Exception {JSONObject value=data(root).getJSONObject("fetchSourceManga");JSONArray rows=value.getJSONArray("mangas");if(rows.length()>100)throw invalid();List<Manga> out=new ArrayList<>();Set<Integer> ids=new HashSet<>();Set<String> urls=new HashSet<>();for(int i=0;i<rows.length();i++){Manga row=new Manga(rows.getJSONObject(i));if(!selected.equals(row.source)||!ids.add(row.id)||!urls.add(row.url))throw invalid();out.add(row);}return new Search(out,bool(value.get("hasNextPage")));}
    static Manga manga(JSONObject root,boolean prepared)throws Exception {
        JSONObject data=data(root);
        return new Manga(prepared?data.getJSONObject("fetchMangaAndChapters").getJSONObject("manga"):data.getJSONObject("manga"));
    }
    /** Fixed upstream top-level chapters(condition:mangaId,first,offset); no arbitrary GraphQL. */
    static ChapterPage chapterPage(JSONObject root,int mangaId,int first,int offset)throws Exception {
        if(mangaId<1||first!=500||offset<0||offset>5000||offset%500!=0)throw invalid();
        JSONObject body=data(root).getJSONObject("chapters"),meta=body.getJSONObject("pageInfo");
        int total=integer(body.get("totalCount"),true);
        if(total>5000)throw new IllegalArgumentException("SOURCE_HOST_TOO_LARGE");
        JSONArray rows=body.getJSONArray("nodes");
        if(rows.length()>first||offset+rows.length()>total||rows.length()!=Math.min(first,Math.max(0,total-offset)))throw invalid();
        boolean next=bool(meta.get("hasNextPage"));
        if(next!=(offset+rows.length()<total))throw invalid();
        List<Chapter> result=new ArrayList<>();Set<Integer> ids=new HashSet<>();Set<String> urls=new HashSet<>();
        for(int i=0;i<rows.length();i++){
            Chapter chapter=new Chapter(rows.getJSONObject(i));
            if(chapter.mangaId!=mangaId||!ids.add(chapter.id)||!urls.add(chapter.url))throw invalid();
            result.add(chapter);
        }
        return new ChapterPage(result,total,next);
    }
    static Chapter chapter(JSONObject root)throws Exception {return new Chapter(data(root).getJSONObject("chapter"));}
    static void same(Chapter expected,Chapter actual) {if(expected.id!=actual.id||expected.mangaId!=actual.mangaId||expected.sourceOrder!=actual.sourceOrder||!expected.url.equals(actual.url))throw new IllegalArgumentException("SOURCE_HOST_STALE");}
    static Chapter pages(JSONObject root,Chapter expected)throws Exception {JSONObject body=data(root).getJSONObject("fetchChapterPages");Chapter actual=new Chapter(body.getJSONObject("chapter"));same(expected,actual);JSONArray paths=body.getJSONArray("pages");if(actual.pageCount<1||paths.length()!=actual.pageCount||paths.length()<1||paths.length()>10000)throw invalid();for(int i=0;i<paths.length();i++)if(!("/api/v1/manga/"+actual.mangaId+"/chapter/"+actual.sourceOrder+"/page/"+i).equals(paths.get(i)))throw invalid();return actual;}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("SOURCE_HOST_PROTOCOL");}
}
