package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.json.*;

/** Native Android implementation of the same Pica protocol used by Desktop. */
final class PicaClient {
    private static final String API="https://picaapi.picacomic.com/";
    private static final String API_KEY="C69BAF41DA5ABD1FFEDC6D2FEA56B",NONCE="b1ab87b4800d4d4590a11701b8551afa",SECRET="~d}$Q7$eIni=V)9\\RK/P.RM4;9[7|@/CA}b~OW!3?EV`:<>M7pddUBL5n|0/*Cn";
    private final Context context;private String token;
    static final class Comic {
        final String id,title,author,description,coverUrl,chineseTeam;final List<String> tags,categories;final boolean finished,favorite;final int pagesCount,epsCount,totalLikes,totalViews;
        Comic(String id,String title,String author,String description,String coverUrl,String chineseTeam,List<String> tags,List<String> categories,boolean finished,boolean favorite,int pagesCount,int epsCount,int totalLikes,int totalViews){this.id=id;this.title=title;this.author=author;this.description=description;this.coverUrl=coverUrl;this.chineseTeam=chineseTeam;this.tags=tags;this.categories=categories;this.finished=finished;this.favorite=favorite;this.pagesCount=pagesCount;this.epsCount=epsCount;this.totalLikes=totalLikes;this.totalViews=totalViews;}
    }
    static final class Episode {final String id,title;final int order;Episode(String id,String title,int order){this.id=id;this.title=title;this.order=order;}}
    static final class Page {final String id,url,name;final int position;Page(String id,String url,String name,int position){this.id=id;this.url=url;this.name=name;this.position=position;}}
    static final class ComicPage {final List<Comic> comics;final int page,pages,total;ComicPage(List<Comic> comics,int page,int pages,int total){this.comics=comics;this.page=page;this.pages=pages;this.total=total;}}

    PicaClient(Context context){this.context=context.getApplicationContext();this.token=PicaAccountStore.load(this.context).token;}
    boolean configured(){return PicaAccountStore.load(context).configured();}
    void register(java.util.Map<String,String> payload) throws Exception { requestRaw("POST","auth/register",new JSONObject(payload),""); }
    String login(String account,String password) throws Exception {JSONObject body=new JSONObject();body.put("email",account);body.put("password",password);JSONObject data=requestRaw("POST","auth/sign-in",body,"");String next=data.optString("token","");if(next.isEmpty())throw new IOException("Pica 登录响应缺少 token");token=next;PicaAccountStore.saveSession(context,account,password,next);return next;}
    void ensureLogin() throws Exception {PicaAccountStore.Session session=PicaAccountStore.load(context);if(token!=null&&!token.isEmpty())return;if(session.token!=null&&!session.token.isEmpty()){token=session.token;return;}if(session.account.isEmpty()||session.password.isEmpty())throw new IllegalStateException("请先配置 Pica 账号");login(session.account,session.password);}

