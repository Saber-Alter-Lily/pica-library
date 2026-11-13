package com.picalibrary.android.local;

import static org.junit.Assert.*;
import java.io.*;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;

/** Plain-Java stream/ZIP boundaries; no Android runtime or external provider. */
public class LocalComicExporterTest {
    @Rule public TemporaryFolder temporary=new TemporaryFolder();
    private final byte[] png=new byte[]{(byte)137,80,78,71,13,10,26,10,0,0,0,0};
    private LocalComicImporter.Input image(String name){return new LocalComicImporter.Input(name,png.length,false,()->new ByteArrayInputStream(png));}
    private LocalComicExporter.Result write(ByteArrayOutputStream out,LocalComicImporter.Input... input) throws Exception {return LocalComicExporter.write(Arrays.asList(input),out,()->{});}
    @Test public void writesOnlyBodyNamesAndBytesAndRoundTripsThroughExistingImporter() throws Exception {
        ByteArrayOutputStream out=new ByteArrayOutputStream();LocalComicExporter.Result receipt=write(out,image("章10/1.png"),image("章2/10.png"),image("章2/2.png"));
        assertEquals(3,receipt.pages);assertEquals(2,receipt.chapters);assertEquals(png.length*3,receipt.bodyBytes);assertEquals(out.size(),receipt.archiveBytes);
        StringBuilder sha=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(out.toByteArray()))sha.append(String.format(Locale.ROOT,"%02x",b&255));assertEquals(sha.toString(),receipt.sha256);
        File archive=temporary.newFile("body.cbz");Files.write(archive.toPath(),out.toByteArray());
        try(ZipFile zip=new ZipFile(archive)){assertEquals(3,zip.size());assertNull(zip.getEntry("manifest.json"));assertNull(zip.getComment());Enumeration<? extends ZipEntry> entries=zip.entries();assertEquals("章2/2.png",entries.nextElement().getName());}
        try(LocalComicImporter.Source source=LocalComicImporter.zip(archive)){
            LocalComicImporter.Prepared result=LocalComicImporter.prepare("Synthetic",source,temporary.newFolder(),()->{});
            assertEquals(3,result.pages.size());assertEquals("章2/2.png",result.pages.get(0).name);for(LocalComicImporter.Page page:result.pages)assertArrayEquals(png,Files.readAllBytes(new File(result.directory,page.file).toPath()));
        }
    }
    @Test public void callerStillOwnsOutputAfterSuccessfulZipClose() throws Exception {
        class Sink extends ByteArrayOutputStream {boolean closed;@Override public void close(){closed=true;}}
        Sink sink=new Sink();write(sink,image("1.png"));assertFalse(sink.closed);sink.write(5);
    }
    @Test public void doesNotCloseCallerOutputOnFailure() {
        class Sink extends ByteArrayOutputStream {boolean closed;@Override public void close(){closed=true;}}
        Sink sink=new Sink();assertThrows(IOException.class,()->write(sink,new LocalComicImporter.Input("1.png",3,false,()->new ByteArrayInputStream(new byte[]{1,2,3}))));assertFalse(sink.closed);
    }
    @Test public void rejectsEmptyOversizedAndUnsupportedInventoriesBeforeWriting() throws Exception {
        ByteArrayOutputStream sink=new ByteArrayOutputStream();assertThrows(IOException.class,()->write(sink));
        List<LocalComicImporter.Input> all=new ArrayList<>();for(int i=0;i<=LocalComicImporter.MAX_PAGES;i++)all.add(image(i+".png"));assertThrows(IOException.class,()->LocalComicExporter.write(all,sink,()->{}));
        assertThrows(IOException.class,()->write(sink,image("body.pdf")));assertThrows(IOException.class,()->write(sink,new LocalComicImporter.Input("1.png",1,true,()->{throw new AssertionError();})));assertEquals(0,sink.size());
    }
    @Test public void rejectsUnsafeNamesAndCaseUnicodeDuplicates() {
        for(String name:new String[]{"../1.png","/1.png","C:/1.png","a\\1.png","NUL.png","a:ads.png","a//1.png","a/1.png ","a.png/","a\u0000.png","a/b/c/d/e/f/g/h/i/j.png"})assertThrows(name,IOException.class,()->write(new ByteArrayOutputStream(),image(name)));
        assertThrows(IOException.class,()->write(new ByteArrayOutputStream(),image("A.png"),image("a.png")));assertThrows(IOException.class,()->write(new ByteArrayOutputStream(),image("é.png"),image("e\u0301.png")));
    }
    @Test public void metadataPageAndTotalLimitsRejectBeforeOpeningStreams() {
        ByteArrayOutputStream sink=new ByteArrayOutputStream();assertThrows(IOException.class,()->write(sink,new LocalComicImporter.Input("1.png",LocalComicImporter.MAX_PAGE+1,false,()->{throw new AssertionError();})));
        List<LocalComicImporter.Input> all=new ArrayList<>();for(int i=0;i<27;i++)all.add(new LocalComicImporter.Input(i+".png",LocalComicImporter.MAX_PAGE,false,()->{throw new AssertionError();}));assertThrows(IOException.class,()->LocalComicExporter.write(all,sink,()->{}));assertEquals(0,sink.size());
    }
    @Test public void verifiesSignatureActualLengthAndOptionalCrc() {
        assertThrows(IOException.class,()->write(new ByteArrayOutputStream(),new LocalComicImporter.Input("1.png",1,false,()->new ByteArrayInputStream(png))));
        assertThrows(IOException.class,()->write(new ByteArrayOutputStream(),new LocalComicImporter.Input("1.png",png.length,1,false,()->new ByteArrayInputStream(png))));
        assertThrows(IOException.class,()->write(new ByteArrayOutputStream(),new LocalComicImporter.Input("1.png",12,false,()->new ByteArrayInputStream(new byte[12]))));
    }
    @Test public void unknownLengthStillEnforcesActualPageBound() {
        assertThrows(IOException.class,()->LocalComicExporter.write(Collections.singletonList(stream("1.png",LocalComicImporter.MAX_PAGE+1,false)),discard(),()->{}));
    }
    @Test public void unknownLengthsStillEnforceTotalBoundWithoutLargeHeapBuffers() {
        List<LocalComicImporter.Input> all=new ArrayList<>();for(int i=0;i<27;i++)all.add(stream(i+".png",LocalComicImporter.MAX_PAGE,false));assertThrows(IOException.class,()->LocalComicExporter.write(all,discard(),()->{}));
    }
    @Test public void limitsActualCompressedArchiveIncludingZipMetadata() {
        List<LocalComicImporter.Input> all=new ArrayList<>();for(int i=0;i<14;i++)all.add(stream(i+".png",LocalComicImporter.MAX_PAGE,true));
        IOException failure=assertThrows(IOException.class,()->LocalComicExporter.write(all,discard(),()->{}));assertTrue(failure.getMessage().contains("256 MiB"));
    }
    @Test public void cancellationCanStopBeforeOpeningPageStreams() {
        AtomicInteger opened=new AtomicInteger();assertThrows(IOException.class,()->LocalComicExporter.write(Collections.singletonList(new LocalComicImporter.Input("1.png",12,false,()->{opened.incrementAndGet();return new ByteArrayInputStream(png);})),discard(),()->{throw new IOException("cancelled");}));assertEquals(0,opened.get());
    }
    @Test public void cancellationDuringStreamingDoesNotProduceSuccessReceipt() {
        AtomicInteger readBytes=new AtomicInteger();final boolean[] closed={false};
        byte[] body=new byte[100000];System.arraycopy(png,0,body,0,png.length);
        LocalComicImporter.Input page=new LocalComicImporter.Input("1.png",body.length,false,()->new ByteArrayInputStream(body){
            @Override public synchronized int read(byte[] buffer,int offset,int length){int n=super.read(buffer,offset,length);if(n>0)readBytes.addAndGet(n);return n;}
            @Override public void close() throws IOException {closed[0]=true;super.close();}
        });
        IOException failure=assertThrows(IOException.class,()->LocalComicExporter.write(Collections.singletonList(page),discard(),()->{if(readBytes.get()>=65536)throw new IOException("cancelled during body copy");}));
        assertEquals("cancelled during body copy",failure.getMessage());assertTrue(readBytes.get()>=65536);assertTrue(readBytes.get()<body.length);assertTrue(closed[0]);
    }
    @Test public void propagatesSinkFailuresAndClosesOpenedInputs() {
        final boolean[] closed={false};LocalComicImporter.Input page=new LocalComicImporter.Input("1.png",png.length,false,()->new ByteArrayInputStream(png){@Override public void close() throws IOException {closed[0]=true;super.close();}});
        OutputStream sink=new OutputStream(){int bytes;public void write(int b) throws IOException {if(++bytes>70)throw new IOException("Synthetic disk full");}public void write(byte[] b,int off,int len) throws IOException {for(int i=0;i<len;i++)write(b[off+i]);}};
        assertThrows(IOException.class,()->LocalComicExporter.write(Collections.singletonList(page),sink,()->{}));assertTrue(closed[0]);
    }
    @Test public void rejectsNonProgressingStreamsRatherThanSpinning() {
        assertThrows(IOException.class,()->write(new ByteArrayOutputStream(),new LocalComicImporter.Input("1.png",-1,false,()->new InputStream(){public int read(){return 0;}public int read(byte[] b,int off,int len){return 0;}})));
    }
    private OutputStream discard(){return new OutputStream(){public void write(int value){}public void write(byte[] b,int offset,int length){}};}
    private LocalComicImporter.Input stream(String name,long length,boolean random){
        return new LocalComicImporter.Input(name,-1,false,()->new InputStream(){long position;final Random rng=new Random(81);public int read(){byte[] one=new byte[1];return read(one,0,1)==-1?-1:one[0]&255;}public int read(byte[] buffer,int offset,int size){if(position==length)return -1;int n=(int)Math.min(size,length-position);if(random){byte[] data=new byte[n];rng.nextBytes(data);System.arraycopy(data,0,buffer,offset,n);}else Arrays.fill(buffer,offset,offset+n,(byte)0);for(int i=0;i<n&&position+i<png.length;i++)buffer[offset+i]=png[(int)(position+i)];position+=n;return n;}});
    }
}
