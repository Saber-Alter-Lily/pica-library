package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.*;
import org.json.*;

/** Public, account-free E-Hentai client. ExH/account features are deliberately not part of this contract. */
final class EhClient {
    static final String ORIGIN="https://e-hentai.org",API="https://api.e-hentai.org/api.php";
    private static final String UA="Pica-Library-Android/0.1";
    private static final long SEARCH_INTERVAL_MS=3100L;
    private static long lastSearchAt;
    private final Context context;
    EhClient(Context context){this.context=context.getApplicationContext();}

    static final class Comic {
        final String id,remoteId,title,alternateTitle,author,circle,coverUrl,category,uploader,completionStatus;
        final List<String> tags,rawTags,authors;
        final int pagesCount;final double rating;final long posted,filesize;
        Comic(String id,String remoteId,String title,String alternateTitle,String author,String circle,String coverUrl,String category,String uploader,String completionStatus,List<String> tags,List<String> rawTags,List<String> authors,int pagesCount,double rating,long posted,long filesize){this.id=id;this.remoteId=remoteId;this.title=title;this.alternateTitle=alternateTitle;this.author=author;this.circle=circle;this.coverUrl=coverUrl;this.category=category;this.uploader=uploader;this.completionStatus=completionStatus;this.tags=tags;this.rawTags=rawTags;this.authors=authors;this.pagesCount=pagesCount;this.rating=rating;this.posted=posted;this.filesize=filesize;}
    }
    static final class Episode {final String id,title;final int order;Episode(String id,String title,int order){this.id=id;this.title=title;this.order=order;}}
    static final class Page {final String id,pageUrl;final int position;Page(String id,String pageUrl,int position){this.id=id;this.pageUrl=pageUrl;this.position=position;}}

    static boolean isEhId(String value){return value!=null&&value.matches("^eh:\\d+:[0-9a-fA-F]{10}$");}
    private static String[] parseId(String value){if(!isEhId(value))throw new IllegalArgumentException("无效的 E-H 画廊标识");String[] p=value.split(":",3);return new String[]{p[1],p[2].toLowerCase(Locale.ROOT)};}
    private static String decodeHtml(String s){return s.replace("&amp;","&").replace("&quot;","\"").replace("&#39;","'").replace("&apos;","'").replace("&lt;","<").replace("&gt;",">");}
    private static String tagValue(String raw){int i=raw.indexOf(':');return (i>0?raw.substring(i+1):raw).trim();}
    private static String tagNamespace(String raw){int i=raw.indexOf(':');return i>0?raw.substring(0,i).toLowerCase(Locale.ROOT):"";}
    private static void addUnique(List<String> out,String value){if(value!=null){value=value.trim();if(!value.isEmpty()&&!out.contains(value))out.add(value);}}

