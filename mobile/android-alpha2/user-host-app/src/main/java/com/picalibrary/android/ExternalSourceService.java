package com.picalibrary.android;

import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Binder;
import android.os.IBinder;
import android.os.ParcelFileDescriptor;
import android.os.Process;
import android.os.RemoteException;
import com.picalibrary.android.remote.ISourceEndpoint;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The optional user-managed Host executes only in this independently installed
 * companion process. The source-free Reader is a signature-verified Binder
 * client and never receives credentials, concrete provider URLs, source code,
 * network access or a file path. All remote chapters/pages must already be
 * selected and explicitly authorized inside the existing HostSourceManager.
 */
public final class ExternalSourceService extends Service {
    public static final String ACTION="com.picalibrary.android.remote.BIND_SOURCE";
    public static final String PERMISSION="com.picalibrary.android.remote.BIND_SOURCE";
    private final ExecutorService streams=Executors.newFixedThreadPool(3);
    private HostSourceManager manager;

    @Override public void onCreate(){
        super.onCreate();manager=HostSourceManager.get(this);
    }
    @Override public IBinder onBind(Intent intent){
        if(intent==null||!ACTION.equals(intent.getAction()))return null;
        return bridge;
    }
    private void verifyCaller(){
        int caller=Binder.getCallingUid();
        if(caller!=Process.myUid()&&getPackageManager()
                .checkSignatures(caller,Process.myUid())!=PackageManager.SIGNATURE_MATCH)
            throw new SecurityException("External source requires matching app signature");
        if(checkCallingPermission(PERMISSION)!=PackageManager.PERMISSION_GRANTED &&
                caller!=Process.myUid())
            throw new SecurityException("External source permission denied");
    }

    private final ISourceEndpoint.Stub bridge=new ISourceEndpoint.Stub(){
        @Override public String sessionScope()throws RemoteException{
            verifyCaller();
            return manager.requireSession().scope;
        }
        @Override public String chapters(String comicId)throws RemoteException{
            verifyCaller();
            try{
                HostSourceManager.Session session=manager.requireSession();
                JSONArray out=new JSONArray();
                for(ReaderContent.Chapter value:manager.chapters(session,comicId)){
                    out.put(new JSONObject().put("id",value.id)
                            .put("title",value.title).put("order",value.order)
                            .put("count",value.downloadedPictures));
                }
                String json=out.toString();
                if(json.length()>480000)throw new IOException("SOURCE_HOST_TOO_LARGE");
                return json;
            }catch(Exception problem){throw new IllegalStateException("SOURCE_HOST_UNAVAILABLE");}
        }
        @Override public String chapter(String comicId,String episodeId)
                throws RemoteException{
            verifyCaller();
            try{
                HostSourceManager.Session session=manager.requireSession();
                ReaderContent.ChapterData data=manager.chapter(session,comicId,episodeId);
                if(data.pages.isEmpty()||data.pages.size()>10000)
                    throw new IOException("SOURCE_HOST_TOO_LARGE");
                String first=data.pages.get(0).url;
                int colon=first.lastIndexOf(':');
                if(colon<0||!first.substring(colon+1).equals("0")||
                        !first.startsWith("host-page:"))
                    throw new IOException("SOURCE_HOST_PROTOCOL");
                String prefix=first.substring(0,colon+1);
                return new JSONObject()
                    .put("id",data.episode.id).put("title",data.episode.title)
                    .put("order",data.episode.order)
                    .put("count",data.pages.size()).put("prefix",prefix)
                    .put("progress",data.progressIndex).toString();
            }catch(Exception problem){throw new IllegalStateException("SOURCE_HOST_UNAVAILABLE");}
        }
        @Override public ParcelFileDescriptor openPage(String locator)
                throws RemoteException{
            verifyCaller();
            final HostSourceManager.Session session=manager.requireSession();
            // Validate locator ownership before handing a pipe to the caller.
            if(locator==null||locator.length()>255||
                    !locator.matches("host-page:[0-9a-f-]{36}:[0-9a-f]{64}:[0-9a-f]{64}:(?:0|[1-9][0-9]{0,3})"))
                throw new SecurityException("INVALID_SOURCE_HOST");
            try{
                ParcelFileDescriptor[] pipe=ParcelFileDescriptor.createPipe();
                streams.execute(()->{
                    HttpURLConnection connection=null;
                    try(OutputStream out=
                            new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])){
                        session.check();
                        connection=manager.image(session,locator);
                        if(connection.getResponseCode()!=200)
                            throw new IOException("SOURCE_HOST_UNAVAILABLE");
                        byte[] bytes=new byte[32768];
                        int len;long total=0;
                        try(InputStream input=connection.getInputStream()){
                            while((len=input.read(bytes))!=-1){
                                session.check();
                                total+=len;
                                if(total>20L*1024*1024)
                                    throw new IOException("SOURCE_HOST_TOO_LARGE");
                                out.write(bytes,0,len);
                            }
                        }
                    }catch(Exception ignored){
                        // Closing the writer makes revoked or failed pages fail in
                        // the original Reader's existing image validator.
                    }finally{
                        if(connection!=null)connection.disconnect();
                        try{pipe[1].close();}catch(IOException ignored){}
                    }
                });
                return pipe[0];
            }catch(IOException error){
                throw new IllegalStateException("SOURCE_HOST_UNAVAILABLE");
            }
        }
    };
    @Override public void onDestroy(){
        streams.shutdownNow();
        super.onDestroy();
    }
}
