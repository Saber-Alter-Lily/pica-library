package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.regex.*;

/** Reader-only E-H resolver with shared session, lazy page discovery and safe diagnostics. */
final class EhReaderResolver {
    private static final String ORIGIN="https://e-hentai.org";
    private static final int DEFAULT_THUMBS_PER_PAGE=20;
    private static final Pattern COMIC_ID=Pattern.compile("^eh:(\\d+):([0-9a-fA-F]{10})$");
    private static final Pattern LOCATOR=Pattern.compile("^ehpage:(\\d+):(eh:\\d+:[0-9a-fA-F]{10})$");
    private static final Pattern PAGE_LINK=Pattern.compile("(?:(?:https?:)?//(?:e-hentai\\.org|exhentai\\.org))?/s/[0-9a-fA-F]+/(\\d+)-(\\d+)",Pattern.CASE_INSENSITIVE);
    private static final Pattern IMAGE_ID_THEN_SRC=Pattern.compile("<img[^>]*id=[\\\"']img[\\\"'][^>]*src=[\\\"']([^\\\"']+)[\\\"']",Pattern.CASE_INSENSITIVE);
    private static final Pattern IMAGE_SRC_THEN_ID=Pattern.compile("<img[^>]*src=[\\\"']([^\\\"']+)[\\\"'][^>]*id=[\\\"']img[\\\"']",Pattern.CASE_INSENSITIVE);
    private static final Pattern EHVIEWER_IMAGE=Pattern.compile("<img[^>]*src=[\\\"']([^\\\"']+)[\\\"'][^>]*\\sstyle\\s*=",Pattern.CASE_INSENSITIVE);

    private final EhHttpSession session;
    private final ConcurrentHashMap<String,String> pageUrlCache=new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String,Object> batchLocks=new ConcurrentHashMap<>();
    private final Semaphore pageNetwork=new Semaphore(2,true);

    EhReaderResolver(Context context){session=new EhHttpSession(context);}

    static String locator(String comicId,int position){if(!COMIC_ID.matcher(comicId==null?"":comicId).matches()||position<1)throw new IllegalArgumentException("无效的 E-H 阅读页");return "ehpage:"+position+":"+comicId;}
    static boolean handles(String value){return value!=null&&value.startsWith("ehpage:");}

    HttpURLConnection openImage(String locator) throws Exception {
        Locator value=parseLocator(locator);String pageUrl=resolvePageUrl(value.comicId,value.position);String gallery=galleryUrl(value.comicId,0);
        String html=readPage(pageUrl,gallery);String imageRaw=parseImageUrl(html);if(imageRaw.isEmpty())throw new IOException("E-H 图片页没有可读取图片");
        URL image=EhHttpSession.safePublicHttps(new URL(new URL(pageUrl),decodeHtml(imageRaw)).toString());
        return session.openMedia(image.toString(),pageUrl);
    }