    Comic comic(String id) throws Exception {JSONObject data=request("GET","comics/"+encode(id),null);return parseComic(data.optJSONObject("comic"));}
    List<Episode> episodes(String comicId) throws Exception {ensureLogin();List<Episode> out=new ArrayList<>();int page=1,pages=1;do{JSONObject data=request("GET","comics/"+encode(comicId)+"/eps?page="+page,null);JSONObject root=data.optJSONObject("eps");if(root==null)break;pages=Math.max(1,root.optInt("pages",1));JSONArray docs=root.optJSONArray("docs");if(docs!=null)for(int i=0;i<docs.length();i++){JSONObject o=docs.optJSONObject(i);if(o!=null)out.add(new Episode(o.optString("_id",o.optString("id","")),o.optString("title","章节"),o.optInt("order",i+1)));}page++;}while(page<=pages);out.sort(Comparator.comparingInt(e->e.order));return out;}
    List<Page> pages(String comicId,int order) throws Exception {ensureLogin();List<Page> out=new ArrayList<>();int page=1,pages=1,position=0;do{JSONObject data=request("GET","comics/"+encode(comicId)+"/order/"+order+"/pages?page="+page,null);JSONObject root=data.optJSONObject("pages");if(root==null)break;pages=Math.max(1,root.optInt("pages",1));JSONArray docs=root.optJSONArray("docs");if(docs!=null)for(int i=0;i<docs.length();i++){JSONObject o=docs.optJSONObject(i);if(o==null)continue;JSONObject media=o.optJSONObject("media");String url=mediaUrl(media);if(url.isEmpty())continue;out.add(new Page(o.optString("_id","p"+position),url,media==null?"":media.optString("originalName",""),position++));}page++;}while(page<=pages);return out;}
    ComicPage search(String keyword,int page,String sort,List<String> categories) throws Exception {JSONObject body=new JSONObject();body.put("keyword",keyword==null?"":keyword);body.put("sort",sort==null||sort.isEmpty()?"ld":sort);body.put("categories",new JSONArray(categories==null?Collections.emptyList():categories));JSONObject data=request("POST","comics/advanced-search?page="+Math.max(1,page),body);return parseComicPage(data.optJSONObject("comics"));}
    ComicPage browse(String category,String tag,String sort,int page) throws Exception {StringBuilder path=new StringBuilder("comics?page=").append(Math.max(1,page));if(category!=null&&!category.isEmpty())path.append("&c=").append(encode(category));if(tag!=null&&!tag.isEmpty())path.append("&t=").append(encode(tag));if(sort!=null&&!sort.isEmpty())path.append("&s=").append(encode(sort));JSONObject data=request("GET",path.toString(),null);return parseComicPage(data.optJSONObject("comics"));}
    static String normalizeLeaderboardRange(String range){return "D7".equals(range)||"D30".equals(range)?range:"H24";}
    List<Comic> leaderboard() throws Exception {return leaderboard("H24");}
    List<Comic> leaderboard(String range) throws Exception {String tt=normalizeLeaderboardRange(range);JSONObject data=request("GET","comics/leaderboard?tt="+tt+"&ct=VC",null);return parseComics(data.optJSONArray("comics"));}
    List<Comic> related(String comicId) throws Exception {JSONObject data=request("GET","comics/"+encode(comicId)+"/recommendation",null);return parseComics(data.optJSONArray("comics"));}
    ComicPage favorites(int page,String sort) throws Exception {JSONObject data=request("GET","users/favourite?page="+Math.max(1,page)+"&s="+encode(sort==null||sort.isEmpty()?"dd":sort),null);return parseComicPage(data.optJSONObject("comics"));}
    List<Comic> favoritesAll() throws Exception {List<Comic> out=new ArrayList<>();ComicPage first=favorites(1,"dd");out.addAll(first.comics);for(int page=2;page<=first.pages;page++)out.addAll(favorites(page,"dd").comics);return out;}
    List<String> categories() throws Exception {JSONObject data=request("GET","categories",null);JSONArray arr=data.optJSONArray("categories");List<String> out=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){Object value=arr.opt(i);if(value instanceof JSONObject){String title=((JSONObject)value).optString("title",((JSONObject)value).optString("name",""));if(!title.isEmpty())out.add(title);}else if(value!=null&&!String.valueOf(value).isEmpty())out.add(String.valueOf(value));}return out;}
    void toggleFavorite(String comicId) throws Exception {request("POST","comics/"+encode(comicId)+"/favourite",new JSONObject());}
    boolean setFavorite(String comicId,boolean desired) throws Exception {Comic before=comic(comicId);if(before.id.isEmpty())throw new IOException("Pica 漫画不存在");if(before.favorite==desired)return false;toggleFavorite(comicId);Comic after=comic(comicId);if(after.favorite!=desired)throw new IOException("Pica 收藏状态未能得到远端确认");return true;}

    HttpURLConnection media(String target) throws Exception {URL u=new URL(target);if(!"https".equalsIgnoreCase(u.getProtocol())&&!"http".equalsIgnoreCase(u.getProtocol()))throw new IOException("不支持的 Pica 图片地址");HttpURLConnection c=(HttpURLConnection)u.openConnection();c.setConnectTimeout(6000);c.setReadTimeout(30000);c.setRequestProperty("Accept","image/*,application/octet-stream");c.setRequestProperty("User-Agent","okhttp/3.8.1");c.setInstanceFollowRedirects(true);c.setUseCaches(false);return c;}

    private JSONObject request(String method,String path,JSONObject body) throws Exception {try{ensureLogin();return requestRaw(method,path,body,token);}catch(AuthException first){PicaAccountStore.clearToken(context);token="";PicaAccountStore.Session session=PicaAccountStore.load(context);if(session.account.isEmpty()||session.password.isEmpty())throw new IOException("Pica 登录已失效，请重新登录");login(session.account,session.password);return requestRaw(method,path,body,token);}}
    private JSONObject requestRaw(String method,String path,JSONObject body,String auth) throws Exception {
        String clean=path.replaceAll("^/+|/+$","");HttpURLConnection c=(HttpURLConnection)new URL(API+clean).openConnection();c.setRequestMethod(method);c.setConnectTimeout(7000);c.setReadTimeout(20000);c.setUseCaches(false);c.setRequestProperty("api-key",API_KEY);c.setRequestProperty("accept","application/vnd.picacomic.com.v1+json");c.setRequestProperty("app-channel","2");c.setRequestProperty("nonce",NONCE);c.setRequestProperty("app-version","2.2.1.2.3.3");c.setRequestProperty("app-uuid","defaultUuid");c.setRequestProperty("app-platform","android");c.setRequestProperty("app-build-version","45");c.setRequestProperty("Content-Type","application/json; charset=UTF-8");c.setRequestProperty("User-Agent","okhttp/3.8.1");c.setRequestProperty("image-quality","original");String time=String.valueOf(System.currentTimeMillis()/1000L);c.setRequestProperty("time",time);c.setRequestProperty("signature",signature(clean,time,method));if(auth!=null&&!auth.isEmpty())c.setRequestProperty("authorization",auth);
        if(body!=null&&(method.equals("POST")||method.equals("PUT")||method.equals("PATCH"))){c.setDoOutput(true);byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);try(OutputStream out=c.getOutputStream()){out.write(bytes);}}
        int status=c.getResponseCode();InputStream stream=status>=400?c.getErrorStream():c.getInputStream();String text=read(stream);c.disconnect();
        if(clean.equals("auth/register") || clean.equals("auth/sign-in")) {
            if(status==429)throw new IOException("PICA_ACCOUNT_RATE_LIMIT");
            if(status>=500)throw new IOException("PICA_ACCOUNT_UNAVAILABLE");
            if(status<200||status>=300)throw new IOException("PICA_ACCOUNT_REJECTED");
            try {
                JSONObject root=new JSONObject(text);
                if(root.optInt("code",0)!=200)throw new IOException("PICA_ACCOUNT_REJECTED");
                JSONObject data=root.optJSONObject("data");
                return data==null?new JSONObject():data;
            } catch(org.json.JSONException error) { throw new IOException("PICA_ACCOUNT_RESPONSE_INVALID"); }
        }
        if(status==401||status==403)throw new AuthException();if(status<200||status>=300)throw new IOException("Pica HTTP "+status+(text.isEmpty()?"":" · "+shortText(text)));JSONObject root=new JSONObject(text);if(root.optInt("code",200)!=200)throw new IOException(root.optString("message",root.optString("error","Pica 请求失败")));JSONObject data=root.optJSONObject("data");return data==null?new JSONObject():data;
    }
    private static String signature(String path,String time,String method) throws Exception {String raw=(path+time+NONCE+method+API_KEY).toLowerCase(Locale.ROOT);Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));byte[] digest=mac.doFinal(raw.getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte b:digest)out.append(String.format(Locale.ROOT,"%02x",b));return out.toString();}
    private static String read(InputStream in) throws IOException {if(in==null)return "";try(InputStream source=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=source.read(b))>0){if(out.size()+n>8*1024*1024)throw new IOException("Pica 响应过大");out.write(b,0,n);}return out.toString("UTF-8");}}
    private static String shortText(String value){String s=value.replace('\n',' ').replace('\r',' ');return s.length()>160?s.substring(0,160):s;}
    private static String encode(String value) throws Exception {return java.net.URLEncoder.encode(value==null?"":value,"UTF-8").replace("+","%20");}
    private static String mediaUrl(JSONObject media){if(media==null)return "";String server=media.optString("fileServer","").replaceAll("/+$","");String path=media.optString("path","").replaceAll("^/+","");return server.isEmpty()||path.isEmpty()?"":server+"/static/"+path;}
    private static Comic parseComic(JSONObject o){if(o==null)return new Comic("","未命名漫画","未知作者","","","",new ArrayList<>(),new ArrayList<>(),false,false,0,0,0,0);String id=o.optString("_id",o.optString("id","")),author=o.optString("author","未知作者"),cover=mediaUrl(o.optJSONObject("thumb"));int likes=o.optInt("totalLikes",o.optInt("likesCount",0)),views=o.optInt("totalViews",o.optInt("viewsCount",0));return new Comic(id,o.optString("title","未命名漫画"),author,o.optString("description",""),cover,o.optString("chineseTeam",""),strings(o.optJSONArray("tags")),strings(o.optJSONArray("categories")),o.optBoolean("finished",false),o.optBoolean("isFavourite",false),o.optInt("pagesCount",0),o.optInt("epsCount",0),likes,views);}
    private static List<Comic> parseComics(JSONArray arr){List<Comic> out=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o!=null)out.add(parseComic(o));}return out;}
    private static ComicPage parseComicPage(JSONObject root){if(root==null)return new ComicPage(new ArrayList<>(),1,1,0);return new ComicPage(parseComics(root.optJSONArray("docs")),root.optInt("page",1),root.optInt("pages",1),root.optInt("total",0));}
    private static List<String> strings(JSONArray arr){List<String> out=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){String value=arr.optString(i,"").trim();if(!value.isEmpty())out.add(value);}return out;}
    private static final class AuthException extends Exception {}
}
