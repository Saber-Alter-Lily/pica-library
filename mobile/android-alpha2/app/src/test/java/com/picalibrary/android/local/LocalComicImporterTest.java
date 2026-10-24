package com.picalibrary.android.local;

import static org.junit.Assert.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;

public class LocalComicImporterTest {
    @Rule public TemporaryFolder temporary=new TemporaryFolder();
    private final byte[] png=new byte[]{(byte)137,80,78,71,13,10,26,10,0,0,0,0};
    private LocalComicImporter.Input image(String name){return new LocalComicImporter.Input(name,png.length,false,()->new ByteArrayInputStream(png));}
    private LocalComicImporter.Prepared prepare(LocalComicImporter.Input... files) throws Exception {return LocalComicImporter.prepare("Synthetic",()->Arrays.asList(files),temporary.newFolder(),()->{});}
    @Test public void naturalOrderChaptersAndStablePageIdentity() throws Exception {
        LocalComicImporter.Prepared result=prepare(image("ch10/1.png"),image("ch2/10.png"),image("ch2/2.png"),new LocalComicImporter.Input("info.txt",100,false,()->{throw new AssertionError("Do not inflate irrelevant metadata");}));
        assertEquals(3,result.pages.size());assertEquals(2,result.chapters);assertEquals("ch2/2.png",result.pages.get(0).name);assertEquals("ch2/10.png",result.pages.get(1).name);
        assertEquals(result.pages.get(0).id,prepare(image("ch2/2.png")).pages.get(0).id);
        assertFalse(new File(result.directory,"ch2").exists()); // Original archive names are never extraction paths.
    }
    @Test public void identitiesAreDeviceKindAndOriginScopedNotDisplayNameScoped(){
        String id=LocalComicImporter.identity("deviceA","cbz","content://authority/book");assertTrue(id.matches("local:[0-9a-f]{64}"));assertEquals(id,LocalComicImporter.identity("deviceA","cbz","content://authority/book"));assertNotEquals(id,LocalComicImporter.identity("deviceB","cbz","content://authority/book"));assertNotEquals(id,LocalComicImporter.identity("deviceA","folder","content://authority/book"));
    }
    @Test public void rejectsTraversalControlsReservedNamesAndDepth() {
        for(String name:new String[]{"../1.png","/1.png","C:/1.png","a\\1.png","a//1.png","NUL.png","a:secret.png","a/../1.png","a/1.png ","a\u0000.png","a/b/c/d/e/f/g/h/i/j.png"})assertThrows(name,IOException.class,()->prepare(image(name)));
    }
    @Test public void rejectsCaseAndUnicodeAliasDuplicates() {
        assertThrows(IOException.class,()->prepare(image("A.png"),image("a.png")));assertThrows(IOException.class,()->prepare(image("é.png"),image("e\u0301.png")));
    }
    @Test public void rejectsFakeImagesLengthsAndCrc() {
        assertThrows(IOException.class,()->prepare(new LocalComicImporter.Input("a.png",5,false,()->new ByteArrayInputStream(new byte[5]))));
        assertThrows(IOException.class,()->prepare(new LocalComicImporter.Input("a.png",1,false,()->new ByteArrayInputStream(png))));
        assertThrows(IOException.class,()->prepare(new LocalComicImporter.Input("a.png",png.length,1,false,()->new ByteArrayInputStream(png))));
    }
    @Test public void enforcesInventoryAndPageCapsBeforeReading() throws Exception {
        List<LocalComicImporter.Input> values=new ArrayList<>();for(int i=0;i<2001;i++)values.add(image(i+".png"));File target=temporary.newFolder();assertThrows(IOException.class,()->LocalComicImporter.prepare("",()->values,target,()->{}));assertEquals(0,target.list().length);
        assertThrows(IOException.class,()->prepare(new LocalComicImporter.Input("1.png",LocalComicImporter.MAX_PAGE+1,false,()->{throw new AssertionError();})));
    }
    @Test public void enforcesActualInflatedBytesEvenIfMetadataIsUnknown() throws Exception {
        assertThrows(IOException.class,()->prepare(new LocalComicImporter.Input("1.png",-1,false,()->new InputStream(){long remaining=LocalComicImporter.MAX_PAGE+1;public int read(){return remaining-->0?0:-1;}public int read(byte[] data,int offset,int length){if(remaining==0)return -1;int count=(int)Math.min(length,remaining);Arrays.fill(data,offset,offset+count,(byte)0);remaining-=count;return count;}})));
    }
    @Test public void cancellationStopsBeforeOpeningSourcePages() throws Exception {
        File stage=temporary.newFolder();assertThrows(IOException.class,()->LocalComicImporter.prepare("",()->Collections.singletonList(image("1.png")),stage,()->{throw new IOException("cancelled");}));assertEquals(0,stage.list().length);
    }
    @Test public void existingNonemptyStagingCannotBeOverwritten() throws Exception {
        File stage=temporary.newFolder();Files.write(new File(stage,"keep").toPath(),new byte[]{1});assertThrows(IOException.class,()->LocalComicImporter.prepare("",()->Collections.singletonList(image("1.png")),stage,()->{}));assertArrayEquals(new byte[]{1},Files.readAllBytes(new File(stage,"keep").toPath()));
    }
    @Test public void usesJavaZipWithCrcValidationAndNoPathExtraction() throws Exception {
        File archive=temporary.newFile("comic.cbz");try(ZipOutputStream zip=new ZipOutputStream(new FileOutputStream(archive))){zip.putNextEntry(new ZipEntry("chapter/10.png"));zip.write(png);zip.closeEntry();zip.putNextEntry(new ZipEntry("chapter/2.png"));zip.write(png);zip.closeEntry();}
        try(LocalComicImporter.Source source=LocalComicImporter.zip(archive)){LocalComicImporter.Prepared result=LocalComicImporter.prepare("",source,temporary.newFolder(),()->{});assertEquals("chapter/2.png",result.pages.get(0).name);assertEquals(2,result.pages.size());}
    }
    @Test public void emptyArchiveAndUnsafeIrrelevantEntryFailClosed() throws Exception {
        assertThrows(IOException.class,()->prepare());assertThrows(IOException.class,()->prepare(image("a.png"),new LocalComicImporter.Input("../private.txt",0,false,()->new ByteArrayInputStream(new byte[0]))));
    }
}
