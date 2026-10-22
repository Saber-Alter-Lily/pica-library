package org.picalibrary.sources;

import io.github.jukomu.jmcomic.api.client.JmClient;
import io.github.jukomu.jmcomic.api.model.*;
import io.github.jukomu.jmcomic.core.JmComic;
import io.github.jukomu.jmcomic.core.client.AbstractJmClient;
import io.github.jukomu.jmcomic.core.config.JmConfiguration;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Thin shared adapter over the maintained MIT SDK. No provider protocol is reimplemented here. */
public final class JmSource implements AutoCloseable {
    public static final String SDK_VERSION="v1.1.12";
    private JmClient client;
    private String accountId="",accountName="";
    private String proxyHost="";private int proxyPort;
    private final Map<String,JmImage> imageLocators=new LinkedHashMap<>();

    public JmSource() {}
    public JmSource(JmClient client) { this.client=Objects.requireNonNull(client); }

    private JmClient client() throws Exception {
        JmConfiguration.Builder configuration=new JmConfiguration.Builder()
                .timeout(Duration.ofSeconds(12)).imageTimeout(Duration.ofSeconds(20))
                .retryTimes(1).downloadThreadPoolSize(2).cacheSize(8*1024*1024)
                .closeTimeoutMs(1500);
        if(!proxyHost.isEmpty())configuration.proxy(proxyHost,proxyPort);
        if(client==null)client=JmComic.newApiClientAsync(configuration.build()).get(45,TimeUnit.SECONDS);
        return client;
    }

    public synchronized void configureProxy(String host,int port){
        String value=clean(host);if(value.length()>253||(!value.isEmpty()&&(port<1||port>65535)))throw new IllegalArgumentException("无效的 JM 代理");
        if(!value.equals(proxyHost)||port!=proxyPort){close();proxyHost=value;proxyPort=port;}
    }

    public static String imageContentType(byte[] bytes){
        if(bytes.length>=8&&bytes[0]==(byte)0x89&&bytes[1]=='P'&&bytes[2]=='N'&&bytes[3]=='G')return "image/png";
        if(bytes.length>=12&&bytes[0]=='R'&&bytes[1]=='I'&&bytes[2]=='F'&&bytes[3]=='F'&&bytes[8]=='W'&&bytes[9]=='E'&&bytes[10]=='B'&&bytes[11]=='P')return "image/webp";
        if(bytes.length>=6&&bytes[0]=='G'&&bytes[1]=='I'&&bytes[2]=='F')return "image/gif";
        return "image/jpeg";
    }

    public synchronized Map<String,Object> status(){return map("configured",!accountId.isEmpty(),"accountId",accountId,"username",accountName,"sdkVersion",SDK_VERSION);}

    public synchronized Map<String,Object> login(String username,String password) throws Exception {
        if(username==null||username.trim().isEmpty()||password==null||password.isEmpty())throw new IllegalArgumentException("JM 用户名和密码不能为空");
        // Discard the previous identity before trying another account; failed login cannot retain it.
        accountId="";accountName="";imageLocators.clear();
        if(client instanceof AbstractJmClient)((AbstractJmClient)client).setCookies(Collections.emptyList());
        JmUserInfo user=client().login(username,password);
        if(user==null||clean(user.uid()).isEmpty()||clean(user.username()).isEmpty())throw new IllegalStateException("JM 未返回已验证的账号身份");
        accountId=user.uid();accountName=user.username();return status();
    }

    public synchronized Map<String,Object> favorites(int folder,int page) throws Exception {
        if(accountId.isEmpty())throw new IllegalStateException("请先登录本机 JM 账号");
        checkPage(page);if(folder<0)throw new IllegalArgumentException("无效的收藏夹");
        JmFavoritePage result=client().getFavorites(new FavoriteQuery.Builder().folderId(folder).page(page).build());
        if(result==null||result.currentPage()!=page||result.folderId()!=folder||result.totalItems()<0||result.totalPages()<0)throw new IllegalStateException("JM 收藏分页响应不完整");
        List<Map<String,Object>> items=new ArrayList<>();
        for(JmAlbumMeta item:nonNull(result.content()))items.add(summary(item));
        return map("accountId",accountId,"username",accountName,"page",page,"folderId",folder,"total",result.totalItems(),"pages",result.totalPages(),"folders",result.folderList()==null?Collections.emptyMap():result.folderList(),"items",items);
    }

    public synchronized Map<String,Object> search(String keyword,int page) throws Exception {
        checkPage(page);String query=clean(keyword);if(query.length()>160)throw new IllegalArgumentException("搜索词过长");
        SearchQuery input=new SearchQuery.Builder().text(query).page(page).build();
        JmSearchPage result=query.isEmpty()?client().getCategories(input):client().search(input);
        List<Map<String,Object>> items=new ArrayList<>();for(JmAlbumMeta item:nonNull(result.content()))items.add(summary(item));
        return map("page",result.currentPage(),"pages",result.totalPages(),"total",result.totalItems(),"items",items);
    }

    public synchronized Map<String,Object> details(String comicId) throws Exception {return album(client().getAlbum(remote(comicId,"jm:")));}

