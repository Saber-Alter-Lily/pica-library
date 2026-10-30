package com.picalibrary.android.local;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;
import java.util.zip.*;

/** Standard bounded CBZ writer. No Android, file paths, accounts, catalog or sync authority. */
public final class LocalComicExporter {
    public static final class Result {
        public final int pages, chapters;
        public final long bodyBytes, archiveBytes;
        public final String sha256;
        Result(int pages, int chapters, long bodyBytes, long archiveBytes, String sha256) {
            this.pages=pages; this.chapters=chapters; this.bodyBytes=bodyBytes;
            this.archiveBytes=archiveBytes; this.sha256=sha256;
        }
    }
    private LocalComicExporter() { }

    /** Caller owns the output. Failure may leave partial bytes: publish only a completed private stage. */
    public static Result write(List<LocalComicImporter.Input> input, OutputStream output,
            LocalComicImporter.Cancellation cancel) throws IOException {
        if(input==null||input.isEmpty()||input.size()>LocalComicImporter.MAX_PAGES||output==null||cancel==null)
            throw new IOException("Invalid export page inventory");
        List<LocalComicImporter.Input> pages=new ArrayList<>();
        Set<String> names=new HashSet<>(), chapters=new HashSet<>();
        long declared=0;
        for(LocalComicImporter.Input page:input) {
            cancel.check();
            if(page==null||page.directory||page.open==null||page.name==null||page.name.endsWith("/"))throw new IOException("Invalid export page");
            String name=LocalComicImporter.safeName(page.name);
            if(LocalComicImporter.extension(name).isEmpty()||!names.add(name.toLowerCase(Locale.ROOT)))
                throw new IOException("Invalid or duplicate export image name");
            if(page.size==0||page.size < -1||page.size>LocalComicImporter.MAX_PAGE)
                throw new IOException("Invalid export page length");
            if(page.size>0)declared+=page.size;
            if(declared>LocalComicImporter.MAX_TOTAL)throw new IOException("Export body bytes exceed limit");
            int slash=name.lastIndexOf('/'); chapters.add(slash<0?"":name.substring(0,slash));
            pages.add(new LocalComicImporter.Input(name,page.size,page.crc,false,page.open));
        }
        pages.sort((a,b)->LocalComicImporter.naturalCompare(a.name,b.name));
        BoundedOutput bounded=new BoundedOutput(output,cancel);
        long total=0;
        try(ZipOutputStream zip=new ZipOutputStream(bounded,StandardCharsets.UTF_8)) {
            // Source image bytes are already compressed. Retain standard ZIP, without a new compressor.
            zip.setLevel(Deflater.BEST_SPEED);
            byte[] buffer=new byte[32768];
            for(LocalComicImporter.Input page:pages) {
                cancel.check();
                ZipEntry entry=new ZipEntry(page.name); entry.setTime(0); zip.putNextEntry(entry);
                byte[] header=new byte[12]; int headerLength=0; long count=0; CRC32 crc=new CRC32();
                try(InputStream in=page.open.open()) {
                    if(in==null)throw new IOException("Unreadable export page");
                    int n;
                    while((n=in.read(buffer))!=-1) {
                        cancel.check(); if(n==0)throw new IOException("Non-progressing export page stream");
                        count+=n;total+=n;
                        if(count>LocalComicImporter.MAX_PAGE||total>LocalComicImporter.MAX_TOTAL)
                            throw new IOException("Export body bytes exceed limit");
                        int h=Math.min(n,header.length-headerLength);
                        if(h>0){System.arraycopy(buffer,0,header,headerLength,h);headerLength+=h;}
                        crc.update(buffer,0,n);zip.write(buffer,0,n);
                    }
                }
                if(count==0||(page.size>=0&&count!=page.size)||(page.crc>=0&&crc.getValue()!=page.crc)
                        ||!LocalComicImporter.signature(header,headerLength,LocalComicImporter.extension(page.name)))
                    throw new IOException("Invalid export image, length or CRC");
                zip.closeEntry();
            }
            cancel.check();zip.finish();zip.flush();cancel.check();
        }
        return new Result(pages.size(),chapters.size(),total,bounded.bytes,bounded.hexDigest());
    }
    private static final class BoundedOutput extends OutputStream {
        final OutputStream target;
        final LocalComicImporter.Cancellation cancel;
        final MessageDigest digest;
        long bytes;
        BoundedOutput(OutputStream target,LocalComicImporter.Cancellation cancel) {
            this.target=target;this.cancel=cancel;
            try{digest=MessageDigest.getInstance("SHA-256");}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}
        }
        @Override public void write(int value) throws IOException {byte[] one={(byte)value};write(one,0,1);}
        @Override public void write(byte[] data,int offset,int length) throws IOException {
            cancel.check();
            if(length<0||bytes+length>LocalComicImporter.MAX_ARCHIVE)throw new IOException("Export CBZ exceeds 256 MiB");
            target.write(data,offset,length);digest.update(data,offset,length);bytes+=length;
        }
        @Override public void flush() throws IOException {target.flush();}
        @Override public void close() throws IOException {flush();} // Caller, not ZIP, owns the sink.
        String hexDigest(){StringBuilder out=new StringBuilder();for(byte b:digest.digest())out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
    }
}
