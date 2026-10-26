package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import org.json.*;

/** Synthetic protocol/transport only. Never opens a socket or contacts a provider/Host. */
final class HostTestFixture {
    static final String SOURCE="-9223372036854775808";
    static final byte[] PNG=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=");
    final List<Connection> opened=new ArrayList<>();final AtomicLong clock=new AtomicLong(1000);
    final HostSourceManager manager;
    String source=SOURCE,imageType="image/png",errorOperation="";int status=200;boolean wrongPage;byte[] image=PNG;Runnable imageRead;
    HostTestFixture(Context context)throws Exception {
        JSONObject operations;try(InputStream in=context.getResources().openRawResource(R.raw.host_source_operations)){operations=HostJson.object(HostHttp.read(in,32768));}
        manager=new HostSourceManager(context,new HostHttp(url->{Connection c=new Connection(url);opened.add(c);return c;},operations),clock::get);
    }
    void configured()throws Exception {manager.configure(0,"Synthetic Host","https://fixture.invalid/base/","none",false);manager.enabled(1,true,true);}
    HostSourceManager.Book selected()throws Exception {configured();manager.start("","",true);manager.sources(0);manager.bind(SOURCE,true);HostSourceManager.Book book=manager.search("synthetic",1).books.get(0);manager.select(book.id);return book;}
    JSONObject manga()throws Exception{return new JSONObject().put("id",7).put("sourceId",source).put("url","/synthetic/manga").put("title","Synthetic user Host comic").put("inLibrary",false);}
    JSONObject chapter()throws Exception{return new JSONObject().put("id",11).put("mangaId",7).put("url","/synthetic/chapter").put("name","Synthetic chapter").put("sourceOrder",0).put("pageCount",2).put("chapterNumber",1);}
    JSONObject response(String operation)throws Exception {
        JSONObject body=new JSONObject();
        switch(operation){
            case "PicaSourceHostInfo":body.put("aboutServer",new JSONObject().put("name","Suwayomi-Server").put("version","v2.4.2366"));break;
            case "PicaSourceHostSources":body.put("sources",new JSONObject().put("nodes",new JSONArray().put(new JSONObject().put("id",SOURCE).put("name","User installed fixture").put("lang","en").put("supportsLatest",true))).put("pageInfo",new JSONObject().put("hasNextPage",false).put("hasPreviousPage",false)).put("totalCount",1));break;
            case "PicaHostSourceSearch":body.put("fetchSourceManga",new JSONObject().put("mangas",new JSONArray().put(manga())).put("hasNextPage",false));break;
            case "PicaHostManga":body.put("manga",manga().put("chapters",new JSONObject().put("nodes",new JSONArray().put(chapter()))));break;
            case "PicaHostPrepareManga":body.put("fetchMangaAndChapters",new JSONObject().put("manga",manga()).put("chapters",new JSONArray().put(chapter())));break;
            case "PicaHostChapter":body.put("chapter",chapter());break;
            case "PicaHostChapterPages":body.put("fetchChapterPages",new JSONObject().put("chapter",chapter()).put("pages",new JSONArray().put("/api/v1/manga/7/chapter/0/page/0").put(wrongPage?"https://other.invalid/private":"/api/v1/manga/7/chapter/0/page/1")));break;
            default:throw new AssertionError("Unexpected synthetic operation");
        }
        return new JSONObject().put("data",body);
    }
    final class Connection extends HttpURLConnection {
        final ByteArrayOutputStream output=new ByteArrayOutputStream();int disconnects;JSONObject request;
        Connection(URL url){super(url);}
        public void disconnect(){disconnects++;}public boolean usingProxy(){return false;}public void connect(){}
        public int getResponseCode(){return status;}
        public String getHeaderField(String name){return "Content-Type".equalsIgnoreCase(name)?(url.getPath().endsWith("api/graphql")?"application/json; charset=utf-8":imageType):null;}
        public InputStream getInputStream()throws IOException {try{
            if(!url.getPath().endsWith("api/graphql")){if(imageRead!=null)imageRead.run();return new ByteArrayInputStream(image);}
            request=new JSONObject(output.toString("UTF-8"));String operation=request.getString("operationName");
            if(errorOperation.equals(operation))throw new IOException("secret response https://user:password@fixture.invalid/?token=private");
            return new ByteArrayInputStream(response(operation).toString().getBytes(StandardCharsets.UTF_8));
        }catch(IOException error){throw error;}catch(Exception error){throw new IOException("Synthetic fixture error",error);}}
        public OutputStream getOutputStream(){return output;}
    }
}