    public synchronized List<Map<String,Object>> episodes(String comicId) throws Exception {
        JmAlbum album=client().getAlbum(remote(comicId,"jm:"));List<Map<String,Object>> out=new ArrayList<>();
        List<JmPhotoMeta> chapters=album.photoMetas();if(chapters==null||chapters.isEmpty())chapters=Collections.singletonList(new JmPhotoMeta(album.id(),album.title(),1));
        for(JmPhotoMeta photo:chapters)out.add(map("id","jm-chapter:"+numeric(photo.id()),"title",clean(photo.title()),"order",photo.sortOrder(),"updated_at",""));
        return out;
    }

    public synchronized List<Map<String,Object>> pages(String episodeId) throws Exception {
        JmPhoto photo=client().getPhoto(remote(episodeId,"jm-chapter:"));List<Map<String,Object>> out=new ArrayList<>();int position=0;
        for(JmImage image:nonNull(photo.images())){
            String locator="jm-page:"+numeric(photo.id())+":"+(++position);imageLocators.put(locator,image);
            out.add(map("id",locator,"name",clean(image.getFilename()),"url",locator,"path",locator,"fileServer","","epTitle",clean(photo.title()),"media",map("originalName",clean(image.getFilename()),"path",locator,"fileServer","")));
        }
        // Only locators obtained from this SDK session may be fetched; no arbitrary URL input.
        while(imageLocators.size()>3000)imageLocators.remove(imageLocators.keySet().iterator().next());
        return out;
    }

    public synchronized byte[] image(String locator,int maxBytes) throws Exception {
        if(maxBytes<1||maxBytes>20*1024*1024)throw new IllegalArgumentException("图片大小限制无效");
        JmImage image=imageLocators.get(locator);if(image==null)throw new IllegalStateException("页面已过期，请重新打开章节");
        byte[] bytes=client().fetchImageBytes(image);if(bytes==null||bytes.length==0||bytes.length>maxBytes)throw new IllegalStateException("JM 图片为空或超出大小限制");return bytes;
    }

    public synchronized void close(){
        accountId="";accountName="";imageLocators.clear();
        if(client instanceof AbstractJmClient)((AbstractJmClient)client).close();client=null;
    }

    private static Map<String,Object> summary(JmAlbumMeta item){
        Map<String,Object> out=base(item.id(),item.title(),item.authors(),item.tags(),item.description(),item.image());
        out.put("categories",categories(item.category(),item.subCategory()));return out;
    }
    private static Map<String,Object> album(JmAlbum item){
        Map<String,Object> out=base(item.id(),item.title(),item.authors(),item.tags(),item.description(),item.image());
        out.put("pagesCount",item.pageCount());out.put("epsCount",item.photoMetas()==null?1:item.photoMetas().size());out.put("categories",categories(item.category(),item.subCategory()));
        Map<String,Object> metadata=map("metadataCompleteness","DETAIL","works",nonNull(item.works()),"characters",nonNull(item.actors()),"remoteFavorite",item.isFavorite(),"sdkVersion",SDK_VERSION);
        out.put("providerMetadata",metadata);return out;
    }
    private static Map<String,Object> base(String id,String title,List<String> authors,List<String> tags,String description,String cover){
        String remote=numeric(id);List<String> safeAuthors=nonNull(authors),safeTags=nonNull(tags);List<Map<String,Object>> canonical=new ArrayList<>();
        for(String tag:safeTags)canonical.add(map("raw",tag,"namespace",null,"value",tag,"facet","OTHER"));
        Map<String,Object> out=map("providerId","jm","providerRemoteId",remote,"comicId","jm:"+remote,"title",clean(title),"alternateTitles",Collections.emptyList(),"author",String.join(" / ",safeAuthors),"authors",safeAuthors,"circle",null,"description",clean(description),"chineseTeam","","categories",Collections.emptyList(),"tags",safeTags,"canonicalTags",canonical,"completionStatus","UNKNOWN","providerMetadata",map("metadataCompleteness","SUMMARY","sdkVersion",SDK_VERSION));
        if(cover!=null&&cover.startsWith("https://"))out.put("coverUrl",cover);return out;
    }
    private static List<String> categories(JmCategoryMeta... values){List<String> out=new ArrayList<>();for(JmCategoryMeta value:values)if(value!=null&&!clean(value.title()).isEmpty())out.add(value.title());return out;}
    private static void checkPage(int page){if(page<1||page>10000)throw new IllegalArgumentException("无效的页码");}
    private static String remote(String id,String prefix){if(id==null||!id.startsWith(prefix))throw new IllegalArgumentException("无效的 JM 标识");return numeric(id.substring(prefix.length()));}
    private static String numeric(String id){if(id==null||!id.matches("[1-9][0-9]{0,14}"))throw new IllegalArgumentException("无效的 JM 作品或章节标识");return id;}
    private static String clean(String value){return value==null?"":value.trim();}
    private static <T> List<T> nonNull(List<T> value){return value==null?Collections.emptyList():value;}
    public static Map<String,Object> map(Object... values){Map<String,Object> out=new LinkedHashMap<>();for(int i=0;i<values.length;i+=2)out.put((String)values[i],values[i+1]);return out;}
}
