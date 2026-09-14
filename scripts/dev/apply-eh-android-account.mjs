import fs from 'node:fs'
const read=(f)=>fs.readFileSync(f,'utf8');const write=(f,t)=>fs.writeFileSync(f,t);const rep=(t,a,b,l)=>{const i=t.indexOf(a);if(i<0)throw new Error(`missing ${l}`);if(t.indexOf(a,i+a.length)>=0)throw new Error(`duplicate ${l}`);return t.slice(0,i)+b+t.slice(i+a.length)}
const root='mobile/android-alpha2/app/src/main/java/com/picalibrary/android/'

write(root+'EhAccountStore.java',`package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** E-H identity cookies encrypted with Android Keystore. Passwords are never stored here. */
final class EhAccountStore {
    static final class Session {
        final String memberId,passHash,igneous,cfClearance;
        Session(String memberId,String passHash,String igneous,String cfClearance){this.memberId=memberId;this.passHash=passHash;this.igneous=igneous;this.cfClearance=cfClearance;}
        boolean configured(){return !memberId.isEmpty()&&!passHash.isEmpty();}
    }
    private static final String PREF="eh-account-v1";
    private static final String ALIAS="picalibrary.eh.session.v1";
    private EhAccountStore(){}

    static Session load(Context context){SharedPreferences p=context.getSharedPreferences(PREF,Context.MODE_PRIVATE);return new Session(decrypt(p.getString("memberId","")),decrypt(p.getString("passHash","")),decrypt(p.getString("igneous","")),decrypt(p.getString("cfClearance","")));}
    static void save(Context context,Session value) throws Exception {context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString("memberId",encrypt(value.memberId)).putString("passHash",encrypt(value.passHash)).putString("igneous",encrypt(value.igneous)).putString("cfClearance",encrypt(value.cfClearance)).apply();}
    static void clear(Context context){context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().clear().apply();}

    private static SecretKey key() throws Exception {KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);KeyStore.Entry entry=store.getEntry(ALIAS,null);if(entry instanceof KeyStore.SecretKeyEntry)return ((KeyStore.SecretKeyEntry)entry).getSecretKey();KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());return generator.generateKey();}
    private static String encrypt(String value) throws Exception {Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());byte[] data=c.doFinal((value==null?"":value).getBytes(StandardCharsets.UTF_8));return Base64.encodeToString(c.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(data,Base64.NO_WRAP);}
    private static String decrypt(String value){if(value==null||value.isEmpty())return "";try{String[] parts=value.split(":",2);if(parts.length!=2)return "";Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new String(c.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);}catch(Exception e){return "";}}
}
`)

write(root+'EhFavoriteStore.java',`package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.json.*;

/** E-H local and cloud favorite provenance, kept separate from the legacy/Pica favorite cache. */
final class EhFavoriteStore {
    static final class Snapshot {
        String updatedAt="";
        final LinkedHashSet<String> localIds=new LinkedHashSet<>(),remoteIds=new LinkedHashSet<>();
    }
    private EhFavoriteStore(){}
    private static File file(Context context){return MobileStoragePaths.dataFile(context,"eh-favorites-v1.json");}
    static boolean aggregate(boolean picaOrLegacy,boolean local,boolean remote){return picaOrLegacy||local||remote;}

    static Snapshot load(Context context){Snapshot s=new Snapshot();File source=file(context);if(!source.isFile())return s;try(InputStream in=new FileInputStream(source);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);JSONObject root=new JSONObject(out.toString("UTF-8"));s.updatedAt=root.optString("updatedAt","");readIds(root.optJSONArray("localIds"),s.localIds);readIds(root.optJSONArray("remoteIds"),s.remoteIds);}catch(Exception ignored){}return s;}
    private static void readIds(JSONArray arr,Set<String> out){if(arr==null)return;for(int i=0;i<arr.length();i++){String id=arr.optString(i,"");if(EhClient.isEhId(id))out.add(id);}}
    private static void save(Context context,Snapshot s){try{s.updatedAt=Instant.now().toString();JSONObject root=new JSONObject();root.put("schemaVersion",1);root.put("updatedAt",s.updatedAt);root.put("localIds",new JSONArray(s.localIds));root.put("remoteIds",new JSONArray(s.remoteIds));File target=file(context);target.getParentFile().mkdirs();File tmp=new File(target.getParentFile(),target.getName()+".tmp");try(OutputStream out=new FileOutputStream(tmp)){out.write(root.toString().getBytes(StandardCharsets.UTF_8));}if(target.exists()&&!target.delete())throw new IOException("E-H favorite store replace failed");if(!tmp.renameTo(target))throw new IOException("E-H favorite store rename failed");}catch(Exception e){throw new IllegalStateException("无法保存 E-H 收藏来源",e);}}
    static synchronized void captureLegacyEhLocals(Context context,List<BridgeClient.ComicItem> legacy){Snapshot s=load(context);boolean changed=false;for(BridgeClient.ComicItem item:legacy)if(item!=null&&EhClient.isEhId(item.id)&&s.localIds.add(item.id))changed=true;if(changed)save(context,s);}
    static synchronized void setLocalFavorite(Context context,String id,boolean desired){if(!EhClient.isEhId(id))throw new IllegalArgumentException("无效的 E-H 收藏标识");Snapshot s=load(context);if(desired)s.localIds.add(id);else s.localIds.remove(id);save(context,s);UnifiedCatalogStore.reconcileLocalReferences(context);NativeRecommendationStore.markFavoriteChange(context);}
    static synchronized void setRemoteFavorite(Context context,String id,boolean desired){if(!EhClient.isEhId(id))throw new IllegalArgumentException("无效的 E-H 收藏标识");Snapshot s=load(context);if(desired)s.remoteIds.add(id);else s.remoteIds.remove(id);save(context,s);UnifiedCatalogStore.reconcileLocalReferences(context);NativeRecommendationStore.markFavoriteChange(context);}
    static synchronized void replaceRemote(Context context,List<EhClient.Comic> comics){Snapshot s=load(context);s.remoteIds.clear();for(EhClient.Comic comic:comics)if(comic!=null&&EhClient.isEhId(comic.id))s.remoteIds.add(comic.id);save(context,s);UnifiedCatalogStore.reconcileLocalReferences(context);NativeRecommendationStore.markFavoriteChange(context);}
}
`)

