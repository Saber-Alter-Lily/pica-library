package com.picalibrary.android;

import android.content.Context;
import com.picalibrary.android.local.LocalComicImporter;
import java.io.*;
import java.net.HttpURLConnection;
import java.util.*;

/** One explicitly selected chapter -> existing owned local inventory. Not a second download queue. */
final class HostOfflineSaver {
    private HostOfflineSaver(){}
    static LocalComicStore.Comic save(Context context,HostSourceManager manager,HostSourceManager.Session session,String comic,String episode,boolean consent,LocalComicImporter.Progress progress)throws Exception {
        if(!consent)throw new IOException("SOURCE_HOST_SAVE_CONSENT_REQUIRED");
        if(manager.requireSession()!=session)throw new IOException("SOURCE_HOST_CANCELLED");session.check();
        BridgeClient.ChapterData chapter=manager.chapter(session,comic,episode);
        if(chapter.pages.isEmpty()||chapter.pages.size()>LocalComicImporter.MAX_PAGES)throw new IOException("SOURCE_HOST_TOO_LARGE");
        String id=LocalComicImporter.identity(DeviceIdentity.id(context),"folder","user-host-chapter-v1\n"+comic+"\n"+episode);
        String title=shortTitle(manager.title(session,comic),120)+" · "+shortTitle(chapter.episode.title,70);
        List<LocalComicImporter.Open> streams=new ArrayList<>();
        for(BridgeClient.PageItem page:chapter.pages)streams.add(()->{
            HttpURLConnection connection=null;
            try{
                session.check();connection=manager.image(session,page.url);
                if(connection.getResponseCode()!=200)throw new IOException("SOURCE_HOST_UNAVAILABLE");
                InputStream in=connection.getInputStream();HttpURLConnection owned=connection;
                return new FilterInputStream(in){private boolean closed;@Override public void close()throws IOException {if(closed)return;closed=true;try{super.close();}finally{owned.disconnect();}}};
            }catch(Exception failure){if(connection!=null)connection.disconnect();throw new IOException("SOURCE_HOST_SAVE_FAILED");}
        });
        LocalComicImporter.Cancellation cancel=()->{try{session.check();}catch(RuntimeException ended){throw new IOException("SOURCE_HOST_CANCELLED");}};
        try(LocalComicStore.Preview preview=LocalComicStore.prepareRasterPages(context,id,title,streams,cancel,progress)){
            // Revocation and manifest publication cannot race. Never hold this lock for remote IO.
            return session.commit(()->LocalComicStore.confirm(context,preview,cancel));
        }
    }
    private static String shortTitle(String title,int max){return title.length()<=max?title:title.substring(0,max-1)+"…";}
}
