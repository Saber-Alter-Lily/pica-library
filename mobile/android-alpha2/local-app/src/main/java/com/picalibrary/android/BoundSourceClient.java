package com.picalibrary.android;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import com.picalibrary.android.remote.ISourceEndpoint;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The source-free Reader's entire first-party Host bridge: a bounded Android
 * Binder client. There is deliberately NO INTERNET permission or network
 * implementation in this process. Source-specific HTTP and credentials remain
 * exclusively in the separately installed, same-signature user Host process.
 */
final class BoundSourceClient implements AutoCloseable {
    private static final String PACKAGE="com.picalibrary.android.userhost.qa";
    private static final String SERVICE="com.picalibrary.android.ExternalSourceService";
    private static final String ACTION="com.picalibrary.android.remote.BIND_SOURCE";
    private final Context context;
    private final String expectedScope;
    private final CountDownLatch connected=new CountDownLatch(1);
    private volatile ISourceEndpoint endpoint;
    private volatile boolean started,closed,bound;
    private final ServiceConnection connection=new ServiceConnection(){
        @Override public void onServiceConnected(ComponentName name,IBinder service){
            if(!closed)endpoint=ISourceEndpoint.Stub.asInterface(service);
            connected.countDown();
        }
        @Override public void onServiceDisconnected(ComponentName name){
            endpoint=null;connected.countDown();
        }
        @Override public void onNullBinding(ComponentName name){connected.countDown();}
    };

    BoundSourceClient(Context context,String scope){
        if(scope==null||!scope.matches("[0-9a-f]{64}"))
            throw new IllegalArgumentException("SOURCE_HOST_STALE");
        this.context=context.getApplicationContext();
        expectedScope=scope;
    }
    private ISourceEndpoint ready()throws IOException{
        if(closed)throw new IOException("SOURCE_HOST_CANCELLED");
        if(Looper.myLooper()==Looper.getMainLooper())
            throw new IOException("SOURCE_HOST_UNAVAILABLE");
        if(!started){
            synchronized(this){
                if(!started){
                    started=true;
                    try{
                        Intent intent=new Intent(ACTION);
                        intent.setClassName(PACKAGE,SERVICE);
                        bound=context.bindService(intent,connection,Context.BIND_AUTO_CREATE);
                        if(!bound)connected.countDown();
                    }catch(SecurityException failure){
                        connected.countDown();
                        throw new IOException("SOURCE_HOST_AUTH_REQUIRED");
                    }
                }
            }
        }
        try{
            if(!connected.await(8,TimeUnit.SECONDS))
                throw new IOException("SOURCE_HOST_TIMEOUT");
        }catch(InterruptedException failure){
            Thread.currentThread().interrupt();
            throw new IOException("SOURCE_HOST_CANCELLED");
        }
        ISourceEndpoint bridge=endpoint;
        if(bridge==null||closed)throw new IOException("SOURCE_HOST_UNAVAILABLE");
        return bridge;
    }
    private ISourceEndpoint active()throws IOException{
        try{
            ISourceEndpoint bridge=ready();
            if(!expectedScope.equals(bridge.sessionScope()))
                throw new IOException("SOURCE_HOST_STALE");
            return bridge;
        }catch(IOException failure){throw failure;}
        catch(Exception failure){throw new IOException("SOURCE_HOST_UNAVAILABLE");}
    }

    List<ReaderContent.Chapter> chapters(String comic)throws Exception{
        String payload=active().chapters(comic);
        if(payload==null||payload.length()>480000)
            throw new IOException("SOURCE_HOST_PROTOCOL");
        JSONArray rows=new JSONArray(payload);
        if(rows.length()>2000)throw new IOException("SOURCE_HOST_TOO_LARGE");
        List<ReaderContent.Chapter> out=new ArrayList<>();
        for(int i=0;i<rows.length();i++){
            JSONObject item=rows.getJSONObject(i);
            out.add(new ReaderContent.Chapter(item.getString("id"),
                item.getString("title"),item.getInt("order"),item.getInt("count")));
        }
        return out;
    }

    ReaderContent.ChapterData chapter(String comic,String episode)throws Exception{
        String payload=active().chapter(comic,episode);
        if(payload==null||payload.length()>2500)
            throw new IOException("SOURCE_HOST_PROTOCOL");
        JSONObject row=new JSONObject(payload);
        String id=row.getString("id"),prefix=row.getString("prefix");
        int count=row.getInt("count"),order=row.getInt("order");
        int progress=row.getInt("progress");
        if(!episode.equals(id)||count<1||count>10000||
                !prefix.matches("host-page:[0-9a-f-]{36}:[0-9a-f]{64}:[0-9a-f]{64}:"))
            throw new IOException("SOURCE_HOST_PROTOCOL");
        List<ReaderContent.Page> pages=new ArrayList<>();
        for(int i=0;i<count;i++){
            String locator=prefix+i;
            pages.add(new ReaderContent.Page(locator,locator,i+1));
        }
        ReaderContent.Chapter chapter=new ReaderContent.Chapter(
                id,row.getString("title"),order,count);
        return new ReaderContent.ChapterData(chapter,pages,progress);
    }

    HttpURLConnection image(String locator)throws Exception{
        if(locator==null||!locator.matches(
                "host-page:[0-9a-f-]{36}:[0-9a-f]{64}:[0-9a-f]{64}:(?:0|[1-9][0-9]{0,3})"))
            throw new IOException("INVALID_SOURCE_HOST");
        ParcelFileDescriptor fd=active().openPage(locator);
        if(fd==null)throw new IOException("SOURCE_HOST_UNAVAILABLE");
        return new RemotePage(fd);
    }
    void check()throws IOException{active();}
    @Override public void close(){
        closed=true;endpoint=null;
        if(bound){
            try{context.unbindService(connection);}catch(IllegalArgumentException ignored){}
            bound=false;
        }
    }

    /** An image FD from Binder; URL constructor never opens a network socket. */
    private static final class RemotePage extends HttpURLConnection{
        private ParcelFileDescriptor fd;
        private InputStream input;
        private boolean closed;
        RemotePage(ParcelFileDescriptor fd)throws Exception{
            super(new URL("http://127.0.0.1/"));
            this.fd=fd;
        }
        @Override public void connect()throws IOException{
            if(closed)throw new IOException("SOURCE_HOST_CANCELLED");
        }
        @Override public int getResponseCode()throws IOException{
            connect();return 200;
        }
        @Override public synchronized InputStream getInputStream()throws IOException{
            connect();
            if(input==null){
                input=new ParcelFileDescriptor.AutoCloseInputStream(fd);
                fd=null;
            }
            return input;
        }
        @Override public synchronized void disconnect(){
            if(closed)return;
            closed=true;
            try{if(input!=null)input.close();}catch(IOException ignored){}
            try{if(fd!=null)fd.close();}catch(IOException ignored){}
        }
        @Override public boolean usingProxy(){return false;}
    }
}
