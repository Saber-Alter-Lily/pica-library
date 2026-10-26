package com.picalibrary.android;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.picalibrary.android.sources.SourceAccessPolicy;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.function.LongSupplier;
import org.json.*;

/** Direct phone -> user's Host. No Desktop, provider SDK, default host, extension or catalog import. */
final class HostSourceManager {
    static final long TTL=15*60*1000L;
    private static final Map<String,HostSourceManager> INSTANCES=new HashMap<>();
    static synchronized HostSourceManager get(Context context){Context app=context.getApplicationContext();String key=app.getFilesDir().getAbsolutePath();HostSourceManager manager=INSTANCES.get(key);if(manager==null){manager=new HostSourceManager(app,null,SystemClock::elapsedRealtime);INSTANCES.put(key,manager);}return manager;}
    static synchronized void resetForTests(){for(HostSourceManager manager:INSTANCES.values())manager.end();INSTANCES.clear();}
    private final Context context;private final HostConfigStore store;private final Handler main=new Handler(Looper.getMainLooper());private final LongSupplier clock;
    private HostConfigStore.Config config;private String storageError="";private HostHttp http;private Session active;
    HostSourceManager(Context context,HostHttp http,LongSupplier clock){this.context=context.getApplicationContext();this.http=http;this.clock=clock;store=new HostConfigStore(this.context);try{config=store.load();}catch(Exception invalid){config=HostConfigStore.Config.empty();storageError="SOURCE_HOST_STORAGE";}}
    synchronized HostConfigStore.Config config(){return config;}
    synchronized String storageError(){return storageError;}
    synchronized String selectedSource(){if(!hasSession()||active.sourceId==null)return "";return active.sourceId;}
    synchronized boolean canResume(String comic){try{selected(requireSession(),comic);return true;}catch(RuntimeException unavailable){return false;}}
    synchronized String title(Session session,String comic){return selected(session,comic).title;}
    synchronized boolean hasSession(){try{if(active==null||!active.ready)return false;active.check();return true;}catch(RuntimeException stopped){return false;}}
    HostConfigStore.Config configure(long expected,String label,String endpoint,String authMode,boolean allowLan)throws Exception {
        HostConfigStore.Config next;
        synchronized(this){ensureStorage();if(config.revision!=expected)throw error("SOURCE_HOST_STALE");HostEndpoint address=new HostEndpoint(endpoint,allowLan,authMode);HostProtocol.text(label,120);if(config.revision>=9007199254740991L)throw error("SOURCE_HOST_STALE");String id=config.configured()&&config.endpoint.equals(address.value)?config.id:UUID.randomUUID().toString();next=new HostConfigStore.Config(id,config.revision+1,label,address.value,authMode,false,allowLan);store.write(next);config=next;}
        end();return next;
    }
    HostConfigStore.Config enabled(long expected,boolean enabled,boolean consent)throws Exception {
        HostConfigStore.Config next;
        synchronized(this){ensureStorage();if(!config.configured()||config.revision!=expected||config.revision>=9007199254740991L)throw error("SOURCE_HOST_STALE");if(enabled&&!consent)throw error("SOURCE_HOST_CONSENT_REQUIRED");if(config.enabled==enabled)return config;next=new HostConfigStore.Config(config.id,config.revision+1,config.label,config.endpoint,config.authMode,enabled,config.allowLan);store.write(next);config=next;}
        end();return next;
    }
    void start(String username,String password,boolean consent)throws Exception {
        if(!consent)throw error("SOURCE_HOST_READER_CONSENT_REQUIRED");Session session;
        synchronized(this){ensureStorage();if(!config.configured()||!config.enabled)throw error("SOURCE_HOST_DISABLED");if(active!=null)throw error("SOURCE_HOST_BUSY");if(http==null)http=HostHttp.create(context);session=new Session(config,username,password);active=session;}
        try{HostProtocol.server(rpc(session,"info",new JSONObject()));synchronized(this){session.check();session.ready=true;main.postDelayed(session.expire,TTL);}}
        catch(Exception failure){end(session);throw failure;}
    }
    void end(){Session session;synchronized(this){session=active;}if(session!=null)end(session);}
    private void end(Session session){List<Runnable> cancelled;
        synchronized(this){if(active!=session)return;active=null;main.removeCallbacks(session.expire);session.auth="";session.choices.clear();session.books.clear();session.selected.clear();session.chapters.clear();session.prepared.clear();cancelled=new ArrayList<>(session.cancellations);session.cancellations.clear();}
        for(Runnable cancel:cancelled)try{cancel.run();}catch(RuntimeException ignored){}
    }
    synchronized Session requireSession(){if(active==null||!active.ready)throw error("SOURCE_HOST_CANCELLED");active.check();return active;}
    private void ensureStorage(){if(!storageError.isEmpty())throw error(storageError);}
    HostProtocol.Sources sources(int offset)throws Exception {Session session=requireSession();if(offset<0||offset>5000||offset%25!=0)throw error("INVALID_SOURCE_HOST");synchronized(this){session.check();if(session.sourceId!=null)throw error("SOURCE_HOST_STALE");}HostProtocol.Sources result=HostProtocol.sources(rpc(session,"sources",new JSONObject().put("first",25).put("offset",offset)));session.commit(()->{session.choices.clear();for(HostProtocol.Source source:result.rows)session.choices.put(source.id,source);return null;});return result;}
    void bind(String sourceId,boolean consent)throws Exception {if(!consent)throw error("SOURCE_HOST_CONSENT_REQUIRED");Session session=requireSession();String id=HostProtocol.sourceId(sourceId);session.commit(()->{if(session.sourceId!=null||!session.choices.containsKey(id))throw error("SOURCE_HOST_STALE");session.sourceId=id;session.choices.clear();return null;});}
    SearchResult search(String query,int page)throws Exception {
        Session session=requireSession();String selected;synchronized(this){session.check();selected=session.sourceId;}if(selected==null)throw error("SOURCE_HOST_SOURCE_SELECTION_REQUIRED");HostProtocol.text(query,256);if(page<1||page>200)throw error("INVALID_SOURCE_HOST");
        HostProtocol.Search result=HostProtocol.search(rpc(session,"search",new JSONObject().put("input",new JSONObject().put("source",selected).put("type","SEARCH").put("page",page).put("query",query.trim()))),selected);
        return session.commit(()->{List<Book> books=new ArrayList<>();for(HostProtocol.Manga manga:result.rows){Book book=new Book(session,manga);while(session.books.size()>=128){String removed=session.books.keySet().iterator().next();session.books.remove(removed);session.selected.remove(removed);session.chapters.remove(removed);session.prepared.keySet().removeIf(key->key.startsWith(removed+"\n"));}session.books.put(book.id,book);books.add(book);}return new SearchResult(books,result.next);});
    }
    static final class SearchResult {final List<Book> books;final boolean next;SearchResult(List<Book> books,boolean next){this.books=Collections.unmodifiableList(books);this.next=next;}}
    static final class Book {
        final String id,title,source,urlDigest;final int remote;
        Book(Session session,HostProtocol.Manga manga)throws Exception {title=manga.title;source=manga.source;remote=manga.id;urlDigest=ReaderPolicy.hash(manga.url);id="hosted:"+session.host.id+":"+ReaderPolicy.hash(new JSONArray().put(session.principal).put(source).put(urlDigest).toString());}
    }
    void select(String comicId)throws Exception {
        Session session=requireSession();Book book=book(session,comicId);verify(session,book);
        HostProtocol.Bundle result=HostProtocol.bundle(rpc(session,"prepare",new JSONObject().put("input",new JSONObject().put("id",book.remote).put("fetchManga",true).put("fetchChapters",true))),true);
        match(book,result.manga);session.commit(()->{putChapters(session,book,result.chapters);session.selected.add(book.id);return null;});
    }
    private Book book(Session session,String id){synchronized(this){session.check();Book book=session.books.get(id);if(book==null||session.sourceId==null||!session.sourceId.equals(book.source))throw error("SOURCE_HOST_STALE");return book;}}
    private HostProtocol.Bundle verify(Session session,Book book)throws Exception {HostProtocol.Bundle fresh=HostProtocol.bundle(rpc(session,"manga",new JSONObject().put("id",book.remote)),false);match(book,fresh.manga);session.commit(()->{putChapters(session,book,fresh.chapters);return null;});return fresh;}
    private static void match(Book book,HostProtocol.Manga manga){if(book.remote!=manga.id||!book.source.equals(manga.source)||!book.urlDigest.equals(ReaderPolicy.hash(manga.url)))throw error("SOURCE_HOST_STALE");}
    private static String chapterId(Book book,HostProtocol.Chapter chapter){return "host-chapter:"+ReaderPolicy.hash(book.id+"\n"+chapter.url);}
    private void putChapters(Session session,Book book,List<HostProtocol.Chapter> rows){if(!session.chapters.containsKey(book.id)&&session.chapters.size()>=20)session.chapters.remove(session.chapters.keySet().iterator().next());session.chapters.put(book.id,new ArrayList<>(rows));}
    List<BridgeClient.ChapterItem> chapters(Session session,String comicId)throws Exception {
        Book book=selected(session,comicId);HostProtocol.Bundle bundle=verify(session,book);List<HostProtocol.Chapter> sorted=new ArrayList<>(bundle.chapters);sorted.sort(Comparator.comparingDouble((HostProtocol.Chapter chapter)->chapter.number).thenComparing((a,b)->Integer.compare(b.sourceOrder,a.sourceOrder)));List<BridgeClient.ChapterItem> out=new ArrayList<>();for(HostProtocol.Chapter chapter:sorted)out.add(new BridgeClient.ChapterItem(chapterId(book,chapter),chapter.title,out.size()+1,chapter.pageCount));session.check();return out;
    }
    BridgeClient.ChapterData chapter(Session session,String comicId,String episodeId)throws Exception {
        Book book=selected(session,comicId);List<BridgeClient.ChapterItem> list=chapters(session,comicId);HostProtocol.Chapter chapter=knownChapter(session,book,episodeId),fresh=HostProtocol.chapter(rpc(session,"chapter",new JSONObject().put("id",chapter.id)));HostProtocol.same(chapter,fresh);
        HostProtocol.Chapter ready=HostProtocol.pages(rpc(session,"pages",new JSONObject().put("id",chapter.id)),fresh);
        session.commit(()->{session.prepared.put(book.id+"\n"+episodeId,ready);while(session.prepared.size()>32)session.prepared.remove(session.prepared.keySet().iterator().next());return null;});
        List<BridgeClient.PageItem> pages=new ArrayList<>();String prefix="host-page:"+session.id+":"+comicId.substring(comicId.length()-64)+":"+episodeId.substring(13)+":";
        for(int i=0;i<ready.pageCount;i++)pages.add(new BridgeClient.PageItem(prefix+i,prefix+i,i+1));int order=1;for(BridgeClient.ChapterItem item:list)if(episodeId.equals(item.id))order=item.order;
        return new BridgeClient.ChapterData(new BridgeClient.ChapterItem(episodeId,ready.title,order,pages.size()),pages,0);
    }
    HttpURLConnection image(Session session,String locator)throws Exception {
        if(locator==null||!locator.matches("host-page:[0-9a-f-]{36}:[0-9a-f]{64}:[0-9a-f]{64}:(?:0|[1-9][0-9]{0,3})"))throw error("INVALID_SOURCE_HOST");String[] row=locator.split(":");if(!session.id.equals(row[1]))throw error("SOURCE_HOST_STALE");String comic="hosted:"+session.host.id+":"+row[2],episode="host-chapter:"+row[3];Book book=selected(session,comic);HostProtocol.Chapter expected;synchronized(this){expected=session.prepared.get(comic+"\n"+episode);}if(expected==null)throw error("SOURCE_HOST_STALE");verify(session,book);HostProtocol.Chapter current=knownChapter(session,book,episode);HostProtocol.same(expected,current);int index=Integer.parseInt(row[4]);if(current.pageCount!=expected.pageCount||index>=expected.pageCount)throw error("SOURCE_HOST_STALE");return http.image(session.endpoint,session.auth,"api/v1/manga/"+current.mangaId+"/chapter/"+current.sourceOrder+"/page/"+index,session);
    }
    private Book selected(Session session,String id){Book book=book(session,id);synchronized(this){if(!session.selected.contains(id))throw error("SOURCE_HOST_SCOPE_REQUIRED");}return book;}
    private HostProtocol.Chapter knownChapter(Session session,Book book,String episode){synchronized(this){session.check();for(HostProtocol.Chapter chapter:session.chapters.getOrDefault(book.id,Collections.emptyList()))if(chapterId(book,chapter).equals(episode))return chapter;}throw error("SOURCE_HOST_STALE");}
    private JSONObject rpc(Session session,String operation,JSONObject variables)throws Exception {session.check();JSONObject result=http.json(session.endpoint,session.auth,operation,variables,session);session.check();return result;}
    final class Session implements SourceAccessPolicy.Access {
        final String id=UUID.randomUUID().toString(),principal,scope;final HostConfigStore.Config host;final HostEndpoint endpoint;final long expires;
        private String auth;private String sourceId;private boolean ready;private final Map<String,HostProtocol.Source> choices=new LinkedHashMap<>();private final Map<String,Book> books=new LinkedHashMap<>();private final Set<String> selected=new HashSet<>();private final Map<String,List<HostProtocol.Chapter>> chapters=new LinkedHashMap<>();private final Map<String,HostProtocol.Chapter> prepared=new LinkedHashMap<>();private final Set<Runnable> cancellations=new HashSet<>();private final Runnable expire=()->end(this);
        Session(HostConfigStore.Config host,String username,String password){this.host=host;endpoint=new HostEndpoint(host.endpoint,host.allowLan,host.authMode);expires=clock.getAsLong()+TTL;String identity="";auth="";if("basic".equals(host.authMode)){if(username==null||password==null||username.isEmpty()||username.length()>256||password.isEmpty()||password.length()>4096||!username.equals(username.trim())||username.indexOf(':')>=0||username.matches("(?s).*[\\x00-\\x1f\\x7f].*")||password.matches("(?s).*[\\x00-\\x1f\\x7f].*")||!HostProtocol.unicode(username)||!HostProtocol.unicode(password))throw error("SOURCE_HOST_AUTH_REQUIRED");identity=username;auth="Basic "+Base64.getEncoder().encodeToString((username+":"+password).getBytes(StandardCharsets.UTF_8));}principal=ReaderPolicy.hash(host.id+"\n"+host.authMode+"\n"+identity);scope=ReaderPolicy.hash("user-host-reader-v1\n"+host.id+"\n"+principal);}
        public void check(){boolean expired; synchronized(HostSourceManager.this){expired=clock.getAsLong()>=expires;if(active!=this||!config.enabled||config.revision!=host.revision||!config.id.equals(host.id)||Thread.currentThread().isInterrupted())throw error("SOURCE_HOST_CANCELLED");}if(expired){main.post(expire);throw error("SOURCE_HOST_CANCELLED");}}
        public SourceAccessPolicy.Registration onCancel(Runnable callback){synchronized(HostSourceManager.this){check();cancellations.add(callback);}return ()->{synchronized(HostSourceManager.this){cancellations.remove(callback);}};}
        public <T>T commit(SourceAccessPolicy.Commit<T> work)throws Exception {synchronized(HostSourceManager.this){check();return work.run();}}
    }
    private static IllegalStateException error(String code){return new IllegalStateException(code);}
}