write(root+'EhClient.java',`package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.*;
import javax.net.ssl.SSLException;
import org.json.*;

/** E-H public client with optional encrypted cookie-session account capabilities. */
final class EhClient {
    static final String ORIGIN="https://e-hentai.org",EXH_ORIGIN="https://exhentai.org",API="https://api.e-hentai.org/api.php";
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
    private static boolean privateIpv4(String host){String[] p=host.split("\\.");if(p.length!=4)return false;int[] n=new int[4];try{for(int i=0;i<4;i++){n[i]=Integer.parseInt(p[i]);if(n[i]<0||n[i]>255)return true;}}catch(Exception e){return false;}return n[0]==0||n[0]==10||n[0]==127||(n[0]==169&&n[1]==254)||(n[0]==172&&n[1]>=16&&n[1]<=31)||(n[0]==192&&n[1]==168)||(n[0]==100&&n[1]>=64&&n[1]<=127)||n[0]>=224;}
    private static URL publicHttps(String raw) throws Exception {URL u=new URL(raw);String host=u.getHost()==null?"":u.getHost().toLowerCase(Locale.ROOT);if(!"https".equalsIgnoreCase(u.getProtocol())||host.isEmpty()||"localhost".equals(host)||host.endsWith(".localhost")||privateIpv4(host)||host.equals("::1")||host.startsWith("fc")||host.startsWith("fd")||host.startsWith("fe8")||host.startsWith("fe9")||host.startsWith("fea")||host.startsWith("feb"))throw new SecurityException("E-H 媒体地址未通过安全校验");return u;}

    private static synchronized void paceSearch() throws InterruptedException {long wait=SEARCH_INTERVAL_MS-(System.currentTimeMillis()-lastSearchAt);if(wait>0)Thread.sleep(wait);lastSearchAt=System.currentTimeMillis();}
    private String cookieHeader(String host){if(!"e-hentai.org".equalsIgnoreCase(host)&&!"exhentai.org".equalsIgnoreCase(host))return "";EhAccountStore.Session s=EhAccountStore.load(context);if(!s.configured())return "";StringBuilder out=new StringBuilder();appendCookie(out,"ipb_member_id",s.memberId);appendCookie(out,"ipb_pass_hash",s.passHash);appendCookie(out,"igneous",s.igneous);appendCookie(out,"cf_clearance",s.cfClearance);appendCookie(out,"nw","1");return out.toString();}
    private static void appendCookie(StringBuilder out,String name,String value){if(value==null||value.isEmpty())return;if(out.length()>0)out.append("; ");out.append(name).append('=').append(value);}
    private HttpURLConnection open(String url,String method,String accept) throws Exception {URL u=publicHttps(url);HttpURLConnection c=(HttpURLConnection)u.openConnection();c.setConnectTimeout(8000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(true);c.setRequestMethod(method);c.setRequestProperty("Accept",accept);c.setRequestProperty("User-Agent",UA);String cookie=cookieHeader(u.getHost());if(!cookie.isEmpty())c.setRequestProperty("Cookie",cookie);c.setUseCaches(false);return c;}
    private static byte[] read(InputStream in,int max) throws Exception {try(InputStream input=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=input.read(b))>0){if(out.size()+n>max)throw new IOException("E-H 响应过大");out.write(b,0,n);}return out.toByteArray();}}
    private String text(String url) throws Exception {HttpURLConnection c=open(url,"GET","text/html,*/*;q=0.8");try{int status=c.getResponseCode();if(status<200||status>=300)throw new IOException("E-H HTTP "+status);return new String(read(c.getInputStream(),8*1024*1024),StandardCharsets.UTF_8);}finally{c.disconnect();}}
    private String accountText(String url) throws Exception {if(!EhAccountStore.load(context).configured())throw new SecurityException("尚未配置 E-H 会话");HttpURLConnection c=open(url,"GET","text/html,*/*;q=0.8");try{int status=c.getResponseCode();URL end=c.getURL();if(status==401||status==403||end.getPath().contains("bounce_login")||end.getHost().startsWith("forums."))throw new SecurityException("E-H 会话无效或已过期");if(status<200||status>=300)throw new IOException("E-H HTTP "+status);String body=new String(read(c.getInputStream(),8*1024*1024),StandardCharsets.UTF_8);if(body.contains("act=Login&CODE=00")||body.contains("name=\"UserName\""))throw new SecurityException("E-H 会话无效或已过期");return body;}finally{c.disconnect();}}
    private JSONObject postJson(JSONObject body) throws Exception {HttpURLConnection c=open(API,"POST","application/json");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");try(OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}try{int status=c.getResponseCode();if(status<200||status>=300)throw new IOException("E-H API HTTP "+status);return new JSONObject(new String(read(c.getInputStream(),4*1024*1024),StandardCharsets.UTF_8));}finally{c.disconnect();}}

    private List<Comic> gdata(List<String[]> refs) throws Exception {List<Comic> out=new ArrayList<>();int batch=0;for(int offset=0;offset<refs.size();offset+=25){JSONArray ids=new JSONArray();for(int i=offset;i<Math.min(offset+25,refs.size());i++){String[] ref=refs.get(i);JSONArray pair=new JSONArray();pair.put(Long.parseLong(ref[0]));pair.put(ref[1]);ids.put(pair);}JSONObject request=new JSONObject();request.put("method","gdata");request.put("gidlist",ids);request.put("namespace",1);JSONArray rows=postJson(request).optJSONArray("gmetadata");if(rows==null)throw new IOException("E-H 元数据响应格式异常");for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(row!=null&&!row.has("error"))out.add(parseComic(row));}batch++;if(offset+25<refs.size())Thread.sleep(batch%4==0?5000:250);}return out;}
    private Comic parseComic(JSONObject row){long gid=row.optLong("gid");String token=row.optString("token","").toLowerCase(Locale.ROOT);String id="eh:"+gid+":"+token;JSONArray arr=row.optJSONArray("tags");List<String> raw=new ArrayList<>(),tags=new ArrayList<>(),authors=new ArrayList<>(),groups=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){String value=arr.optString(i,"");addUnique(raw,value);addUnique(tags,tagValue(value));String ns=tagNamespace(value);if("artist".equals(ns))addUnique(authors,tagValue(value));if("group".equals(ns))addUnique(groups,tagValue(value));}String uploader=row.optString("uploader","");String author=!authors.isEmpty()?authors.get(0):!groups.isEmpty()?groups.get(0):uploader;double rating;try{rating=Double.parseDouble(row.optString("rating","NaN"));}catch(Exception e){rating=Double.NaN;}String cover=row.optString("thumb","");try{if(!cover.isEmpty())cover=publicHttps(cover).toString();}catch(Exception e){cover="";}return new Comic(id,gid+":"+token,row.optString("title","E-H Gallery "+gid),row.optString("title_jpn",""),author,groups.isEmpty()?"":groups.get(0),cover,row.optString("category",""),uploader,"UNKNOWN",tags,raw,authors,Math.max(0,row.optInt("filecount",0)),rating,row.optLong("posted",0),row.optLong("filesize",0));}

    List<Comic> search(String query) throws Exception {paceSearch();String encoded=URLEncoder.encode(query==null?"":query.trim(),"UTF-8").replace("+","%20");String html=text(ORIGIN+"/?f_search="+encoded);Pattern p=Pattern.compile("(?:https?://e-hentai\\.org)?/g/(\\d+)/([0-9a-fA-F]{10})/");Matcher m=p.matcher(html);LinkedHashMap<String,String[]> refs=new LinkedHashMap<>();while(m.find()&&refs.size()<50){String key=m.group(1)+":"+m.group(2).toLowerCase(Locale.ROOT);refs.put(key,new String[]{m.group(1),m.group(2).toLowerCase(Locale.ROOT)});}return refs.isEmpty()?Collections.emptyList():gdata(new ArrayList<>(refs.values()));}
    Comic comic(String comicId) throws Exception {String[] ref=parseId(comicId);List<Comic> values=gdata(Collections.singletonList(ref));if(values.isEmpty())throw new IOException("E-H 未返回画廊元数据");return values.get(0);}
    List<Episode> episodes(String comicId) throws Exception {Comic comic=comic(comicId);String[] ref=parseId(comicId);return Collections.singletonList(new Episode("eh-"+ref[0],comic.title,1));}
    List<Page> pages(String comicId) throws Exception {Comic comic=comic(comicId);String[] ref=parseId(comicId);long gid=Long.parseLong(ref[0]);LinkedHashSet<String> urls=new LinkedHashSet<>();Pattern p=Pattern.compile("(?:https?://e-hentai\\.org)?/s/[0-9a-fA-F]+/"+gid+"-\\d+");for(int page=0;page<100;page++){String html=text(ORIGIN+"/g/"+gid+"/"+ref[1]+"/?p="+page);Matcher m=p.matcher(html);int before=urls.size();while(m.find())urls.add(new URL(new URL(ORIGIN),decodeHtml(m.group())).toString());if((comic.pagesCount>0&&urls.size()>=comic.pagesCount)||urls.size()==before)break;Thread.sleep(100);}if(comic.pagesCount>0&&urls.size()<comic.pagesCount)throw new IOException("E-H 页列表不完整（"+urls.size()+"/"+comic.pagesCount+"）");List<Page> out=new ArrayList<>();int pos=0;for(String url:urls){pos++;out.add(new Page("eh-"+gid+"-"+pos,url,pos));if(comic.pagesCount>0&&pos>=comic.pagesCount)break;}return out;}

    void verifyAccount() throws Exception {accountText(ORIGIN+"/favorites.php?favcat=all");}
    List<Comic> favoritesAll() throws Exception {verifyAccount();LinkedHashMap<String,String[]> refs=new LinkedHashMap<>();Set<String> cursors=new HashSet<>();String url=ORIGIN+"/favorites.php?favcat=all";Pattern gallery=Pattern.compile("(?:https?://e-hentai\\.org)?/g/(\\d+)/([0-9a-fA-F]{10})/");Pattern next=Pattern.compile("(?:\\?|&amp;|&)next=(\\d+)");for(int page=0;page<200;page++){String html=accountText(url);Matcher gm=gallery.matcher(html);while(gm.find()){String key=gm.group(1)+":"+gm.group(2).toLowerCase(Locale.ROOT);refs.put(key,new String[]{gm.group(1),gm.group(2).toLowerCase(Locale.ROOT)});}Matcher nm=next.matcher(html);String cursor="";if(nm.find())cursor=nm.group(1);if(cursor.isEmpty()||!cursors.add(cursor))break;url=ORIGIN+"/favorites.php?favcat=all&next="+URLEncoder.encode(cursor,"UTF-8");Thread.sleep(250);}return refs.isEmpty()?Collections.emptyList():gdata(new ArrayList<>(refs.values()));}
    String probeExH(){if(!EhAccountStore.load(context).configured())return "UNAVAILABLE";HttpURLConnection c=null;try{c=open(EXH_ORIGIN+"/uconfig.php","GET","text/html,*/*;q=0.8");int status=c.getResponseCode();URL end=c.getURL();if(status==401||status==403||status==404||end.getPath().contains("bounce_login")||!"exhentai.org".equalsIgnoreCase(end.getHost()))return "UNAVAILABLE";if(status<200||status>=300)return "NETWORK_ERROR";String body=new String(read(c.getInputStream(),2*1024*1024),StandardCharsets.UTF_8);if(body.trim().isEmpty()||body.contains("Sad Panda")||body.contains("act=Login"))return "UNAVAILABLE";return "AVAILABLE";}catch(SocketTimeoutException e){return "NETWORK_ERROR";}catch(UnknownHostException e){return "NETWORK_ERROR";}catch(ConnectException e){return "NETWORK_ERROR";}catch(SSLException e){return "NETWORK_ERROR";}catch(Exception e){return "NETWORK_ERROR";}finally{if(c!=null)c.disconnect();}}
    void setRemoteFavorite(String comicId,boolean desired) throws Exception {if(!EhAccountStore.load(context).configured())throw new SecurityException("尚未配置 E-H 会话");String[] ref=parseId(comicId);String url=ORIGIN+"/gallerypopups.php?gid="+URLEncoder.encode(ref[0],"UTF-8")+"&t="+URLEncoder.encode(ref[1],"UTF-8")+"&act=addfav";HttpURLConnection c=open(url,"POST","text/html,*/*;q=0.8");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/x-www-form-urlencoded");String favcat=desired?"0":"favdel";String form="favcat="+URLEncoder.encode(favcat,"UTF-8")+"&favnote=&apply="+URLEncoder.encode("Apply Changes","UTF-8")+"&update=1";try(OutputStream out=c.getOutputStream()){out.write(form.getBytes(StandardCharsets.UTF_8));}try{int status=c.getResponseCode();URL end=c.getURL();if(status==401||status==403||end.getPath().contains("bounce_login")||end.getHost().startsWith("forums."))throw new SecurityException("E-H 会话无效或已过期");if(status<200||status>=300)throw new IOException("E-H 收藏更新 HTTP "+status);try{read(c.getInputStream(),1024*1024);}catch(Exception ignored){}}finally{c.disconnect();}}

    HttpURLConnection thumbnail(String url) throws Exception {HttpURLConnection c=(HttpURLConnection)publicHttps(url).openConnection();c.setConnectTimeout(8000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(true);c.setRequestProperty("Accept","image/*");c.setRequestProperty("Referer",ORIGIN+"/");c.setRequestProperty("User-Agent",UA);c.setUseCaches(false);return c;}
    HttpURLConnection image(String pageUrl) throws Exception {URL page=new URL(pageUrl);if(!"https".equalsIgnoreCase(page.getProtocol())||!"e-hentai.org".equalsIgnoreCase(page.getHost())||!page.getPath().matches("^/s/[0-9a-fA-F]+/\\d+-\\d+$"))throw new SecurityException("无效的 E-H 图片页");String html=text(page.toString());Matcher first=Pattern.compile("<img[^>]+id=[\\\"']img[\\\"'][^>]+src=[\\\"']([^\\\"']+)[\\\"']",Pattern.CASE_INSENSITIVE).matcher(html);Matcher second=Pattern.compile("<img[^>]+src=[\\\"']([^\\\"']+)[\\\"'][^>]+id=[\\\"']img[\\\"']",Pattern.CASE_INSENSITIVE).matcher(html);String imageUrl=first.find()?first.group(1):second.find()?second.group(1):"";if(imageUrl.isEmpty())throw new IOException("E-H 图片页没有可读取图片");URL image=publicHttps(decodeHtml(imageUrl));HttpURLConnection c=(HttpURLConnection)image.openConnection();c.setConnectTimeout(8000);c.setReadTimeout(20000);c.setInstanceFollowRedirects(true);c.setRequestProperty("Accept","image/*");c.setRequestProperty("Referer",page.toString());c.setRequestProperty("User-Agent",UA);c.setUseCaches(false);return c;}
}
`)