    private static synchronized void paceSearch() throws InterruptedException {long wait=SEARCH_INTERVAL_MS-(System.currentTimeMillis()-lastSearchAt);if(wait>0)Thread.sleep(wait);lastSearchAt=System.currentTimeMillis();}
    private HttpURLConnection open(String url,String method,String accept) throws Exception {URL u=new URL(url);if(!"https".equalsIgnoreCase(u.getProtocol()))throw new SecurityException("E-H 仅允许 HTTPS");HttpURLConnection c=(HttpURLConnection)u.openConnection();c.setConnectTimeout(8000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(true);c.setRequestMethod(method);c.setRequestProperty("Accept",accept);c.setRequestProperty("User-Agent",UA);c.setUseCaches(false);return c;}
    private static byte[] read(InputStream in,int max) throws Exception {try(InputStream input=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=input.read(b))>0){if(out.size()+n>max)throw new IOException("E-H 响应过大");out.write(b,0,n);}return out.toByteArray();}}
    private String text(String url) throws Exception {HttpURLConnection c=open(url,"GET","text/html,*/*;q=0.8");try{int status=c.getResponseCode();if(status<200||status>=300)throw new IOException("E-H HTTP "+status);return new String(read(c.getInputStream(),8*1024*1024),StandardCharsets.UTF_8);}finally{c.disconnect();}}
    private JSONObject postJson(JSONObject body) throws Exception {HttpURLConnection c=open(API,"POST","application/json");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");try(OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}try{int status=c.getResponseCode();if(status<200||status>=300)throw new IOException("E-H API HTTP "+status);return new JSONObject(new String(read(c.getInputStream(),4*1024*1024),StandardCharsets.UTF_8));}finally{c.disconnect();}}

    private List<Comic> gdata(List<String[]> refs) throws Exception {List<Comic> out=new ArrayList<>();for(int offset=0;offset<refs.size();offset+=25){JSONArray ids=new JSONArray();for(int i=offset;i<Math.min(offset+25,refs.size());i++){String[] ref=refs.get(i);JSONArray pair=new JSONArray();pair.put(Long.parseLong(ref[0]));pair.put(ref[1]);ids.put(pair);}JSONObject request=new JSONObject();request.put("method","gdata");request.put("gidlist",ids);request.put("namespace",1);JSONArray rows=postJson(request).optJSONArray("gmetadata");if(rows==null)throw new IOException("E-H 元数据响应格式异常");for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(row!=null&&!row.has("error"))out.add(parseComic(row));}}return out;}
    private Comic parseComic(JSONObject row){long gid=row.optLong("gid");String token=row.optString("token","").toLowerCase(Locale.ROOT);String id="eh:"+gid+":"+token;JSONArray arr=row.optJSONArray("tags");List<String> raw=new ArrayList<>(),tags=new ArrayList<>(),authors=new ArrayList<>(),groups=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){String value=arr.optString(i,"");addUnique(raw,value);addUnique(tags,tagValue(value));String ns=tagNamespace(value);if("artist".equals(ns))addUnique(authors,tagValue(value));if("group".equals(ns))addUnique(groups,tagValue(value));}String uploader=row.optString("uploader","");String author=!authors.isEmpty()?authors.get(0):!groups.isEmpty()?groups.get(0):uploader;double rating;try{rating=Double.parseDouble(row.optString("rating","NaN"));}catch(Exception e){rating=Double.NaN;}return new Comic(id,gid+":"+token,row.optString("title","E-H Gallery "+gid),row.optString("title_jpn",""),author,groups.isEmpty()?"":groups.get(0),row.optString("thumb",""),row.optString("category",""),uploader,"UNKNOWN",tags,raw,authors,Math.max(0,row.optInt("filecount",0)),rating,row.optLong("posted",0),row.optLong("filesize",0));}

    List<Comic> search(String query) throws Exception {paceSearch();String encoded=URLEncoder.encode(query==null?"":query.trim(),"UTF-8").replace("+","%20");String html=text(ORIGIN+"/?f_search="+encoded);Pattern p=Pattern.compile("(?:https?://e-hentai\\.org)?/g/(\\d+)/([0-9a-fA-F]{10})/");Matcher m=p.matcher(html);LinkedHashMap<String,String[]> refs=new LinkedHashMap<>();while(m.find()&&refs.size()<50){String key=m.group(1)+":"+m.group(2).toLowerCase(Locale.ROOT);refs.put(key,new String[]{m.group(1),m.group(2).toLowerCase(Locale.ROOT)});}return refs.isEmpty()?Collections.emptyList():gdata(new ArrayList<>(refs.values()));}
    Comic comic(String comicId) throws Exception {String[] ref=parseId(comicId);List<Comic> values=gdata(Collections.singletonList(ref));if(values.isEmpty())throw new IOException("E-H 未返回画廊元数据");return values.get(0);}
    List<Episode> episodes(String comicId) throws Exception {Comic comic=comic(comicId);String[] ref=parseId(comicId);return Collections.singletonList(new Episode("eh-"+ref[0],comic.title,1));}
    List<Page> pages(String comicId) throws Exception {Comic comic=comic(comicId);String[] ref=parseId(comicId);long gid=Long.parseLong(ref[0]);LinkedHashSet<String> urls=new LinkedHashSet<>();Pattern p=Pattern.compile("(?:https?://e-hentai\\.org)?/s/[0-9a-fA-F]+/"+gid+"-\\d+");for(int page=0;page<100;page++){String html=text(ORIGIN+"/g/"+gid+"/"+ref[1]+"/?p="+page);Matcher m=p.matcher(html);int before=urls.size();while(m.find())urls.add(new URL(new URL(ORIGIN),decodeHtml(m.group())).toString());if((comic.pagesCount>0&&urls.size()>=comic.pagesCount)||urls.size()==before)break;Thread.sleep(100);}if(comic.pagesCount>0&&urls.size()<comic.pagesCount)throw new IOException("E-H 页列表不完整（"+urls.size()+"/"+comic.pagesCount+"）");List<Page> out=new ArrayList<>();int pos=0;for(String url:urls){pos++;out.add(new Page("eh-"+gid+"-"+pos,url,pos));if(comic.pagesCount>0&&pos>=comic.pagesCount)break;}return out;}
    HttpURLConnection image(String pageUrl) throws Exception {URL page=new URL(pageUrl);if(!"https".equalsIgnoreCase(page.getProtocol())||!"e-hentai.org".equalsIgnoreCase(page.getHost())||!page.getPath().matches("^/s/[0-9a-fA-F]+/\\d+-\\d+$"))throw new SecurityException("无效的 E-H 图片页");String html=text(page.toString());Matcher first=Pattern.compile("<img[^>]+id=[\"']img[\"'][^>]+src=[\"']([^\"']+)[\"']",Pattern.CASE_INSENSITIVE).matcher(html);Matcher second=Pattern.compile("<img[^>]+src=[\"']([^\"']+)[\"'][^>]+id=[\"']img[\"']",Pattern.CASE_INSENSITIVE).matcher(html);String imageUrl=first.find()?first.group(1):second.find()?second.group(1):"";if(imageUrl.isEmpty())throw new IOException("E-H 图片页没有可读取图片");URL image=new URL(decodeHtml(imageUrl));if(!"https".equalsIgnoreCase(image.getProtocol()))throw new SecurityException("E-H 图片地址不是 HTTPS");HttpURLConnection c=(HttpURLConnection)image.openConnection();c.setConnectTimeout(8000);c.setReadTimeout(20000);c.setInstanceFollowRedirects(true);c.setRequestProperty("Accept","image/*");c.setRequestProperty("Referer",page.toString());c.setRequestProperty("User-Agent",UA);c.setUseCaches(false);return c;}
}
