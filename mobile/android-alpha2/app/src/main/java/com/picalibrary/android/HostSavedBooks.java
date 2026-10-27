package com.picalibrary.android;

import android.content.Context;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.json.*;

/** Optional-source locator storage, not another catalogue, Reader, permission or download store. */
final class HostSavedBooks {
    static final int MAX_BOOKS=500,MAX_BYTES=2*1024*1024;
    static final class Full extends IOException {Full(){super("SOURCE_HOST_LIBRARY_FULL");}}
    static final class Book {
        final String comicId,connectionId,principal,sourceId,urlDigest,title,hostLabel,savedAt;
        final int remoteId;
        Book(String comicId,String connectionId,String principal,String sourceId,int remoteId,String urlDigest,String title,String hostLabel,String savedAt)throws Exception {
            if(connectionId==null||!connectionId.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")||principal==null||!principal.matches("[0-9a-f]{64}")||urlDigest==null||!urlDigest.matches("[0-9a-f]{64}"))throw invalid();
            this.sourceId=HostProtocol.sourceId(sourceId);this.remoteId=HostProtocol.integer(remoteId,false);
            String expected="hosted:"+connectionId+":"+ReaderPolicy.hash(new JSONArray().put(principal).put(sourceId).put(urlDigest).toString());
            if(!expected.equals(comicId))throw invalid();
            this.comicId=comicId;this.connectionId=connectionId;this.principal=principal;this.urlDigest=urlDigest;
            this.title=HostProtocol.text(title,500);this.hostLabel=HostProtocol.text(hostLabel,120);this.savedAt=HostProtocol.text(savedAt,40);Instant.parse(savedAt);
        }
        JSONObject json()throws Exception {return new JSONObject().put("comicId",comicId).put("connectionId",connectionId).put("principal",principal).put("sourceId",sourceId).put("remoteId",remoteId).put("urlDigest",urlDigest).put("title",title).put("hostLabel",hostLabel).put("savedAt",savedAt);}
        static Book parse(JSONObject row)throws Exception {if(row==null||row.length()!=9)throw invalid();Object remote=row.get("remoteId");return new Book(HostProtocol.text(row.get("comicId"),108),HostProtocol.text(row.get("connectionId"),36),HostProtocol.text(row.get("principal"),64),HostProtocol.sourceId(row.get("sourceId")),HostProtocol.integer(remote,false),HostProtocol.text(row.get("urlDigest"),64),HostProtocol.text(row.get("title"),500),HostProtocol.text(row.get("hostLabel"),120),HostProtocol.text(row.get("savedAt"),40));}
    }
    private final AtomicFile file;
    HostSavedBooks(Context context){file=new AtomicFile(new File(context.getApplicationContext().getFilesDir(),"user-host-saved-books-v1.json"));}
    List<Book> load()throws Exception {synchronized(HostSavedBooks.class){return Collections.unmodifiableList(read());}}
    Book put(Book value)throws Exception {synchronized(HostSavedBooks.class){
        value=Book.parse(value.json());List<Book> rows=read();
        for(int i=0;i<rows.size();i++)if(rows.get(i).comicId.equals(value.comicId)){
            Book old=rows.get(i);Book next=new Book(value.comicId,value.connectionId,value.principal,value.sourceId,value.remoteId,value.urlDigest,value.title,value.hostLabel,old.savedAt);
            if(next.json().toString().equals(old.json().toString()))return old;rows.set(i,next);write(rows);return next;
        }
        if(rows.size()>=MAX_BOOKS)throw new Full();rows.add(value);write(rows);return value;
    }}
    void remove(String comicId)throws Exception {synchronized(HostSavedBooks.class){
        if(comicId==null||!comicId.matches("hosted:[0-9a-f-]{36}:[0-9a-f]{64}"))throw invalid();List<Book> rows=read();
        if(rows.removeIf(row->row.comicId.equals(comicId)))write(rows);
    }}
    private List<Book> read()throws Exception {
        if(!file.getBaseFile().exists()&&!new File(file.getBaseFile()+".bak").exists())return new ArrayList<>();
        byte[] bytes;try(InputStream in=file.openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>MAX_BYTES)throw invalid();out.write(buffer,0,n);}bytes=out.toByteArray();}
        JSONObject root=HostJson.object(bytes);if(root.length()!=2||!(root.get("schemaVersion") instanceof Integer)||root.getInt("schemaVersion")!=1)throw invalid();
        JSONArray values=root.getJSONArray("books");if(values.length()>MAX_BOOKS)throw invalid();List<Book> rows=new ArrayList<>();Set<String> ids=new HashSet<>();
        for(int i=0;i<values.length();i++){Book book=Book.parse(values.getJSONObject(i));if(!ids.add(book.comicId))throw invalid();rows.add(book);}return rows;
    }
    private void write(List<Book> rows)throws Exception {
        JSONArray values=new JSONArray();for(Book row:rows)values.put(row.json());byte[] bytes=new JSONObject().put("schemaVersion",1).put("books",values).toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>MAX_BYTES)throw invalid();
        FileOutputStream out=null;try{out=file.startWrite();out.write(bytes);out.getFD().sync();file.finishWrite(out);out=null;}catch(Exception|OutOfMemoryError failure){if(out!=null)file.failWrite(out);if(failure instanceof OutOfMemoryError)throw (OutOfMemoryError)failure;throw new IOException("SOURCE_HOST_STORAGE");}
    }
    private static IOException invalid(){return new IOException("SOURCE_HOST_STORAGE");}
}