    String diagnose(String locator){
        ArrayList<String> rows=new ArrayList<>();try{
            Locator value=parseLocator(locator);Matcher id=COMIC_ID.matcher(value.comicId);id.matches();long gid=Long.parseLong(id.group(1));String token=id.group(2).toLowerCase(Locale.ROOT);rows.add("1 页面标识：PASS");rows.add("   E-H 会话："+(session.hasIdentity()?"已登录":"公共")+" · Cookie "+session.cookieCount("e-hentai.org")+" 项");
            String pageUrl="";Exception locatorFailure=null;LinkedHashSet<Integer> candidates=galleryCandidates(value.position);for(int galleryPage:candidates){String gallery=ORIGIN+"/g/"+gid+"/"+token+"/?p="+galleryPage;try{Probe galleryProbe=probeText(gallery,galleryBase(gid,token));rows.add("2 Gallery：HTTP "+galleryProbe.status+" · "+safeType(galleryProbe.contentType));if(galleryProbe.status!=200)continue;Map<Integer,String> links=parsePageLinks(galleryProbe.body,ORIGIN,gid);pageUrl=links.get(value.position);if(pageUrl!=null&&!pageUrl.isEmpty())break;}catch(Exception e){locatorFailure=e;}}
            if(pageUrl==null||pageUrl.isEmpty()){rows.add("3 /s 定位：FAIL"+(locatorFailure==null?"":" · "+safeError(locatorFailure)));return join(rows);}
            rows.add("3 /s 定位：PASS");Probe pageProbe=probeText(pageUrl,galleryBase(gid,token));rows.add("4 /s 页面：HTTP "+pageProbe.status+" · "+safeType(pageProbe.contentType));if(pageProbe.status!=200)return join(rows);
            String imageRaw=parseImageUrl(pageProbe.body);if(imageRaw.isEmpty()){rows.add("5 正文图片：FAIL · 未找到正文 img");return join(rows);}URL image=EhHttpSession.safePublicHttps(new URL(new URL(pageUrl),decodeHtml(imageRaw)).toString());rows.add("5 正文图片：PASS · "+image.getHost());
            HttpURLConnection c=session.openMedia(image.toString(),pageUrl);try{int status=c.getResponseCode();String type=c.getContentType();rows.add("6 图片节点：HTTP "+status+" · "+safeType(type));if(status==200){byte[] head=readHead(c.getInputStream(),16);rows.add("7 图片数据："+(looksLikeImage(head,type)?"PASS":"FAIL · 响应不像图片"));}}finally{c.disconnect();}
        }catch(Exception e){rows.add("FAIL · "+safeError(e));}return join(rows);
    }

    String resolvePageUrl(String comicId,int position) throws Exception {
        String key=comicId+"#"+position;String cached=pageUrlCache.get(key);if(cached!=null&&!cached.isEmpty())return cached;
        Matcher id=COMIC_ID.matcher(comicId==null?"":comicId);if(!id.matches())throw new IllegalArgumentException("无效的 E-H 画廊标识");long gid=Long.parseLong(id.group(1));String token=id.group(2).toLowerCase(Locale.ROOT);
        for(int galleryPage:galleryCandidates(position)){loadGalleryBatch(comicId,gid,token,galleryPage);cached=pageUrlCache.get(key);if(cached!=null&&!cached.isEmpty())return cached;}
        throw new IOException("E-H 第 "+position+" 页定位失败");
    }

    private static LinkedHashSet<Integer> galleryCandidates(int position){int by20=(position-1)/DEFAULT_THUMBS_PER_PAGE,by40=(position-1)/40;LinkedHashSet<Integer> out=new LinkedHashSet<>();out.add(by20);out.add(by40);if(by20>0)out.add(by20-1);out.add(by20+1);return out;}
    private void loadGalleryBatch(String comicId,long gid,String token,int galleryPage) throws Exception {
        if(galleryPage<0)return;String lockKey=comicId+"@"+galleryPage;Object lock=batchLocks.computeIfAbsent(lockKey,k->new Object());synchronized(lock){String sentinel=comicId+"#"+(galleryPage*DEFAULT_THUMBS_PER_PAGE+1);if(pageUrlCache.containsKey(sentinel))return;String url=ORIGIN+"/g/"+gid+"/"+token+"/?p="+galleryPage;String body=readPage(url,galleryBase(gid,token));Map<Integer,String> links=parsePageLinks(body,ORIGIN,gid);if(links.isEmpty())throw new IOException("E-H Gallery 没有找到图片入口");for(Map.Entry<Integer,String> e:links.entrySet())pageUrlCache.putIfAbsent(comicId+"#"+e.getKey(),e.getValue());}}

    static Map<Integer,String> parsePageLinks(String html,String origin,long expectedGid) throws Exception {
        LinkedHashMap<Integer,String> out=new LinkedHashMap<>();String decoded=decodeHtml(html==null?"":html);Matcher m=PAGE_LINK.matcher(decoded);URL base=new URL(origin);
        while(m.find()){long gid;int position;try{gid=Long.parseLong(m.group(1));position=Integer.parseInt(m.group(2));}catch(Exception ignored){continue;}if(gid!=expectedGid||position<1)continue;URL absolute=new URL(base,m.group());String host=absolute.getHost()==null?"":absolute.getHost().toLowerCase(Locale.ROOT);if(!"e-hentai.org".equals(host)&&!"exhentai.org".equals(host))continue;out.putIfAbsent(position,absolute.toString());}return out;
    }