{
 const file=root+'UnifiedCatalogStore.java';let text=read(file)
 text=rep(text,'        boolean finished,favorite,inShelf,phoneDownloaded,desktopAvailable,desktopDownloaded,remoteAvailable,picaAvailable,ehAvailable;','        boolean finished,favorite,picaFavorite,localFavorite,ehFavorite,inShelf,phoneDownloaded,desktopAvailable,desktopDownloaded,remoteAvailable,picaAvailable,ehAvailable;','favorite source fields')
 text=text.replace('root.put("schemaVersion",3);','root.put("schemaVersion",4);')
 const a='    private static void applyLocalReferences(Context context,Snapshot s){\n        ShelfStore.Snapshot shelves=ShelfStore.load(context);if(!shelves.updatedAt.isEmpty()){for(Entry e:s.byId.values()){e.inShelf=false;e.shelfIds.clear();}for(ShelfStore.Shelf shelf:shelves.shelves)if(shelf.active())for(ShelfStore.Item item:shelf.items)if(item.active()){Entry e=entry(s,item.comicId);basic(e,item.title,item.author);e.inShelf=true;if(!e.shelfIds.contains(shelf.id))e.shelfIds.add(shelf.id);e.knownPictures=Math.max(e.knownPictures,item.knownPictures);e.desktopDownloadedPictures=Math.max(e.desktopDownloadedPictures,item.downloadedPictures);}}\n        FavoriteCacheStore.Snapshot favorites=FavoriteCacheStore.load(context);if(!favorites.updatedAt.isEmpty()){for(Entry e:s.byId.values())e.favorite=false;for(BridgeClient.ComicItem item:favorites.items){Entry e=entry(s,item.id);e.favorite=true;basic(e,item.title,item.author);if(item.coverPath!=null&&!item.coverPath.isEmpty())e.desktopCoverPath=item.coverPath;e.desktopDownloadedPictures=Math.max(e.desktopDownloadedPictures,item.downloadedPictures);}}\n        for(Entry e:s.byId.values())e.phoneDownloaded=false;PhoneDownloadStore.Snapshot downloads=PhoneDownloadStore.load(context);for(PhoneDownloadStore.Comic comic:downloads.comics.values()){Entry e=entry(s,comic.id);basic(e,comic.title,comic.author);e.phoneDownloaded=comic.pages()>0;e.knownPictures=Math.max(e.knownPictures,comic.pages());}\n    }'
 const b='    private static void applyLocalReferences(Context context,Snapshot s){\n        ShelfStore.Snapshot shelves=ShelfStore.load(context);if(!shelves.updatedAt.isEmpty()){for(Entry e:s.byId.values()){e.inShelf=false;e.shelfIds.clear();}for(ShelfStore.Shelf shelf:shelves.shelves)if(shelf.active())for(ShelfStore.Item item:shelf.items)if(item.active()){Entry e=entry(s,item.comicId);basic(e,item.title,item.author);e.inShelf=true;if(!e.shelfIds.contains(shelf.id))e.shelfIds.add(shelf.id);e.knownPictures=Math.max(e.knownPictures,item.knownPictures);e.desktopDownloadedPictures=Math.max(e.desktopDownloadedPictures,item.downloadedPictures);}}\n        FavoriteCacheStore.Snapshot favorites=FavoriteCacheStore.load(context);EhFavoriteStore.captureLegacyEhLocals(context,favorites.items);EhFavoriteStore.Snapshot ehFavorites=EhFavoriteStore.load(context);if(!favorites.updatedAt.isEmpty()||!ehFavorites.updatedAt.isEmpty()){for(Entry e:s.byId.values()){e.picaFavorite=false;e.localFavorite=false;e.ehFavorite=false;}for(BridgeClient.ComicItem item:favorites.items){Entry e=entry(s,item.id);if(EhClient.isEhId(item.id))e.localFavorite=true;else e.picaFavorite=true;basic(e,item.title,item.author);if(item.coverPath!=null&&!item.coverPath.isEmpty())e.desktopCoverPath=item.coverPath;e.desktopDownloadedPictures=Math.max(e.desktopDownloadedPictures,item.downloadedPictures);}for(String id:ehFavorites.localIds)entry(s,id).localFavorite=true;for(String id:ehFavorites.remoteIds)entry(s,id).ehFavorite=true;for(Entry e:s.byId.values())e.favorite=EhFavoriteStore.aggregate(e.picaFavorite,e.localFavorite,e.ehFavorite);}\n        for(Entry e:s.byId.values())e.phoneDownloaded=false;PhoneDownloadStore.Snapshot downloads=PhoneDownloadStore.load(context);for(PhoneDownloadStore.Comic comic:downloads.comics.values()){Entry e=entry(s,comic.id);basic(e,comic.title,comic.author);e.phoneDownloaded=comic.pages()>0;e.knownPictures=Math.max(e.knownPictures,comic.pages());}\n    }'
 text=rep(text,a,b,'aggregate favorite references')
 text=rep(text,'e.favorite=o.optBoolean("favorite",false);e.inShelf=', 'e.favorite=o.optBoolean("favorite",false);e.picaFavorite=o.optBoolean("picaFavorite",false);e.localFavorite=o.optBoolean("localFavorite",false);e.ehFavorite=o.optBoolean("ehFavorite",false);e.inShelf=', 'parse favorite provenance')
 text=rep(text,'o.put("favorite",e.favorite);o.put("inShelf",e.inShelf);', 'o.put("favorite",e.favorite);o.put("picaFavorite",e.picaFavorite);o.put("localFavorite",e.localFavorite);o.put("ehFavorite",e.ehFavorite);o.put("inShelf",e.inShelf);', 'serialize favorite provenance')
 write(file,text)
}

