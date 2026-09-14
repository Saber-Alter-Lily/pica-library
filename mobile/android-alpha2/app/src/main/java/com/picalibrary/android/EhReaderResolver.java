package com.picalibrary.android;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.*;

/**
 * Reader-only E-H resolver.
 *
 * The catalog knows the gallery page count already. Reader pages therefore use stable logical
 * locators and resolve only the gallery batch that contains the page currently being displayed.
 * Gallery image pages are requested with their parent gallery as Referer, matching current
 * E-H clients and normal browser navigation.
 */
final class EhReaderResolver {
    private static final String ORIGIN="https://e-hentai.org";
    private static final String UA="Pica-Library-Android/0.1";
    private static final int DEFAULT_THUMBS_PER_PAGE=20;
    private static final Pattern COMIC_ID=Pattern.compile("^eh:(\\d+):([0-9a-fA-F]{10})$");
    private static final Pattern LOCATOR=Pattern.compile("^ehpage:(\\d+):(eh:\\d+:[0-9a-fA-F]{10})$");
    private static final Pattern PAGE_LINK=Pattern.compile("(?:(?:https?:)?//(?:e-hentai\\.org|exhentai\\.org))?/s/[0-9a-fA-F]+/(\\d+)-(\\d+)",Pattern.CASE_INSENSITIVE);
    private static final Pattern EHVIEWER_IMAGE=Pattern.compile("<img[^>]*src=[\\\"']([^\\\"']+)[\\\"'][^>]*\\sstyle\\s*=",Pattern.CASE_INSENSITIVE);
    private static final Pattern IMAGE_ID_THEN_SRC=Pattern.compile("<img[^>]*id=[\\\"']img[\\\"'][^>]*src=[\\\"']([^\\\"']+)[\\\"']",Pattern.CASE_INSENSITIVE);
    private static final Pattern IMAGE_SRC_THEN_ID=Pattern.compile("<img[^>]*src=[\\\"']([^\\\"']+)[\\\"'][^>]*id=[\\\"']img[\\\"']",Pattern.CASE_INSENSITIVE);

    private final ConcurrentHashMap<String,String> pageUrlCache=new ConcurrentHashMap<>();

    static String locator(String comicId,int position){
        if(!COMIC_ID.matcher(comicId==null?"":comicId).matches()||position<1)throw new IllegalArgumentException("无效的 E-H 阅读页");
        return "ehpage:"+position+":"+comicId;
    }
    static boolean handles(String value){return value!=null&&value.startsWith("ehpage:");}

    HttpURLConnection openImage(String locator) throws Exception {
        Matcher parsed=LOCATOR.matcher(locator==null?"":locator);if(!parsed.matches())throw new IllegalArgumentException("无效的 E-H 阅读页");
        int position=Integer.parseInt(parsed.group(1));String comicId=parsed.group(2);String galleryReferer=galleryUrl(comicId);String pageUrl=resolvePageUrl(comicId,position);
        String html=html(pageUrl,galleryReferer);String imageRaw=parseImageUrl(html);if(imageRaw.isEmpty())throw new IOException("E-H 图片页没有可读取图片");
        URL image=safeHttps(new URL(new URL(pageUrl),decodeHtml(imageRaw)).toString());
        HttpURLConnection c=(HttpURLConnection)image.openConnection();c.setConnectTimeout(8000);c.setReadTimeout(20000);c.setInstanceFollowRedirects(true);c.setRequestProperty("Accept","image/*");c.setRequestProperty("Referer",pageUrl);c.setRequestProperty("User-Agent",UA);c.setUseCaches(false);return c;
    }

    String resolvePageUrl(String comicId,int position) throws Exception {
        String key=comicId+"#"+position;String cached=pageUrlCache.get(key);if(cached!=null&&!cached.isEmpty())return cached;
        Matcher id=COMIC_ID.matcher(comicId==null?"":comicId);if(!id.matches())throw new IllegalArgumentException("无效的 E-H 画廊标识");long gid=Long.parseLong(id.group(1));String token=id.group(2).toLowerCase(Locale.ROOT);
        int by20=(position-1)/DEFAULT_THUMBS_PER_PAGE;int by40=(position-1)/40;
        LinkedHashSet<Integer> candidates=new LinkedHashSet<>();candidates.add(by20);candidates.add(by40);if(by20>0)candidates.add(by20-1);candidates.add(by20+1);
        for(int galleryPage:candidates){loadGalleryBatch(comicId,gid,token,galleryPage);cached=pageUrlCache.get(key);if(cached!=null&&!cached.isEmpty())return cached;}
        throw new IOException("E-H 第 "+position+" 页定位失败");
    }

