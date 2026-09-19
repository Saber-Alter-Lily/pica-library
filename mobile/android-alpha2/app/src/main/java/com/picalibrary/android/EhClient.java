package com.picalibrary.android;

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

    private static final String RELAY_PAGE_PREFIX="pica-desktop-eh:";
    private boolean localAccountConfigured(){return EhAccountStore.load(context).configured();}
    private boolean desktopAccountConfigured(){return BridgeStore.paired(context)&&DesktopAccountStatusStore.load(context).ehConfigured;}
    private boolean useDesktopAccountRelay(){return !localAccountConfigured()&&desktopAccountConfigured();}
    static boolean accountAvailable(Context context){Context app=context.getApplicationContext();return EhAccountStore.load(app).configured()||(BridgeStore.paired(app)&&DesktopAccountStatusStore.load(app).ehConfigured);}

    static final class Comic {
        final String id,remoteId,title,alternateTitle,author,circle,coverUrl,category,uploader,completionStatus,surface;
        final List<String> tags,rawTags,authors;
        final int pagesCount;final double rating;final long posted,filesize;
        Comic(String id,String remoteId,String title,String alternateTitle,String author,String circle,String coverUrl,String category,String uploader,String completionStatus,List<String> tags,List<String> rawTags,List<String> authors,int pagesCount,double rating,long posted,long filesize,String surface){this.id=id;this.remoteId=remoteId;this.title=title;this.alternateTitle=alternateTitle;this.author=author;this.circle=circle;this.coverUrl=coverUrl;this.category=category;this.uploader=uploader;this.completionStatus=completionStatus;this.tags=tags;this.rawTags=rawTags;this.authors=authors;this.pagesCount=pagesCount;this.rating=rating;this.posted=posted;this.filesize=filesize;this.surface=surface==null||surface.isEmpty()?"eh":surface;}
    }
    static final class Episode {final String id,title;final int order;Episode(String id,String title,int order){this.id=id;this.title=title;this.order=order;}}
    static final class Page {final String id,pageUrl;final int position;Page(String id,String pageUrl,int position){this.id=id;this.pageUrl=pageUrl;this.position=position;}}
    private static final class FavoriteMeta {final int slot;final String note;FavoriteMeta(int slot,String note){this.slot=slot;this.note=note==null?"":note;}}

    static boolean isEhId(String value){return value!=null&&value.matches("^eh:\\d+:[0-9a-fA-F]{10}$");}
    private static String[] parseId(String value){if(!isEhId(value))throw new IllegalArgumentException("无效的 E-H 画廊标识");String[] p=value.split(":",3);return new String[]{p[1],p[2].toLowerCase(Locale.ROOT)};}
    private static String decodeHtml(String s){return s.replace("&amp;","&").replace("&quot;","\"").replace("&#39;","'").replace("&apos;","'").replace("&lt;","<").replace("&gt;",">");}
    private static String tagValue(String raw){int i=raw.indexOf(':');return (i>0?raw.substring(i+1):raw).trim();}
    private static String tagNamespace(String raw){int i=raw.indexOf(':');return i>0?raw.substring(0,i).toLowerCase(Locale.ROOT):"";}
    private static void addUnique(List<String> out,String value){if(value!=null){value=value.trim();if(!value.isEmpty()&&!out.contains(value))out.add(value);}}
    private static boolean privateIpv4(String host){String[] p=host.split("\\.");if(p.length!=4)return false;int[] n=new int[4];try{for(int i=0;i<4;i++){n[i]=Integer.parseInt(p[i]);if(n[i]<0||n[i]>255)return true;}}catch(Exception e){return false;}return n[0]==0||n[0]==10||n[0]==127||(n[0]==169&&n[1]==254)||(n[0]==172&&n[1]>=16&&n[1]<=31)||(n[0]==192&&n[1]==168)||(n[0]==100&&n[1]>=64&&n[1]<=127)||n[0]>=224;}
    private static URL publicHttps(String raw) throws Exception {URL u=new URL(raw);String host=u.getHost()==null?"":u.getHost().toLowerCase(Locale.ROOT);if(!"https".equalsIgnoreCase(u.getProtocol())||host.isEmpty()||"localhost".equals(host)||host.endsWith(".localhost")||privateIpv4(host)||host.equals("::1")||host.startsWith("fc")||host.startsWith("fd")||host.startsWith("fe8")||host.startsWith("fe9")||host.startsWith("fea")||host.startsWith("feb"))throw new SecurityException("E-H 媒体地址未通过安全校验");return u;}

    private static synchronized void paceSearch() throws InterruptedException {long wait=SEARCH_INTERVAL_MS-(System.currentTimeMillis()-lastSearchAt);if(wait>0)Thread.sleep(wait);lastSearchAt=System.currentTimeMillis();}
    private String cookieHeader(String host){
        if(!"e-hentai.org".equalsIgnoreCase(host)&&!"exhentai.org".equalsIgnoreCase(host))return "";
        StringBuilder out=new StringBuilder();appendCookie(out,"nw","1");
        EhAccountStore.Session s=EhAccountStore.load(context);if(!s.configured())return out.toString();
        appendCookie(out,"ipb_member_id",s.memberId);appendCookie(out,"ipb_pass_hash",s.passHash);appendCookie(out,"igneous",s.igneous);appendCookie(out,"cf_clearance",s.cfClearance);return out.toString();
    }
    private static void appendCookie(StringBuilder out,String name,String value){if(value==null||value.isEmpty())return;if(out.length()>0)out.append("; ");out.append(name).append('=').append(value);}
    private HttpURLConnection open(String url,String method,String accept) throws Exception {URL u=publicHttps(url);HttpURLConnection c=(HttpURLConnection)u.openConnection();c.setConnectTimeout(8000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(true);c.setRequestMethod(method);c.setRequestProperty("Accept",accept);c.setRequestProperty("User-Agent",UA);String cookie=cookieHeader(u.getHost());if(!cookie.isEmpty())c.setRequestProperty("Cookie",cookie);c.setUseCaches(false);return c;}
    private static byte[] read(InputStream in,int max) throws Exception {try(InputStream input=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=input.read(b))>0){if(out.size()+n>max)throw new IOException("E-H 响应过大");out.write(b,0,n);}return out.toByteArray();}}
    private String text(String url) throws Exception {HttpURLConnection c=open(url,"GET","text/html,*/*;q=0.8");try{int status=c.getResponseCode();if(status<200||status>=300)throw new IOException("E-H HTTP "+status);return new String(read(c.getInputStream(),8*1024*1024),StandardCharsets.UTF_8);}finally{c.disconnect();}}
    private String accountText(String url) throws Exception {if(!EhAccountStore.load(context).configured())throw new SecurityException("尚未配置 E-H 会话");HttpURLConnection c=open(url,"GET","text/html,*/*;q=0.8");try{int status=c.getResponseCode();URL end=c.getURL();if(status==401||status==403||end.getPath().contains("bounce_login")||end.getHost().startsWith("forums."))throw new SecurityException("E-H 会话无效或已过期");if(status<200||status>=300)throw new IOException("E-H HTTP "+status);String body=new String(read(c.getInputStream(),8*1024*1024),StandardCharsets.UTF_8);if(body.contains("act=Login&CODE=00")||body.contains("name=\"UserName\""))throw new SecurityException("E-H 会话无效或已过期");return body;}finally{c.disconnect();}}
    private JSONObject postJson(JSONObject body) throws Exception {HttpURLConnection c=open(API,"POST","application/json");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");try(OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}try{int status=c.getResponseCode();if(status<200||status>=300)throw new IOException("E-H API HTTP "+status);return new JSONObject(new String(read(c.getInputStream(),4*1024*1024),StandardCharsets.UTF_8));}finally{c.disconnect();}}

    private List<Comic> gdata(List<String[]> refs,String surface) throws Exception {List<Comic> out=new ArrayList<>();int batch=0;for(int offset=0;offset<refs.size();offset+=25){JSONArray ids=new JSONArray();for(int i=offset;i<Math.min(offset+25,refs.size());i++){String[] ref=refs.get(i);JSONArray pair=new JSONArray();pair.put(Long.parseLong(ref[0]));pair.put(ref[1]);ids.put(pair);}JSONObject request=new JSONObject();request.put("method","gdata");request.put("gidlist",ids);request.put("namespace",1);JSONArray rows=postJson(request).optJSONArray("gmetadata");if(rows==null)throw new IOException("E-H 元数据响应格式异常");for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(row!=null&&!row.has("error"))out.add(parseComic(row,surface));}batch++;if(offset+25<refs.size())Thread.sleep(batch%4==0?5000:250);}return out;}
    private Comic parseComic(JSONObject row,String surface){long gid=row.optLong("gid");String token=row.optString("token","").toLowerCase(Locale.ROOT);String id="eh:"+gid+":"+token;JSONArray arr=row.optJSONArray("tags");List<String> raw=new ArrayList<>(),tags=new ArrayList<>(),authors=new ArrayList<>(),groups=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){String value=arr.optString(i,"");addUnique(raw,value);addUnique(tags,tagValue(value));String ns=tagNamespace(value);if("artist".equals(ns))addUnique(authors,tagValue(value));if("group".equals(ns))addUnique(groups,tagValue(value));}String uploader=row.optString("uploader","");String author=!authors.isEmpty()?authors.get(0):!groups.isEmpty()?groups.get(0):uploader;double rating;try{rating=Double.parseDouble(row.optString("rating","NaN"));}catch(Exception e){rating=Double.NaN;}String cover=row.optString("thumb","");try{if(!cover.isEmpty())cover=publicHttps(cover).toString();}catch(Exception e){cover="";}return new Comic(id,gid+":"+token,row.optString("title","E-H Gallery "+gid),row.optString("title_jpn",""),author,groups.isEmpty()?"":groups.get(0),cover,row.optString("category",""),uploader,"UNKNOWN",tags,raw,authors,Math.max(0,row.optInt("filecount",0)),rating,row.optLong("posted",0),row.optLong("filesize",0),surface);}
    private static List<String> jsonStrings(JSONArray arr){ArrayList<String> out=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){String value=arr.optString(i,"").trim();if(!value.isEmpty()&&!out.contains(value))out.add(value);}return out;}
    private Comic relayComic(JSONObject row,String fallbackSurface){
        if(row==null)return null;
        String id=row.optString("comicId",""),remote=row.optString("providerRemoteId","");
        String title=row.optString("title",id.isEmpty()?"E-H Gallery":id);
        List<String> alternates=jsonStrings(row.optJSONArray("alternateTitles"));
        List<String> authors=jsonStrings(row.optJSONArray("authors"));
        List<String> tags=jsonStrings(row.optJSONArray("tags"));
        ArrayList<String> rawTags=new ArrayList<>();
        JSONArray canonical=row.optJSONArray("canonicalTags");
        if(canonical!=null)for(int i=0;i<canonical.length();i++){JSONObject tag=canonical.optJSONObject(i);if(tag!=null)addUnique(rawTags,tag.optString("raw",""));}
        JSONObject meta=row.optJSONObject("providerMetadata");
        if(rawTags.isEmpty()&&meta!=null){JSONArray raw=meta.optJSONArray("rawTags");if(raw!=null)rawTags.addAll(jsonStrings(raw));}
        List<String> categories=jsonStrings(row.optJSONArray("categories"));
        String surface=fallbackSurface;
        if(meta!=null){String preferred=meta.optString("preferredSurface","");if("eh".equals(preferred)||"exh".equals(preferred))surface=preferred;}
        long posted=0L;String created=row.optString("createdAt","");if(!created.isEmpty())try{posted=java.time.Instant.parse(created).getEpochSecond();}catch(Exception ignored){}
        long filesize=meta==null?0L:meta.optLong("filesize",0L);
        return new Comic(
            id,
            remote,
            title,
            alternates.isEmpty()?"":alternates.get(0),
            row.optString("author",""),
            row.optString("circle",""),
            row.optString("coverUrl",""),
            categories.isEmpty()?"":categories.get(0),
            row.optString("uploader",""),
            row.optString("completionStatus","UNKNOWN"),
            tags,
            rawTags,
            authors,
            Math.max(0,row.optInt("pagesCount",0)),
            row.optDouble("rating",Double.NaN),
            posted,
            Math.max(0L,filesize),
            surface
        );
    }
    private List<Comic> relayComics(JSONObject root,String surface){
        ArrayList<Comic> out=new ArrayList<>();JSONArray arr=root==null?null:root.optJSONArray("comics");if(arr!=null)for(int i=0;i<arr.length();i++){Comic comic=relayComic(arr.optJSONObject(i),surface);if(comic!=null&&!comic.id.isEmpty())out.add(comic);}return out;
    }
    private static List<String> relayCategories(EhOnlineFilterSpec spec){
        ArrayList<String> out=new ArrayList<>();if(spec==null||spec.includeCategories==EhOnlineFilterSpec.ALL)return out;
        int[] bits=EhOnlineFilterSpec.categoryBits();String[] values={"Doujinshi","Manga","Artist CG","Game CG","Image Set","Cosplay","Asian Porn","Non-H","Western","Misc"};
        for(int i=0;i<bits.length&&i<values.length;i++)if((spec.includeCategories&bits[i])!=0)out.add(values[i]);return out;
    }
    private static String relayMode(EhOnlineFilterSpec.Mode mode){return mode==null?"latest":mode.name().toLowerCase(Locale.ROOT);}

    private static LinkedHashMap<String,String[]> extractGalleryRefs(String html,int limit){Pattern p=Pattern.compile("(?:(?:https?:)?//(?:e-hentai\\.org|exhentai\\.org))?/g/(\\d+)/([0-9a-fA-F]{10})/",Pattern.CASE_INSENSITIVE);Matcher m=p.matcher(html==null?"":html);LinkedHashMap<String,String[]> refs=new LinkedHashMap<>();while(m.find()&&(limit<=0||refs.size()<limit)){String gid=m.group(1),token=m.group(2).toLowerCase(Locale.ROOT);refs.put(gid+":"+token,new String[]{gid,token});}return refs;}
    private EhCapabilityStore.Snapshot requireExhAvailable(){if(!accountAvailable(context))throw new SecurityException("ExH 需要先连接 E-H 账号或已登录的 Desktop");EhCapabilityStore.Snapshot capability=EhCapabilityStore.refresh(context,false);if(capability.available())return capability;if(capability.state==EhCapabilityStore.State.NETWORK_ERROR)throw new SecurityException("ExH 当前状态暂无法确认");throw new SecurityException("ExH 当前不可访问");}

    List<Comic> search(String query) throws Exception {return search(query,"eh");}
    List<Comic> search(String query,String surface) throws Exception {EhOnlineFilterSpec spec=new EhOnlineFilterSpec();spec.freeText=query==null?"":query;return browse(spec,surface);}
    List<Comic> browse(EhOnlineFilterSpec spec,String surface) throws Exception {if(spec==null)spec=new EhOnlineFilterSpec();boolean exh="exh".equals(surface);boolean needsAccount=spec.mode==EhOnlineFilterSpec.Mode.WATCHED||spec.mode==EhOnlineFilterSpec.Mode.FAVORITES;if(exh)requireExhAvailable();if(needsAccount&&!accountAvailable(context))throw new SecurityException("此 E-H 浏览方式需要登录账号或已登录的 Desktop");if(useDesktopAccountRelay()&&(exh||needsAccount)){JSONObject root=BridgeClient.ehRelaySearch(context,surface,spec.freeText,spec.includeTags,relayCategories(spec),relayMode(spec.mode),spec.toplist,spec.language,spec.excludeTags,spec.minRating,spec.pageFrom,spec.pageTo,50);return relayComics(root,surface);}paceSearch();String url=spec.buildUrl(surface);String html=(exh||needsAccount)?accountText(url):text(url);LinkedHashMap<String,String[]> refs=extractGalleryRefs(html,50);return refs.isEmpty()?Collections.emptyList():gdata(new ArrayList<>(refs.values()),surface);}
    Comic comic(String comicId) throws Exception {return comic(comicId,"eh");}
    Comic comic(String comicId,String surface) throws Exception {if("exh".equals(surface)&&useDesktopAccountRelay()){Comic value=relayComic(BridgeClient.ehRelayComic(context,comicId,surface).optJSONObject("comic"),surface);if(value==null)throw new IOException("Desktop 未返回 E-H 画廊元数据");return value;}String[] ref=parseId(comicId);List<Comic> values=gdata(Collections.singletonList(ref),surface);if(values.isEmpty())throw new IOException("E-H 未返回画廊元数据");return values.get(0);}
    List<Episode> episodes(String comicId) throws Exception {return episodes(comicId,"eh");}
    List<Episode> episodes(String comicId,String surface) throws Exception {if("exh".equals(surface)&&useDesktopAccountRelay()){JSONArray arr=BridgeClient.ehRelayEpisodes(context,comicId,surface).optJSONArray("episodes");ArrayList<Episode> out=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o!=null)out.add(new Episode(o.optString("id",""),o.optString("title","章节"),o.optInt("order",i+1)));}return out;}Comic comic=comic(comicId,surface);String[] ref=parseId(comicId);return Collections.singletonList(new Episode("eh-"+ref[0],comic.title,1));}

    private int cachedPageCount(String comicId){UnifiedCatalogStore.Entry cached=UnifiedCatalogStore.load(context).byId.get(comicId);return cached==null?0:Math.max(0,cached.knownPictures);}
    List<Page> pages(String comicId) throws Exception {return pages(comicId,cachedPageCount(comicId),"eh");}
    List<Page> pages(String comicId,String surface) throws Exception {return pages(comicId,cachedPageCount(comicId),surface);}
    List<Page> pages(String comicId,int expectedPages) throws Exception {return pages(comicId,expectedPages,"eh");}
    List<Page> pages(String comicId,int expectedPages,String surface) throws Exception {
        boolean exh="exh".equals(surface);if(exh)requireExhAvailable();
        if(exh&&useDesktopAccountRelay()){JSONArray arr=BridgeClient.ehRelayPages(context,comicId,surface).optJSONArray("pages");ArrayList<Page> out=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o==null)continue;String locator=o.optString("locator","");if(locator.isEmpty())continue;out.add(new Page(o.optString("id","eh-page-"+(i+1)),RELAY_PAGE_PREFIX+locator,o.optInt("position",i)+1));}return out;}
        int expected=Math.max(0,expectedPages);if(expected==0)expected=Math.max(0,comic(comicId,surface).pagesCount);
        String origin=exh?EXH_ORIGIN:ORIGIN;String[] ref=parseId(comicId);long gid=Long.parseLong(ref[0]);LinkedHashMap<String,String> urls=new LinkedHashMap<>();
        for(int page=0;page<100;page++){
            String url=origin+"/g/"+gid+"/"+ref[1]+"/?p="+page;String html=exh?accountText(url):text(url);List<String> found=parsePageLinks(html,origin,gid);int before=urls.size();
            for(String value:found){URL parsed=new URL(value);urls.putIfAbsent(parsed.getPath(),value);}
            if(expected>0&&urls.size()>=expected)break;
            if(found.isEmpty()){if(page==0)throw new IOException("E-H 画廊页没有找到图片入口");break;}
            if(urls.size()==before)break;
            Thread.sleep(100);
        }
        if(expected>0&&urls.size()<expected)throw new IOException("E-H 页列表不完整（"+urls.size()+"/"+expected+"）");
        List<Page> out=new ArrayList<>();int pos=0;for(String value:urls.values()){pos++;out.add(new Page("eh-"+gid+"-"+pos,value,pos));if(expected>0&&pos>=expected)break;}return out;
    }

    static List<String> parsePageLinks(String html,String origin,long gid) throws Exception {
        LinkedHashMap<String,String> out=new LinkedHashMap<>();String decoded=decodeHtml(html==null?"":html);
        Pattern p=Pattern.compile("(?:(?:https?:)?//(?:e-hentai\\.org|exhentai\\.org))?/s/[0-9a-fA-F]+/"+gid+"-\\d+",Pattern.CASE_INSENSITIVE);Matcher m=p.matcher(decoded);URL base=new URL(origin);
        while(m.find()){URL absolute=new URL(base,m.group());String host=absolute.getHost().toLowerCase(Locale.ROOT);if(!"e-hentai.org".equals(host)&&!"exhentai.org".equals(host))continue;if(!absolute.getPath().matches("^/s/[0-9a-fA-F]+/"+gid+"-\\d+$"))continue;out.putIfAbsent(absolute.getPath(),absolute.toString());}
        return new ArrayList<>(out.values());
    }

    void verifyAccount() throws Exception {if(useDesktopAccountRelay()){BridgeClient.ehRelaySearch(context,"eh","",Collections.emptyList(),Collections.emptyList(),"favorites","11","",Collections.emptyList(),0,0,0,1);return;}accountText(ORIGIN+"/favorites.php?favcat=all");}
    List<Comic> favoritesAll() throws Exception {return favoritesSnapshot().comics;}
    EhFavoriteSync favoritesSnapshot() throws Exception {
        if(useDesktopAccountRelay()){JSONObject root=BridgeClient.ehRelaySearch(context,"eh","",Collections.emptyList(),Collections.emptyList(),"favorites","11","",Collections.emptyList(),0,0,0,100);List<Comic> comics=relayComics(root,"eh");ArrayList<EhFavoriteSync.Item> items=new ArrayList<>();for(Comic comic:comics)items.add(new EhFavoriteSync.Item(comic.id,-1,""));ArrayList<String> categoryNames=new ArrayList<>();for(int i=0;i<10;i++)categoryNames.add("Favorites "+i);return new EhFavoriteSync(comics,items,categoryNames,new int[10]);}
        verifyAccount();List<String> categoryNames=parseFavoriteCategoryNames(accountText(ORIGIN+"/uconfig.php"));LinkedHashMap<String,String[]> refs=new LinkedHashMap<>();LinkedHashMap<String,FavoriteMeta> metaById=new LinkedHashMap<>();Set<String> cursors=new HashSet<>();String url=ORIGIN+"/favorites.php?favcat=all";Pattern next=Pattern.compile("(?:\\?|&amp;|&)next=(\\d+)");
        for(int page=0;page<200;page++){String html=accountText(url);refs.putAll(extractGalleryRefs(html,0));parseFavoriteRows(html,categoryNames,metaById);Matcher nm=next.matcher(html);String cursor="";if(nm.find())cursor=nm.group(1);if(cursor.isEmpty()||!cursors.add(cursor))break;url=ORIGIN+"/favorites.php?favcat=all&next="+URLEncoder.encode(cursor,"UTF-8");Thread.sleep(250);}
        List<Comic> comics=refs.isEmpty()?Collections.emptyList():gdata(new ArrayList<>(refs.values()),"eh");ArrayList<EhFavoriteSync.Item> items=new ArrayList<>();int[] counts=new int[10];for(Comic comic:comics){FavoriteMeta meta=metaById.get(comic.id);int slot=meta==null?-1:meta.slot;String note=meta==null?"":meta.note;items.add(new EhFavoriteSync.Item(comic.id,slot,note));if(slot>=0&&slot<10)counts[slot]++;}return new EhFavoriteSync(comics,items,categoryNames,counts);
    }
    static List<String> parseFavoriteCategoryNames(String html){ArrayList<String> names=new ArrayList<>();for(int i=0;i<10;i++)names.add("Favorites "+i);Pattern p=Pattern.compile("<input[^>]*name=[\"']favorite_(\\d)[\"'][^>]*>",Pattern.CASE_INSENSITIVE);Matcher m=p.matcher(html==null?"":html);while(m.find()){int slot=Integer.parseInt(m.group(1));String value=attribute(m.group(),"value");if(slot>=0&&slot<10&&!value.isEmpty())names.set(slot,decodeHtml(value));}return names;}
    private static void parseFavoriteRows(String html,List<String> categoryNames,Map<String,FavoriteMeta> out){String source=html==null?"":html;Pattern posted=Pattern.compile("<[^>]*id=[\"']posted_(\\d+)[\"'][^>]*>",Pattern.CASE_INSENSITIVE),note=Pattern.compile("<[^>]*id=[\"']favnote_(\\d+)[\"'][^>]*>([^<]*)<",Pattern.CASE_INSENSITIVE);Map<String,String> notes=new HashMap<>();Matcher nm=note.matcher(source);while(nm.find())notes.put(nm.group(1),decodeHtml(nm.group(2)).trim());Matcher pm=posted.matcher(source);while(pm.find()){String gid=pm.group(1),name=decodeHtml(attribute(pm.group(),"title")).trim();int slot=-1;for(int i=0;i<categoryNames.size();i++)if(categoryNames.get(i).equals(name)){slot=i;break;}String keyPrefix="eh:"+gid+":";FavoriteMeta meta=new FavoriteMeta(slot,notes.getOrDefault(gid,""));for(String id:new ArrayList<>(out.keySet()))if(id.startsWith(keyPrefix))out.put(id,meta);if(slot>=0||!meta.note.isEmpty())out.put("gid:"+gid,meta);}for(String key:new ArrayList<>(out.keySet()))if(key.startsWith("gid:")){String gid=key.substring(4);FavoriteMeta meta=out.remove(key);Pattern gp=Pattern.compile("(?:(?:https?:)?//e-hentai\\.org)?/g/"+Pattern.quote(gid)+"/([0-9a-fA-F]{10})/",Pattern.CASE_INSENSITIVE);Matcher gm=gp.matcher(source);if(gm.find())out.put("eh:"+gid+":"+gm.group(1).toLowerCase(Locale.ROOT),meta);}}
    private static String attribute(String tag,String name){Matcher m=Pattern.compile("\\b"+Pattern.quote(name)+"\\s*=\\s*[\"']([^\"']*)[\"']",Pattern.CASE_INSENSITIVE).matcher(tag==null?"":tag);return m.find()?m.group(1):"";}

    String probeExH(){
        if(useDesktopAccountRelay())try{return BridgeClient.ehRelayExhCapability(context).optString("capability","UNAVAILABLE");}catch(Exception e){return "NETWORK_ERROR";}
        if(!EhAccountStore.load(context).configured())return "UNAVAILABLE";
        try{String result=probeExHOnce();if("RETRY".equals(result))result=probeExHOnce();return "RETRY".equals(result)?"UNAVAILABLE":result;}
        catch(SocketTimeoutException|UnknownHostException|ConnectException|SSLException e){return "NETWORK_ERROR";}
        catch(Exception e){return "NETWORK_ERROR";}
    }
    private String probeExHOnce() throws Exception {
        HttpURLConnection c=null;try{
            c=open(EXH_ORIGIN+"/uconfig.php","GET","text/html,*/*;q=0.8");int status=c.getResponseCode();boolean updated=captureSessionCookies(c);URL end=c.getURL();
            if(status==401||status==403||status==404||end.getPath().contains("bounce_login")||!"exhentai.org".equalsIgnoreCase(end.getHost()))return updated?"RETRY":"UNAVAILABLE";
            if(status<200||status>=300)return "NETWORK_ERROR";
            String body=new String(read(c.getInputStream(),2*1024*1024),StandardCharsets.UTF_8);if(body.trim().isEmpty()||body.contains("Sad Panda")||body.contains("act=Login"))return updated?"RETRY":"UNAVAILABLE";return "AVAILABLE";
        }finally{if(c!=null)c.disconnect();}
    }
    private boolean captureSessionCookies(HttpURLConnection c) throws Exception {
        String ign=responseCookie(c,"igneous"),cf=responseCookie(c,"cf_clearance");EhAccountStore.Session old=EhAccountStore.load(context);String nextIgn=usableCookie(ign)?ign:old.igneous,nextCf=usableCookie(cf)?cf:old.cfClearance;
        if(nextIgn.equals(old.igneous)&&nextCf.equals(old.cfClearance))return false;EhAccountStore.save(context,new EhAccountStore.Session(old.memberId,old.passHash,nextIgn,nextCf));return true;
    }
    private static boolean usableCookie(String value){return value!=null&&!value.isEmpty()&&!"mystery".equalsIgnoreCase(value)&&!"deleted".equalsIgnoreCase(value);}
    private static String responseCookie(HttpURLConnection c,String name){Map<String,List<String>> headers=c.getHeaderFields();if(headers==null)return "";for(Map.Entry<String,List<String>> entry:headers.entrySet()){if(entry.getKey()==null||!"set-cookie".equalsIgnoreCase(entry.getKey())||entry.getValue()==null)continue;for(String raw:entry.getValue()){if(raw==null)continue;for(String part:raw.split(";")){String item=part.trim();int at=item.indexOf('=');if(at<=0)continue;if(name.equalsIgnoreCase(item.substring(0,at).trim()))return item.substring(at+1).trim();break;}}}return "";}

    void setRemoteFavorite(String comicId,boolean desired) throws Exception {setRemoteFavorite(comicId,desired?0:-1,"");}
    void setRemoteFavorite(String comicId,int slot,String note) throws Exception {if(useDesktopAccountRelay()){BridgeClient.ehRelayFavorite(context,comicId,slot>=0,slot<0?0:slot,note==null?"":note);return;}if(!EhAccountStore.load(context).configured())throw new SecurityException("尚未配置 E-H 会话");if(slot<-1||slot>9)throw new IllegalArgumentException("无效的 E-H 收藏分类");String[] ref=parseId(comicId);String url=ORIGIN+"/gallerypopups.php?gid="+URLEncoder.encode(ref[0],"UTF-8")+"&t="+URLEncoder.encode(ref[1],"UTF-8")+"&act=addfav";HttpURLConnection c=open(url,"POST","text/html,*/*;q=0.8");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/x-www-form-urlencoded");String favcat=slot<0?"favdel":String.valueOf(slot);String form="favcat="+URLEncoder.encode(favcat,"UTF-8")+"&favnote="+URLEncoder.encode(note==null?"":note,"UTF-8")+"&apply="+URLEncoder.encode("Apply Changes","UTF-8")+"&update=1";try(OutputStream out=c.getOutputStream()){out.write(form.getBytes(StandardCharsets.UTF_8));}try{int status=c.getResponseCode();URL end=c.getURL();if(status==401||status==403||end.getPath().contains("bounce_login")||end.getHost().startsWith("forums."))throw new SecurityException("E-H 会话无效或已过期");if(status<200||status>=300)throw new IOException("E-H 收藏更新 HTTP "+status);try{read(c.getInputStream(),1024*1024);}catch(Exception ignored){}}finally{c.disconnect();}}

    HttpURLConnection thumbnail(String url) throws Exception {HttpURLConnection c=(HttpURLConnection)publicHttps(url).openConnection();c.setConnectTimeout(8000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(true);c.setRequestProperty("Accept","image/*");c.setRequestProperty("Referer",ORIGIN+"/");c.setRequestProperty("User-Agent",UA);c.setUseCaches(false);return c;}
    HttpURLConnection image(String pageUrl) throws Exception {
        if(pageUrl!=null&&pageUrl.startsWith(RELAY_PAGE_PREFIX))return BridgeClient.ehRelayImage(context,pageUrl.substring(RELAY_PAGE_PREFIX.length()));
        URL page=new URL(pageUrl);String host=page.getHost()==null?"":page.getHost().toLowerCase(Locale.ROOT);boolean exh="exhentai.org".equals(host);if(!"https".equalsIgnoreCase(page.getProtocol())||(!"e-hentai.org".equals(host)&&!exh)||!page.getPath().matches("^/s/[0-9a-fA-F]+/\\d+-\\d+$"))throw new SecurityException("无效的 E-H 图片页");
        String html=exh?accountText(page.toString()):text(page.toString());Matcher first=Pattern.compile("<img[^>]+id=[\"']img[\"'][^>]+src=[\"']([^\"']+)[\"']",Pattern.CASE_INSENSITIVE).matcher(html);Matcher second=Pattern.compile("<img[^>]+src=[\"']([^\"']+)[\"'][^>]+id=[\"']img[\"']",Pattern.CASE_INSENSITIVE).matcher(html);String imageUrl=first.find()?first.group(1):second.find()?second.group(1):"";if(imageUrl.isEmpty())throw new IOException("E-H 图片页没有可读取图片");URL resolved=new URL(page,decodeHtml(imageUrl));URL image=publicHttps(resolved.toString());HttpURLConnection c=(HttpURLConnection)image.openConnection();c.setConnectTimeout(8000);c.setReadTimeout(20000);c.setInstanceFollowRedirects(true);c.setRequestProperty("Accept","image/*");c.setRequestProperty("Referer",page.toString());c.setRequestProperty("User-Agent",UA);String cookie=cookieHeader(image.getHost());if(!cookie.isEmpty())c.setRequestProperty("Cookie",cookie);c.setUseCaches(false);return c;
    }
}