{
 const file=root+'PicaBootstrapWorker.java';let text=read(file)
 text=rep(text,'            UnifiedPicaCatalogSync.mergeAll(app,favorites);List<BridgeClient.ComicItem> items=new ArrayList<>();for(PicaClient.Comic comic:favorites)items.add(new BridgeClient.ComicItem(comic.id,comic.title,comic.author,"",0));FavoriteCacheStore.save(app,items,false);UnifiedCatalogStore.reconcileLocalReferences(app);', '            UnifiedPicaCatalogSync.mergeAll(app,favorites);EhFavoriteStore.captureLegacyEhLocals(app,FavoriteCacheStore.load(app).items);List<BridgeClient.ComicItem> items=new ArrayList<>();for(PicaClient.Comic comic:favorites)items.add(new BridgeClient.ComicItem(comic.id,comic.title,comic.author,"",0));FavoriteCacheStore.save(app,items,false);UnifiedCatalogStore.reconcileLocalReferences(app);', 'preserve legacy E-H local favorites before Pica bootstrap')
 write(file,text)
}

write(root+'EhAccountActivity.java',`package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.widget.*;
import java.util.*;

/** Optional E-H cookie-session setup. Public E-H browse remains account-free. */
public final class EhAccountActivity extends Activity {
    private EditText memberId,passHash,igneous,cfClearance;private TextView status;private boolean busy;
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);render();}
    private Button button(String label,android.view.View.OnClickListener action){return Ui.button(this,label,action,false);}
    private EditText secret(String hint){EditText input=new EditText(this);input.setSingleLine(true);input.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);input.setHint(hint);input.setSaveEnabled(false);Ui.styleField(input,this);return input;}
    private void render(){EhAccountStore.Session session=EhAccountStore.load(this);LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"E-H / ExH 账号",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setPadding(Ui.dp(this,18),Ui.dp(this,16),Ui.dp(this,18),Ui.dp(this,24));scroll.addView(p);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));p.addView(Ui.text(this,"公共 E-H 搜索、阅读、下载无需账号。这里的会话只用于 E-H 云收藏和 ExH 访问探测；不会保存 E-H 密码。",14,Ui.MUTED,false));p.addView(Ui.text(this,"先在官方站点登录，再复制身份 cookie。ipb_member_id 与 ipb_pass_hash 为必填；igneous / cf_clearance 仅在你的会话实际包含时填写。",12,Ui.MUTED,false));LinearLayout links=new LinearLayout(this);links.addView(button("官方登录页",v->open("https://forums.e-hentai.org/index.php?act=Login")),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(links,this,8);links.addView(button("官方注册页",v->open("https://forums.e-hentai.org/index.php?act=Reg&CODE=00")),new LinearLayout.LayoutParams(0,-2,1));p.addView(links);Ui.gap(p,this,12);p.addView(Ui.text(this,"ipb_member_id",13,Ui.TEXT,true));memberId=new EditText(this);memberId.setSingleLine(true);memberId.setText(session.memberId);Ui.styleField(memberId,this);p.addView(memberId);p.addView(Ui.text(this,"ipb_pass_hash",13,Ui.TEXT,true));passHash=secret(session.passHash.isEmpty()?"必填":"已保存；留空则保留");p.addView(passHash);p.addView(Ui.text(this,"igneous（可选）",13,Ui.TEXT,true));igneous=secret(session.igneous.isEmpty()?"可选":"已保存；留空则保留");p.addView(igneous);p.addView(Ui.text(this,"cf_clearance（可选）",13,Ui.TEXT,true));cfClearance=secret(session.cfClearance.isEmpty()?"可选":"已保存；留空则保留");p.addView(cfClearance);status=Ui.text(this,session.configured()?"E-H 会话已加密保存":"未配置会话；公共 E-H 功能仍可使用",13,Ui.MUTED,false);status.setPadding(0,Ui.dp(this,10),0,Ui.dp(this,8));p.addView(status);LinearLayout row1=new LinearLayout(this);row1.addView(button("保存并验证",v->saveAndVerify()),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(row1,this,8);row1.addView(button("同步云收藏",v->syncFavorites()),new LinearLayout.LayoutParams(0,-2,1));p.addView(row1);LinearLayout row2=new LinearLayout(this);row2.addView(button("探测 ExH",v->probe()),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(row2,this,8);row2.addView(button("清除会话",v->clearSession()),new LinearLayout.LayoutParams(0,-2,1));p.addView(row2);p.addView(Ui.text(this,"会话字段使用 Android Keystore AES-GCM 加密；清除会话不会删除本地漫画、书架或最后一次同步到本机的收藏标记。",12,Ui.MUTED,false));setContentView(root);root.requestApplyInsets();}
    private void open(String url){startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}
    private EhAccountStore.Session candidate(){EhAccountStore.Session old=EhAccountStore.load(this);String id=memberId.getText().toString().trim();String hash=passHash.getText().toString().trim();String ign=igneous.getText().toString().trim();String cf=cfClearance.getText().toString().trim();return new EhAccountStore.Session(id.isEmpty()?old.memberId:id,hash.isEmpty()?old.passHash:hash,ign.isEmpty()?old.igneous:ign,cf.isEmpty()?old.cfClearance:cf);}
    private void saveAndVerify(){if(busy)return;EhAccountStore.Session old=EhAccountStore.load(this),next=candidate();if(!next.configured()){status.setText("请填写 ipb_member_id 和 ipb_pass_hash");return;}busy=true;status.setText("正在验证 E-H 会话…");new Thread(()->{try{EhAccountStore.save(this,next);new EhClient(this).verifyAccount();runOnUiThread(()->{busy=false;passHash.setText("");igneous.setText("");cfClearance.setText("");status.setText("E-H 会话有效，已用 Android Keystore 加密保存。");});}catch(Exception e){try{if(old.configured())EhAccountStore.save(this,old);else EhAccountStore.clear(this);}catch(Exception ignored){}runOnUiThread(()->{busy=false;status.setText("验证失败："+(e.getMessage()==null?"会话不可用":e.getMessage()));});}}).start();}
    private void syncFavorites(){if(busy)return;if(!EhAccountStore.load(this).configured()){status.setText("请先保存并验证 E-H 会话");return;}busy=true;status.setText("正在同步 E-H 云收藏…");new Thread(()->{try{List<EhClient.Comic> comics=new EhClient(this).favoritesAll();UnifiedEhCatalogSync.mergeAll(this,comics);EhFavoriteStore.replaceRemote(this,comics);runOnUiThread(()->{busy=false;status.setText("E-H 云收藏已同步："+comics.size()+" 本");});}catch(Exception e){runOnUiThread(()->{busy=false;status.setText("同步失败："+(e.getMessage()==null?"未知错误":e.getMessage()));});}}).start();}
    private void probe(){if(busy)return;busy=true;status.setText("正在探测 ExH…");new Thread(()->{String value=new EhClient(this).probeExH();runOnUiThread(()->{busy=false;status.setText("ExH: "+value);});}).start();}
    private void clearSession(){if(busy)return;EhAccountStore.clear(this);passHash.setText("");igneous.setText("");cfClearance.setText("");status.setText("E-H 会话已清除；公共功能与本地数据不受影响");}
}
`)

