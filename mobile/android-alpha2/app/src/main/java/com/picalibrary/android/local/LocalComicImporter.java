package com.picalibrary.android.local;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.*;
import java.util.zip.*;

/** Bounded local-content ingestion. No Android, accounts, network, catalog or sync dependencies. */
public final class LocalComicImporter {
    public static final long MAX_ARCHIVE = 256L * 1024 * 1024;
    public static final long MAX_PAGE = 20L * 1024 * 1024;
    public static final long MAX_TOTAL = 512L * 1024 * 1024;
    public static final int MAX_ENTRIES = 10000, MAX_PAGES = 2000, MAX_DEPTH = 8;
    public interface Cancellation { void check() throws IOException; }
    public interface Open { InputStream open() throws IOException; }
    public interface Source extends AutoCloseable {
        List<Input> entries() throws IOException;
        @Override default void close() throws IOException { }
    }
    public static final class Input {
        public final String name;
        public final long size, crc;
        public final boolean directory;
        public final Open open;
        public Input(String name, long size, boolean directory, Open open) { this(name,size,-1,directory,open); }
        public Input(String name, long size, long crc, boolean directory, Open open) {
            this.name=name; this.size=size; this.crc=crc; this.directory=directory; this.open=open;
        }
    }
    public static final class Page {
        public final String id, chapterId, chapterTitle, name, file;
        public final long bytes;
        Page(String name, String file, long bytes, String title) {
            this.name=name; this.file=file; this.bytes=bytes; id="local-page:"+hash(name);
            int split=name.lastIndexOf('/'); String parent=split<0?"":name.substring(0,split);
            chapterId="local-chapter:"+hash(parent); chapterTitle=parent.isEmpty()?title:parent;
        }
    }
    public static final class Prepared {
        public final File directory;
        public final List<Page> pages;
        public final long bytes;
        public final int chapters;
        Prepared(File directory, List<Page> pages, long bytes) {
            this.directory=directory; this.pages=Collections.unmodifiableList(pages); this.bytes=bytes;
            Set<String> ids=new HashSet<>(); for(Page p:pages)ids.add(p.chapterId); chapters=ids.size();
        }
    }
    private LocalComicImporter() { }
    public static String identity(String device, String kind, String selectedUri) {
        if(device==null||device.isEmpty()||selectedUri==null||selectedUri.isEmpty()||!("cbz".equals(kind)||"folder".equals(kind)))throw new IllegalArgumentException("Invalid local import identity");
        return "local:"+hash("android-local-v1\n"+device+"\n"+kind+"\n"+selectedUri);
    }
    public static String hash(String value) {
        try { byte[] bytes=MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)); StringBuilder out=new StringBuilder(); for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b&255)); return out.toString(); }
        catch(Exception e) { throw new IllegalStateException(e); }
    }
    public static String safeName(String value) throws IOException {
        if(value==null||value.length()>1024||value.startsWith("/")||value.indexOf('\\')>=0)throw new IOException("Unsafe local comic path");
        String name=Normalizer.normalize(value,Normalizer.Form.NFC);
        if(name.endsWith("/"))name=name.substring(0,name.length()-1);
        String[] parts=name.split("/",-1);
        if(parts.length>MAX_DEPTH+1)throw new IOException("Local comic path is too deep");
        for(String part:parts) {
            if(part.isEmpty()||".".equals(part)||"..".equals(part)||part.endsWith(".")||part.endsWith(" ")||part.matches("(?i)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\\..*)?"))throw new IOException("Unsafe local comic path");
            for(int i=0;i<part.length();i++)if(part.charAt(i)<32||"<>:\"|?*".indexOf(part.charAt(i))>=0)throw new IOException("Unsafe local comic path");
        }
        return name;
    }
    private static String extension(String name) {
        int dot=name.lastIndexOf('.'); String ext=dot<0?"":name.substring(dot+1).toLowerCase(Locale.ROOT);
        return Arrays.asList("jpg","jpeg","png","gif","webp").contains(ext)?ext:"";
    }
    public static int naturalCompare(String left,String right) {
        int a=0,b=0; while(a<left.length()&&b<right.length()) {
            char x=left.charAt(a),y=right.charAt(b);
            if(x>='0'&&x<='9'&&y>='0'&&y<='9') {
                int ae=a,be=b;while(ae<left.length()&&Character.isDigit(left.charAt(ae)))ae++;while(be<right.length()&&Character.isDigit(right.charAt(be)))be++;
                int az=a,bz=b;while(az<ae-1&&left.charAt(az)=='0')az++;while(bz<be-1&&right.charAt(bz)=='0')bz++;
                int c=Integer.compare(ae-az,be-bz);if(c==0)c=left.substring(az,ae).compareTo(right.substring(bz,be));if(c!=0)return c;a=ae;b=be;
            } else { int c=Character.compare(Character.toLowerCase(x),Character.toLowerCase(y));if(c!=0)return c;a++;b++; }
        }
        int c=Integer.compare(left.length()-a,right.length()-b);return c==0?left.compareTo(right):c;
    }
    public static Source zip(File archive) throws IOException {
        if(!archive.isFile()||archive.length()>MAX_ARCHIVE)throw new IOException("CBZ exceeds 256 MiB");
        final ZipFile zip=new ZipFile(archive);
        return new Source() {
            public List<Input> entries() throws IOException {
                ArrayList<Input> values=new ArrayList<>(); Enumeration<? extends ZipEntry> entries=zip.entries();
                while(entries.hasMoreElements()) { ZipEntry entry=entries.nextElement();if(values.size()>=MAX_ENTRIES)throw new IOException("Too many archive entries"); values.add(new Input(entry.getName(),entry.getSize(),entry.getCrc(),entry.isDirectory(),()->zip.getInputStream(entry))); }
                return values;
            }
            public void close() throws IOException { zip.close(); }
        };
    }
    public static Prepared prepare(String title, Source source, File staging, Cancellation cancel) throws IOException {
        if(!staging.isDirectory()||staging.list()==null||staging.list().length!=0)throw new IOException("Expected empty import staging");
        List<Input> all=source.entries(); if(all.size()>MAX_ENTRIES)throw new IOException("Too many comic entries");
        ArrayList<Input> pages=new ArrayList<>(); Set<String> names=new HashSet<>();
        for(Input input:all) { cancel.check();String name=safeName(input.name);if(!names.add(name.toLowerCase(Locale.ROOT)))throw new IOException("Duplicate local comic path");if(!input.directory&&!extension(name).isEmpty()){if(input.size>MAX_PAGE)throw new IOException("Page exceeds 20 MiB");pages.add(input);} }
        if(pages.isEmpty()||pages.size()>MAX_PAGES)throw new IOException("Comic must contain 1–2000 raster pages");
        pages.sort((a,b)->naturalCompare(a.name,b.name)); ArrayList<Page> copied=new ArrayList<>(); long total=0;
        for(Input input:pages) {
            cancel.check();String name=safeName(input.name),ext=extension(name),file=hash(name)+"."+ext;File target=new File(staging,file);long count=0;CRC32 crc=new CRC32();byte[] header=new byte[12];int headerLength=0;
            try(InputStream in=input.open.open();FileOutputStream out=new FileOutputStream(target)) {
                if(in==null)throw new IOException("Unreadable comic page");byte[] buffer=new byte[32768];int n;
                while((n=in.read(buffer))!=-1) { cancel.check();count+=n;total+=n;if(count>MAX_PAGE||total>MAX_TOTAL)throw new IOException("Comic decoded bytes exceed limit");int h=Math.min(n,header.length-headerLength);if(h>0){System.arraycopy(buffer,0,header,headerLength,h);headerLength+=h;}crc.update(buffer,0,n);out.write(buffer,0,n); }
                out.getFD().sync();
            }
            if(count==0||(input.size>=0&&count!=input.size)||(input.crc>=0&&crc.getValue()!=input.crc)||!signature(header,headerLength,ext))throw new IOException("Invalid image, length or CRC");
            copied.add(new Page(name,file,count,title));
        }
        cancel.check();return new Prepared(staging,copied,total);
    }
    private static boolean signature(byte[] h,int n,String ext) {
        if(("jpg".equals(ext)||"jpeg".equals(ext)))return n>=3&&(h[0]&255)==255&&(h[1]&255)==216&&(h[2]&255)==255;
        if("png".equals(ext))return n>=8&&Arrays.equals(Arrays.copyOf(h,8),new byte[]{(byte)137,80,78,71,13,10,26,10});
        if("gif".equals(ext))return n>=6&&(new String(h,0,6,StandardCharsets.US_ASCII).equals("GIF87a")||new String(h,0,6,StandardCharsets.US_ASCII).equals("GIF89a"));
        return "webp".equals(ext)&&n>=12&&new String(h,0,4,StandardCharsets.US_ASCII).equals("RIFF")&&new String(h,8,4,StandardCharsets.US_ASCII).equals("WEBP");
    }
}