    static String parseImageUrl(String html){String body=html==null?"":html;Matcher m=IMAGE_ID_THEN_SRC.matcher(body);if(m.find())return decodeHtml(m.group(1));m=IMAGE_SRC_THEN_ID.matcher(body);if(m.find())return decodeHtml(m.group(1));m=EHVIEWER_IMAGE.matcher(body);if(m.find())return decodeHtml(m.group(1));return "";}

    private String readPage(String raw,String referer) throws Exception {pageNetwork.acquire();try{HttpURLConnection c=session.openPage(raw,referer);try{int status=c.getResponseCode();session.absorbResponseCookies(c);URL end=c.getURL();if(status<200||status>=300)throw new IOException("E-H HTTP "+status);if(end==null||!EhHttpSession.isEhFamily(end.getHost()))throw new IOException("E-H 页面发生异常跳转");return new String(read(c.getInputStream(),8*1024*1024),StandardCharsets.UTF_8);}finally{c.disconnect();}}finally{pageNetwork.release();}}
    private Probe probeText(String raw,String referer) throws Exception {HttpURLConnection c=session.openPage(raw,referer);try{int status=c.getResponseCode();session.absorbResponseCookies(c);String type=c.getContentType();String body="";InputStream stream=status>=400?c.getErrorStream():c.getInputStream();if(stream!=null)body=new String(read(stream,8*1024*1024),StandardCharsets.UTF_8);return new Probe(status,type,body);}finally{c.disconnect();}}

    private static String galleryBase(long gid,String token){return ORIGIN+"/g/"+gid+"/"+token+"/";}
    private static String galleryUrl(String comicId,int page){Matcher m=COMIC_ID.matcher(comicId==null?"":comicId);if(!m.matches())throw new IllegalArgumentException("无效的 E-H 画廊标识");return ORIGIN+"/g/"+m.group(1)+"/"+m.group(2).toLowerCase(Locale.ROOT)+"/"+(page>0?"?p="+page:"");}
    private static Locator parseLocator(String raw){Matcher parsed=LOCATOR.matcher(raw==null?"":raw);if(!parsed.matches())throw new IllegalArgumentException("无效的 E-H 阅读页");return new Locator(Integer.parseInt(parsed.group(1)),parsed.group(2));}
    private static String decodeHtml(String s){return s.replace("&amp;","&").replace("&quot;","\"").replace("&#39;","'").replace("&apos;","'").replace("&lt;","<").replace("&gt;",">");}
    private static byte[] read(InputStream input,int max) throws Exception {try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=input.read(b))>0){if(out.size()+n>max)throw new IOException("E-H 响应过大");out.write(b,0,n);}return out.toByteArray();}}
    private static byte[] readHead(InputStream input,int max) throws Exception {try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[Math.max(1,max)];int n=in.read(b);if(n>0)out.write(b,0,n);return out.toByteArray();}}
    private static boolean looksLikeImage(byte[] b,String type){String t=type==null?"":type.toLowerCase(Locale.ROOT);if(t.startsWith("image/"))return true;if(b==null||b.length<4)return false;return (b[0]&255)==0xff&&(b[1]&255)==0xd8||b[0]==(byte)0x89&&b[1]=='P'&&b[2]=='N'&&b[3]=='G'||b[0]=='G'&&b[1]=='I'&&b[2]=='F'||b.length>=12&&b[0]=='R'&&b[1]=='I'&&b[2]=='F'&&b[3]=='F';}
    private static String safeType(String value){return value==null||value.trim().isEmpty()?"无 Content-Type":value.split(";",2)[0].trim();}
    private static String safeError(Throwable e){String v=e==null||e.getMessage()==null?"":e.getMessage().trim();if(v.isEmpty())return "未知错误";return v.length()>72?v.substring(0,72):v;}
    private static String join(List<String> rows){return String.join("\n",rows);}

    private static final class Locator {final int position;final String comicId;Locator(int position,String comicId){this.position=position;this.comicId=comicId;}}
    private static final class Probe {final int status;final String contentType,body;Probe(int status,String contentType,String body){this.status=status;this.contentType=contentType;this.body=body;}}
}
