package com.picalibrary.android;

import static org.junit.Assert.*;
import android.content.Context;
import java.io.*;
import java.nio.file.Files;
import java.util.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,application=android.app.Application.class)
public class HostOfflineSaverTest {
    private Context context;private HostTestFixture fixture;private HostSourceManager.Book book;private HostSourceManager.Session grant;private String chapter;
    @Before public void setup()throws Exception {context=RuntimeEnvironment.getApplication();fixture=new HostTestFixture(context);book=fixture.selected();grant=fixture.manager.requireSession();chapter=fixture.manager.chapters(grant,book.id).get(0).id;}
    @After public void end(){fixture.manager.end();}
    private LocalComicStore.Comic save()throws Exception{return HostOfflineSaver.save(context,fixture.manager,grant,book.id,chapter,true,(complete,total)->{});}
    @Test public void separateSaveConsentIsRequiredBeforeAnyRequestOrWrite()throws Exception {
        int requests=fixture.opened.size();assertThrows(IOException.class,()->HostOfflineSaver.save(context,fixture.manager,grant,book.id,chapter,false,(complete,total)->{}));assertEquals(requests,fixture.opened.size());assertEquals(0,LocalComicStore.list(context).size());
    }
    @Test public void completeChapterReadsOfflineViaExistingLocalReaderAndLibrary()throws Exception {
        List<Integer> progress=new ArrayList<>();LocalComicStore.Comic comic=HostOfflineSaver.save(context,fixture.manager,grant,book.id,chapter,true,(complete,total)->{assertEquals(2,total);progress.add(complete);});assertEquals(Arrays.asList(1,2),progress);assertEquals(2,comic.pages.size());fixture.manager.end();int requests=fixture.opened.size();
        LocalComicReaderSource reader=new LocalComicReaderSource(context);BridgeClient.ChapterData data=reader.chapter(comic.id,reader.chapters(comic.id).get(0).id);assertEquals(2,data.pages.size());assertEquals(comic.title,reader.displayTitle(comic.id));assertTrue(data.pages.get(0).url.startsWith("file://"));assertNull(reader.sourceAccess());assertArrayEquals(HostTestFixture.PNG,Files.readAllBytes(LocalComicStore.pageFile(context,comic,comic.pages.get(0)).toPath()));
        UnifiedCatalogStore.Entry entry=UnifiedCatalogStore.reconcileLocalReferences(context).byId.get(comic.id);assertTrue(entry.localImported);assertEquals("local",entry.providerId);assertFalse(entry.picaAvailable);assertFalse(entry.ehAvailable);assertEquals(requests,fixture.opened.size());
        String manifest=Files.readString(new File(LocalComicStore.root(context),comic.id.substring(6)+"/manifest.json").toPath());assertFalse(manifest.contains("fixture.invalid"));assertFalse(manifest.contains("host-page:"));assertFalse(manifest.contains("Authorization"));assertFalse(manifest.contains(HostTestFixture.SOURCE));
    }
    @Test public void failedImageCannotReplaceExistingCommittedCopy()throws Exception {
        LocalComicStore.Comic old=save();byte[] pointer=Files.readAllBytes(new File(LocalComicStore.root(context),old.id.substring(6)+"/manifest.json").toPath());fixture.image="not a raster".getBytes(java.nio.charset.StandardCharsets.UTF_8);assertThrows(Exception.class,this::save);assertArrayEquals(pointer,Files.readAllBytes(new File(LocalComicStore.root(context),old.id.substring(6)+"/manifest.json").toPath()));assertTrue(LocalComicStore.pageFile(context,old,old.pages.get(0)).isFile());noScratch();
    }
    @Test public void revocationDuringTransferLeavesNoPublishedPartialComic()throws Exception {
        fixture.imageRead=fixture.manager::end;assertThrows(Exception.class,this::save);assertEquals(0,LocalComicStore.list(context).size());noScratch();
    }
    @Test public void oldSaveDialogCannotUseANewerSessionGrant()throws Exception {
        fixture.manager.end();fixture.manager.start("","",true);int requests=fixture.opened.size();assertThrows(Exception.class,this::save);assertEquals(requests,fixture.opened.size());assertEquals(0,LocalComicStore.list(context).size());
    }
    @Test public void rerunningSameExplicitSaveUsesSameLocalIdentityAndNewAtomicGeneration()throws Exception {
        LocalComicStore.Comic old=save(),next=save();assertEquals(old.id,next.id);assertNotEquals(old.generation,next.generation);assertEquals(1,LocalComicStore.list(context).size());assertTrue(LocalComicStore.pageFile(context,old,old.pages.get(0)).isFile());assertEquals(next.generation,LocalComicStore.read(context,next.id).generation);noScratch();
    }
    private void noScratch(){File[] rows=new File(context.getFilesDir(),"local-comic-staging-v1").listFiles();assertTrue(rows==null||rows.length==0);}
}