{
 const file=root+'PicaBrowseActivity.java';let text=read(file)
 text=rep(text,'bar.addView(button("Pica 账号",v->startActivity(new Intent(this,PicaAccountActivity.class))));root.addView(bar);','bar.addView(button("Pica 账号",v->startActivity(new Intent(this,PicaAccountActivity.class))));bar.addView(button("E-H 账号",v->startActivity(new Intent(this,EhAccountActivity.class))));root.addView(bar);','browse account buttons')
 write(file,text)
}

{
 const file='mobile/android-alpha2/app/src/main/AndroidManifest.xml';let text=read(file)
 text=rep(text,'        <activity android:name=".PicaAccountActivity" android:exported="false" />','        <activity android:name=".PicaAccountActivity" android:exported="false" />\n        <activity android:name=".EhAccountActivity" android:exported="false" />','manifest E-H account activity')
 write(file,text)
}

{
 const file=root+'UnifiedComicDetailActivity.java';let text=read(file)
 const start=text.indexOf('    private void renderActions(){');const end=text.indexOf('    private void setPicaFavorite(',start);if(start<0||end<0)throw new Error('detail favorite action scope not found')
 const replacement=`    private void renderActions(){if(actionArea==null||destroyed)return;actionArea.removeAllViews();if(EhClient.isEhId(entry.id)){boolean local=entry.localFavorite,remote=entry.ehFavorite;Button localFav=small(local?"★ 本地":"☆ 本地",v->{EhFavoriteStore.setLocalFavorite(this,entry.id,!local);UnifiedCatalogStore.Entry refreshed=UnifiedCatalogStore.load(this).byId.get(entry.id);if(refreshed!=null)entry=refreshed;renderActions();Toast.makeText(this,!local?"已加入本地收藏":"已取消本地收藏",Toast.LENGTH_SHORT).show();});localFav.setTextColor(local?Ui.FAVORITE:Ui.MUTED);actionArea.addView(localFav,new LinearLayout.LayoutParams(0,-2,1));Ui.gap(actionArea,this,6);if(EhAccountStore.load(this).configured()){Button cloud=small(remote?"★ E-H 云":"☆ E-H 云",v->setEhRemoteFavorite(!remote));cloud.setTextColor(remote?Ui.FAVORITE:Ui.MUTED);actionArea.addView(cloud,new LinearLayout.LayoutParams(0,-2,1));}else actionArea.addView(small("E-H 账号",v->startActivity(new Intent(this,EhAccountActivity.class))),new LinearLayout.LayoutParams(0,-2,1));}else if(picaReady&&picaFavoriteState!=null){boolean favorite=picaFavoriteState;Button fav=small(favorite?"★ 已收藏":"☆ 收藏",v->setPicaFavorite(!favorite));fav.setTextColor(favorite?Ui.FAVORITE:Ui.MUTED);actionArea.addView(fav,new LinearLayout.LayoutParams(0,-2,1));}else{Button fav=small(entry.favorite?"★ 已收藏":"☆ 收藏",v->{if(PicaAccountStore.load(this).configured())Toast.makeText(this,"正在读取 Pica 收藏状态",Toast.LENGTH_SHORT).show();else startActivity(new Intent(this,PicaAccountActivity.class));});fav.setTextColor(entry.favorite?Ui.FAVORITE:Ui.MUTED);actionArea.addView(fav,new LinearLayout.LayoutParams(0,-2,1));}Ui.gap(actionArea,this,6);actionArea.addView(small("书架",v->chooseShelves()),new LinearLayout.LayoutParams(0,-2,1));}\n    private void setEhRemoteFavorite(boolean desired){actionArea.setEnabled(false);worker.submit(()->{try{new EhClient(this).setRemoteFavorite(entry.id,desired);EhFavoriteStore.setRemoteFavorite(this,entry.id,desired);UnifiedCatalogStore.Entry refreshed=UnifiedCatalogStore.load(this).byId.get(entry.id);if(refreshed!=null)entry=refreshed;runOnUiThread(()->{if(destroyed)return;actionArea.setEnabled(true);renderActions();Toast.makeText(this,desired?"已加入 E-H 云收藏":"已取消 E-H 云收藏",Toast.LENGTH_SHORT).show();});}catch(Exception e){runOnUiThread(()->{if(destroyed)return;actionArea.setEnabled(true);renderActions();Toast.makeText(this,"E-H 云收藏更新失败",Toast.LENGTH_LONG).show();});}});}\n`
 text=text.slice(0,start)+replacement+text.slice(end)
 write(file,text)
}

