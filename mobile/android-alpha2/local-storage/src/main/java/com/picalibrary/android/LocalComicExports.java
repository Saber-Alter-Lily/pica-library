package com.picalibrary.android;

import android.content.Context;
import android.net.Uri;
import com.picalibrary.android.local.LocalComicExporter;
import com.picalibrary.android.local.LocalComicImporter;
import java.io.*;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.*;

/** App-owned staging and explicit SAF destination adapter. Never exports a profile or provider cache. */
final class LocalComicExports {
    private LocalComicExports() { }
    static String filename(String title) {
        String clean=Normalizer.normalize(title==null?"Local comic":title,Normalizer.Form.NFC)
                .replaceAll("[\\p{Cntrl}<>:\"/\\\\|?*]","_").trim();
        if(clean.isEmpty())clean="Local comic";
        int end=clean.offsetByCodePoints(0,Math.min(80,clean.codePointCount(0,clean.length())));
        return "Comic-"+clean.substring(0,end)+".cbz";
    }
    static final class Stage implements AutoCloseable {
        final File archive,work;
        final LocalComicExporter.Result result;
        private final LocalComicStore.ExportLease lease;
        private boolean closed;
        Stage(File work,File archive,LocalComicExporter.Result result,LocalComicStore.ExportLease lease){this.work=work;this.archive=archive;this.result=result;this.lease=lease;}
        @Override public synchronized void close(){if(!closed){closed=true;try{LocalComicStore.removeOwned(work.getParentFile(),work);}finally{lease.close();}}}
    }
    static Stage prepare(Context context,String id,LocalComicImporter.Cancellation cancel) throws Exception {
        Context app=context.getApplicationContext();cancel.check();
        File stagingRoot=new File(app.getFilesDir(),"local-comic-export-staging-v1");
        if(!stagingRoot.isDirectory()&&!stagingRoot.mkdirs())throw new IOException("Cannot create export staging");
        File work=LocalComicStore.inside(stagingRoot,new File(stagingRoot,UUID.randomUUID().toString()));
        if(!work.mkdir())throw new IOException("Cannot create export stage");
        LocalComicStore.ExportLease lease=null;boolean handedOff=false;
        try {
            lease=LocalComicStore.exportLease(app,id);final LocalComicStore.Comic comic=lease.comic;
            List<LocalComicImporter.Input> pages=new ArrayList<>();
            for(LocalComicStore.Page page:comic.pages)pages.add(new LocalComicImporter.Input(page.name,page.bytes,false,
                ()->new FileInputStream(LocalComicStore.pageFile(app,comic,page))));
            File archive=new File(work,"comic.cbz");LocalComicExporter.Result result;
            try(FileOutputStream out=new FileOutputStream(archive)) {
                result=LocalComicExporter.write(pages,out,cancel);out.getFD().sync();
            }
            cancel.check();Stage stage=new Stage(work,archive,result,lease);handedOff=true;return stage;
        } finally {if(!handedOff){try{LocalComicStore.removeOwned(stagingRoot,work);}finally{if(lease!=null)lease.close();}}}
    }
    static void copyToDocument(Context context,Stage stage,Uri destination,LocalComicImporter.Cancellation cancel) throws Exception {
        if(destination==null||!"content".equals(destination.getScheme()))throw new IOException("Choose a destination with the system create-document picker");
        String authority=String.valueOf(destination.getAuthority());authority=authority.substring(authority.lastIndexOf('@')+1);
        if(authority.equalsIgnoreCase(context.getPackageName()+".files"))throw new IOException("Private application files are not export destinations");
        cancel.check();MessageDigest digest=MessageDigest.getInstance("SHA-256");long bytes=0;
        try(InputStream in=new FileInputStream(stage.archive);
            OutputStream out=context.getContentResolver().openOutputStream(destination,"wt")) {
            if(out==null)throw new IOException("Cannot open export destination");
            byte[] buffer=new byte[32768];int n;
            while((n=in.read(buffer))!=-1){cancel.check();if(n==0)throw new IOException("Non-progressing export stage");bytes+=n;if(bytes>LocalComicImporter.MAX_ARCHIVE)throw new IOException("Export copy exceeds limit");out.write(buffer,0,n);digest.update(buffer,0,n);}
            cancel.check();out.flush();
        }
        StringBuilder hash=new StringBuilder();for(byte b:digest.digest())hash.append(String.format(Locale.ROOT,"%02x",b&255));
        if(bytes!=stage.result.archiveBytes||!hash.toString().equals(stage.result.sha256))throw new IOException("Export stage changed during copy");
        cancel.check();
        // SAF owns the destination. Never delete an external document after cancellation/failure.
        // Accepted stream writes are not an independent provider readback/durability guarantee.
    }
}