    private void loadGalleryBatch(String comicId,long gid,String token,int galleryPage) throws Exception {
        if(galleryPage<0)return;String gallery=ORIGIN+"/g/"+gid+"/"+token+"/";String url=gallery+"?p="+galleryPage;String body=html(url,gallery);
        Map<Integer,String> links=parsePageLinks(body,ORIGIN,gid);for(Map.Entry<Integer,String> e:links.entrySet())pageUrlCache.putIfAbsent(comicId+"#"+e.getKey(),e.getValue());
    }

    private static String galleryUrl(String comicId){Matcher id=COMIC_ID.matcher(comicId==null?"":comicId);if(!id.matches())throw new IllegalArgumentException("无效的 E-H 画廊标识");return ORIGIN+"/g/"+id.group(1)+"/"+id.group(2).toLowerCase(Locale.ROOT)+"/";}

    static Map<Integer,String> parsePageLinks(String html,String origin,long expectedGid) throws Exception {
        LinkedHashMap<Integer,String> out=new LinkedHashMap<>();String decoded=decodeHtml(html==null?"":html);Matcher m=PAGE_LINK.matcher(decoded);URL base=new URL(origin);
        while(m.find()){
            long gid;int position;try{gid=Long.parseLong(m.group(1));position=Integer.parseInt(m.group(2));}catch(Exception ignored){continue;}if(gid!=expectedGid||position<1)continue;
            URL absolute=new URL(base,m.group());String host=absolute.getHost()==null?"":absolute.getHost().toLowerCase(Locale.ROOT);if(!"e-hentai.org".equals(host)&&!"exhentai.org".equals(host))continue;out.putIfAbsent(position,absolute.toString());
        }
        return out;
    }

    static String parseImageUrl(String html){
        String body=html==null?"":html;Matcher m=EHVIEWER_IMAGE.matcher(body);if(m.find())return decodeHtml(m.group(1));m=IMAGE_ID_THEN_SRC.matcher(body);if(m.find())return decodeHtml(m.group(1));m=IMAGE_SRC_THEN_ID.matcher(body);if(m.find())return decodeHtml(m.group(1));return "";
    }

    private static String decodeHtml(String s){return s.replace("&amp;","&").replace("&quot;","\"").replace("&#39;","'").replace("&apos;","'").replace("&lt;","<").replace("&gt;",">");}

    private String html(String raw,String referer) throws Exception {
        URL url=safeHttps(raw);String host=url.getHost()==null?"":url.getHost().toLowerCase(Locale.ROOT);if(!"e-hentai.org".equals(host))throw new SecurityException("无效的 E-H 页面地址");
        HttpURLConnection c=(HttpURLConnection)url.openConnection();c.setConnectTimeout(8000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(true);c.setRequestProperty("Accept","text/html,*/*;q=0.8");c.setRequestProperty("Cookie","nw=1");c.setRequestProperty("User-Agent",UA);
        if(referer!=null&&!referer.isEmpty()){URL r=safeHttps(referer);if(!"e-hentai.org".equalsIgnoreCase(r.getHost()))throw new SecurityException("无效的 E-H Referer");c.setRequestProperty("Referer",r.toString());}
        c.setUseCaches(false);
        try{int status=c.getResponseCode();URL end=c.getURL();if(status<200||status>=300)throw new IOException("E-H HTTP "+status);if(end==null||!"e-hentai.org".equalsIgnoreCase(end.getHost()))throw new IOException("E-H 页面发生异常跳转");return new String(read(c.getInputStream(),8*1024*1024),StandardCharsets.UTF_8);}finally{c.disconnect();}
    }

    private static byte[] read(InputStream input,int max) throws Exception {try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))>0){if(out.size()+n>max)throw new IOException("E-H 响应过大");out.write(b,0,n);}return out.toByteArray();}}
    private static URL safeHttps(String raw) throws Exception {URL u=new URL(raw);String host=u.getHost()==null?"":u.getHost().toLowerCase(Locale.ROOT);if(!"https".equalsIgnoreCase(u.getProtocol())||host.isEmpty()||"localhost".equals(host)||host.endsWith(".localhost")||privateIpv4(host)||host.equals("::1")||host.startsWith("fc")||host.startsWith("fd")||host.startsWith("fe8")||host.startsWith("fe9")||host.startsWith("fea")||host.startsWith("feb"))throw new SecurityException("E-H 媒体地址未通过安全校验");return u;}
    private static boolean privateIpv4(String host){String[] p=host.split("\\.");if(p.length!=4)return false;int[] n=new int[4];try{for(int i=0;i<4;i++){n[i]=Integer.parseInt(p[i]);if(n[i]<0||n[i]>255)return true;}}catch(Exception e){return false;}return n[0]==0||n[0]==10||n[0]==127||(n[0]==169&&n[1]==254)||(n[0]==172&&n[1]>=16&&n[1]<=31)||(n[0]==192&&n[1]==168)||(n[0]==100&&n[1]>=64&&n[1]<=127)||n[0]>=224;}
}
