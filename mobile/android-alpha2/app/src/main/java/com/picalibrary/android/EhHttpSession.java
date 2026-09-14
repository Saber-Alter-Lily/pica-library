package com.picalibrary.android;

import android.content.Context;
import android.webkit.WebSettings;
import java.io.*;
import java.net.*;
import java.util.*;

/** Shared browser-like network session for E-H pages and media. Never exposes cookie values. */
final class EhHttpSession {
    private static final String FALLBACK_UA="Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
    private static final String HTML_ACCEPT="text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";
    private static final String IMAGE_ACCEPT="image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
    private static final String ACCEPT_LANGUAGE="en-US,en;q=0.9";
    private final Context context;
    private final String userAgent;

    EhHttpSession(Context context){this.context=context.getApplicationContext();String ua="";try{ua=WebSettings.getDefaultUserAgent(this.context);}catch(Throwable ignored){}userAgent=ua==null||ua.trim().isEmpty()?FALLBACK_UA:ua;}

    HttpURLConnection openPage(String raw,String referer) throws Exception {return open(raw,"GET",HTML_ACCEPT,referer,true);}
    HttpURLConnection openMedia(String raw,String referer) throws Exception {return open(raw,"GET",IMAGE_ACCEPT,referer,false);}

    private HttpURLConnection open(String raw,String method,String accept,String referer,boolean page) throws Exception {
        URL url=safePublicHttps(raw);HttpURLConnection c=(HttpURLConnection)url.openConnection();c.setConnectTimeout(10000);c.setReadTimeout(page?15000:25000);c.setInstanceFollowRedirects(true);c.setRequestMethod(method);c.setRequestProperty("User-Agent",userAgent);c.setRequestProperty("Accept",accept);c.setRequestProperty("Accept-Language",ACCEPT_LANGUAGE);c.setRequestProperty("Cache-Control","no-cache");c.setRequestProperty("Pragma","no-cache");if(referer!=null&&!referer.trim().isEmpty())c.setRequestProperty("Referer",referer);String cookie=cookieHeader(url.getHost());if(!cookie.isEmpty())c.setRequestProperty("Cookie",cookie);c.setUseCaches(false);return c;
    }

    String cookieHeader(String host){LinkedHashMap<String,String> values=parseCookies(EhAccountStore.cookieJar(context,host));String h=host==null?"":host.toLowerCase(Locale.ROOT);if(isGalleryHost(h)){EhAccountStore.Session s=EhAccountStore.load(context);values.put("nw","1");if(s.configured()){values.put("ipb_member_id",s.memberId);values.put("ipb_pass_hash",s.passHash);}if(!s.igneous.isEmpty())values.put("igneous",s.igneous);if(!s.cfClearance.isEmpty())values.put("cf_clearance",s.cfClearance);}return joinCookies(values);}
    int cookieCount(String host){return parseCookies(cookieHeader(host)).size();}
    boolean hasIdentity(){return EhAccountStore.load(context).configured();}

    void absorbResponseCookies(HttpURLConnection c){if(c==null)return;try{URL url=c.getURL();String host=url==null?"":url.getHost();if(!isEhFamily(host))return;LinkedHashMap<String,String> values=parseCookies(EhAccountStore.cookieJar(context,host));Map<String,List<String>> headers=c.getHeaderFields();if(headers!=null)for(Map.Entry<String,List<String>> entry:headers.entrySet()){if(entry.getKey()==null||!"set-cookie".equalsIgnoreCase(entry.getKey())||entry.getValue()==null)continue;for(String raw:entry.getValue()){if(raw==null)continue;String first=raw.split(";",2)[0].trim();int at=first.indexOf('=');if(at<=0)continue;String name=first.substring(0,at).trim(),value=first.substring(at+1).trim();if(name.isEmpty())continue;if(value.isEmpty())values.remove(name);else values.put(name,value);}}EhAccountStore.saveCookieJar(context,host,joinCookies(values));}catch(Exception ignored){}
    }

    static LinkedHashMap<String,String> parseCookies(String raw){LinkedHashMap<String,String> out=new LinkedHashMap<>();if(raw==null)return out;for(String part:raw.split(";")){String item=part.trim();int at=item.indexOf('=');if(at<=0)continue;String name=item.substring(0,at).trim(),value=item.substring(at+1).trim();if(!name.isEmpty()&&!value.isEmpty()&&!containsCtl(name)&&!containsCtl(value))out.put(name,value);}return out;}
    static String joinCookies(Map<String,String> values){StringBuilder out=new StringBuilder();for(Map.Entry<String,String> entry:values.entrySet()){if(entry.getKey()==null||entry.getValue()==null||entry.getKey().isEmpty()||entry.getValue().isEmpty())continue;if(out.length()>0)out.append("; ");out.append(entry.getKey()).append('=').append(entry.getValue());}return out.toString();}
    static boolean isEhFamily(String host){String h=host==null?"":host.toLowerCase(Locale.ROOT);return h.equals("e-hentai.org")||h.endsWith(".e-hentai.org")||h.equals("exhentai.org")||h.endsWith(".exhentai.org");}
    private static boolean isGalleryHost(String host){return host.equals("e-hentai.org")||host.endsWith(".e-hentai.org")||host.equals("exhentai.org")||host.endsWith(".exhentai.org");}

    static URL safePublicHttps(String raw) throws Exception {URL u=new URL(raw);String host=u.getHost()==null?"":u.getHost().toLowerCase(Locale.ROOT);if(!"https".equalsIgnoreCase(u.getProtocol())||host.isEmpty()||"localhost".equals(host)||host.endsWith(".localhost")||privateIpv4(host)||host.equals("::1")||host.startsWith("fc")||host.startsWith("fd")||host.startsWith("fe8")||host.startsWith("fe9")||host.startsWith("fea")||host.startsWith("feb"))throw new SecurityException("E-H 媒体地址未通过安全校验");return u;}
    private static boolean privateIpv4(String host){String[] p=host.split("\\.");if(p.length!=4)return false;int[] n=new int[4];try{for(int i=0;i<4;i++){n[i]=Integer.parseInt(p[i]);if(n[i]<0||n[i]>255)return true;}}catch(Exception e){return false;}return n[0]==0||n[0]==10||n[0]==127||(n[0]==169&&n[1]==254)||(n[0]==172&&n[1]>=16&&n[1]<=31)||(n[0]==192&&n[1]==168)||(n[0]==100&&n[1]>=64&&n[1]<=127)||n[0]>=224;}
    private static boolean containsCtl(String value){for(int i=0;i<value.length();i++){char c=value.charAt(i);if(c<0x20||c==0x7f)return true;}return false;}
}