{
 const file=root+'NativeRecommendationEngine.java';let text=read(file)
 const a=`        Context app=context.getApplicationContext();PicaClient client=new PicaClient(app);MobileTagRegistry registry=MobileTagRegistry.load(app);
        emit(progress,"正在读取 Pica 收藏",0,1);List<PicaClient.Comic> favorites=client.favoritesAll();if(favorites.isEmpty())throw new IllegalStateException("Pica 收藏为空，无法建立手机推荐画像");
        LinkedHashMap<String,PicaClient.Comic> favoriteById=new LinkedHashMap<>();for(PicaClient.Comic comic:favorites)if(comic!=null&&!comic.id.isEmpty())favoriteById.put(comic.id,comic);favorites=new ArrayList<>(favoriteById.values());UnifiedPicaCatalogSync.mergeAll(app,favorites);markPicaFavorites(app,favorites);
`
 const b=`        Context app=context.getApplicationContext();PicaClient client=new PicaClient(app);MobileTagRegistry registry=MobileTagRegistry.load(app);boolean picaConfigured=PicaAccountStore.load(app).configured();
        emit(progress,"正在读取跨来源收藏画像",0,1);List<PicaClient.Comic> picaFavorites=new ArrayList<>();if(picaConfigured)try{picaFavorites.addAll(client.favoritesAll());}catch(Exception ignored){}if(!picaFavorites.isEmpty()){UnifiedPicaCatalogSync.mergeAll(app,picaFavorites);markPicaFavorites(app,picaFavorites);}UnifiedCatalogStore.Snapshot knownFavorites=UnifiedCatalogStore.reconcileLocalReferences(app);List<PicaClient.Comic> favorites=new ArrayList<>(picaFavorites);for(UnifiedCatalogStore.Entry known:knownFavorites.byId.values())if("eh".equals(known.providerId)&&known.favorite)favorites.add(ehCatalogFavorite(known));
        LinkedHashMap<String,PicaClient.Comic> favoriteById=new LinkedHashMap<>();for(PicaClient.Comic comic:favorites)if(comic!=null&&!comic.id.isEmpty())favoriteById.put(comic.id,comic);favorites=new ArrayList<>(favoriteById.values());if(favorites.isEmpty())throw new IllegalStateException("当前没有可用于推荐画像的 Pica / E-H 收藏");
`
 text=rep(text,a,b,'cross-source mobile favorite profile')
 const rStart=text.indexOf('        emit(progress,"正在从 Pica + E-H 多路召回候选"');const rEnd=text.indexOf('        List<PicaClient.Comic> picaDiscovered=',rStart);if(rStart<0||rEnd<0)throw new Error('mobile retrieval block not found')
 const r=`        emit(progress,"正在从 Pica + E-H 多路召回候选",0,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);LinkedHashMap<String,Candidate> candidates=new LinkedHashMap<>();int requests=0,ehRequests=0;final int EH_MAX_REQUESTS=4;EhClient ehClient=new EhClient(app);List<EhClient.Comic> ehDiscovered=new ArrayList<>();Set<String> allFavoriteIds=new HashSet<>(favoriteById.keySet());for(UnifiedCatalogStore.Entry known:UnifiedCatalogStore.load(app).byId.values())if(known.favorite)allFavoriteIds.add(known.id);
        for(int page=1;page<=NativeRecommendationPolicy.MAX_PAGE&&requests<NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS&&candidates.size()<NativeRecommendationPolicy.TARGET_POOL;page++){
            for(Route route:routes){if(requests>=NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS||candidates.size()>=NativeRecommendationPolicy.TARGET_POOL)break;if(page>1&&"RELATED".equals(route.type))continue;
                if(picaConfigured&&!("RELATED".equals(route.type)&&route.seed.startsWith("eh:"))){try{List<PicaClient.Comic> docs="RELATED".equals(route.type)?client.related(route.seed):client.search(route.query,page,"ld",Collections.emptyList()).comics;requests++;addCandidates(candidates,allFavoriteIds,registry,docs,route,(page-1)*20);}catch(Exception e){requests++;emit(progress,"部分 Pica 召回路线失败，继续其他路线",requests,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);}}
                if(page==1&&!"RELATED".equals(route.type)&&ehRequests<EH_MAX_REQUESTS){ehRequests++;try{String q="AUTHOR".equals(route.type)?"artist:\""+route.query.replace("\"","")+"\"":route.query;List<EhClient.Comic> ehDocs=ehClient.search(q);ehDiscovered.addAll(ehDocs);List<PicaClient.Comic> converted=new ArrayList<>();for(EhClient.Comic comic:ehDocs)converted.add(ehCandidate(comic));addCandidates(candidates,allFavoriteIds,registry,converted,route,0);}catch(Exception ignored){}}
                emit(progress,"正在从 Pica + E-H 多路召回候选",requests,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);
            }
        }
`
 text=text.slice(0,rStart)+r+text.slice(rEnd)
 text=rep(text,'    private static PicaClient.Comic ehCandidate(EhClient.Comic comic){List<String> categories=new ArrayList<>();if(comic.category!=null&&!comic.category.isEmpty())categories.add(comic.category);return new PicaClient.Comic(comic.id,comic.title,comic.author,"",comic.coverUrl,"",new ArrayList<>(comic.tags),categories,false,false,comic.pagesCount,1,0,0);}', '    private static PicaClient.Comic ehCandidate(EhClient.Comic comic){List<String> categories=new ArrayList<>();if(comic.category!=null&&!comic.category.isEmpty())categories.add(comic.category);return new PicaClient.Comic(comic.id,comic.title,comic.author,"",comic.coverUrl,"",new ArrayList<>(comic.tags),categories,false,false,comic.pagesCount,1,0,0);}\n    private static PicaClient.Comic ehCatalogFavorite(UnifiedCatalogStore.Entry entry){return new PicaClient.Comic(entry.id,entry.title,entry.displayAuthor(),entry.description,entry.ehCoverUrl,"",new ArrayList<>(entry.tags),new ArrayList<>(entry.categories),false,true,entry.knownPictures,1,0,0);}', 'E-H catalog favorite adapter')
 write(file,text)
}

write('mobile/android-alpha2/app/src/test/java/com/picalibrary/android/EhFavoriteAggregationTest.java',`package com.picalibrary.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class EhFavoriteAggregationTest {
    @Test public void sourceAggregationIsAdditive(){assertFalse(EhFavoriteStore.aggregate(false,false,false));assertTrue(EhFavoriteStore.aggregate(true,false,false));assertTrue(EhFavoriteStore.aggregate(false,true,false));assertTrue(EhFavoriteStore.aggregate(false,false,true));assertTrue(EhFavoriteStore.aggregate(true,true,true));}
}
`)
console.log('EH_ANDROID_ACCOUNT_PATCH=APPLIED')
