package com.picalibrary.android;

import static org.junit.Assert.*;
import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,application=android.app.Application.class)
public class HostSavedBooksTest {
    static final String HOST="64d223e0-5d29-4320-babb-5a2da654d345",PRINCIPAL="a".repeat(64),SOURCE="-9223372036854775808";
    static final String CANONICAL_ID="hosted:64d223e0-5d29-4320-babb-5a2da654d345:25af778685e28ef0d4240a872e34c6556938e4e9e842b6eb0346a640cacf6305";
    private Context context;private HostSavedBooks store;private File file;
    @Before public void setup(){context=RuntimeEnvironment.getApplication();store=new HostSavedBooks(context);file=new File(context.getFilesDir(),"user-host-saved-books-v1.json");}
    static HostSavedBooks.Book book(int index)throws Exception {return book(index,PRINCIPAL,SOURCE,"Book "+index);}
    static HostSavedBooks.Book book(int index,String principal,String source,String title)throws Exception {
        String urlDigest=ReaderPolicy.hash("/owned-synthetic-book/"+index),id="hosted:"+HOST+":"+ReaderPolicy.hash(new JSONArray().put(principal).put(source).put(urlDigest).toString());
        return new HostSavedBooks.Book(id,HOST,principal,source,index,urlDigest,title,"Owned fixture Host","2026-10-27T00:00:00Z");
    }
    private void bytes(byte[] bytes)throws Exception {Files.write(file.toPath(),bytes);}
    private void json(JSONObject root)throws Exception {bytes(root.toString().getBytes(StandardCharsets.UTF_8));}
    private JSONObject root(JSONArray rows)throws Exception {return new JSONObject().put("schemaVersion",1).put("books",rows);}
    @Test public void missingStorageIsEmptyWithoutCreatingAnyFile()throws Exception {assertEquals(0,store.load().size());assertFalse(file.exists());}
    @Test public void referenceSurvivesFreshStoreAndRetainsExactLongStringIdentity()throws Exception {
        HostSavedBooks.Book original=book(1);store.put(original);HostSavedBooks.Book loaded=new HostSavedBooks(context).load().get(0);
        assertEquals(CANONICAL_ID,original.comicId);
        assertEquals(original.comicId,loaded.comicId);assertEquals(SOURCE,loaded.sourceId);assertEquals(original.urlDigest,loaded.urlDigest);assertEquals(original.savedAt,loaded.savedAt);
        assertThrows(UnsupportedOperationException.class,()->store.load().clear());
    }
    @Test public void duplicateSaveDoesNotAddOrPruneRecordsAndMetadataRefreshKeepsOriginalSaveDate()throws Exception {
        HostSavedBooks.Book original=book(1);store.put(original);byte[] before=Files.readAllBytes(file.toPath());store.put(original);assertArrayEquals(before,Files.readAllBytes(file.toPath()));
        HostSavedBooks.Book changed=book(1,PRINCIPAL,SOURCE,"New verified title");store.put(changed);assertEquals(1,store.load().size());assertEquals(changed.title,store.load().get(0).title);assertEquals(original.savedAt,store.load().get(0).savedAt);
    }
    @Test public void sameTitleDifferentPrincipalSourceOrUrlNeverAliases()throws Exception {
        for(HostSavedBooks.Book book:new HostSavedBooks.Book[]{book(1),book(1,"b".repeat(64),SOURCE,"Book 1"),book(1,PRINCIPAL,"0","Book 1"),book(2,PRINCIPAL,SOURCE,"Book 1")})store.put(book);
        assertEquals(4,store.load().size());assertEquals(4,new HashSet<>(Arrays.asList(store.load().get(0).comicId,store.load().get(1).comicId,store.load().get(2).comicId,store.load().get(3).comicId)).size());
    }
    @Test public void removingOneReferenceDoesNotTouchOtherReferencesOrReadingFiles()throws Exception {
        HostSavedBooks.Book first=book(1),second=book(2);store.put(first);store.put(second);File other=new File(context.getFilesDir(),"owned-history-canary.txt");Files.write(other.toPath(),new byte[]{7,8});
        store.remove(first.comicId);assertEquals(second.comicId,store.load().get(0).comicId);assertArrayEquals(new byte[]{7,8},Files.readAllBytes(other.toPath()));
        byte[] before=Files.readAllBytes(file.toPath());store.remove(first.comicId);assertArrayEquals(before,Files.readAllBytes(file.toPath()));
    }
    @Test public void malformedDuplicateTrailingAndFutureRootFilesAreNotResetOrOverwritten()throws Exception {
        String good=root(new JSONArray().put(book(1).json())).toString();
        for(String value:new String[]{"{broken",good+" trailing","{\"schemaVersion\":1,\"schemaVersion\":1,\"books\":[]}",root(new JSONArray()).put("schemaVersion",2).toString(),root(new JSONArray()).put("token","must-not-import").toString()}){
            byte[] before=value.getBytes(StandardCharsets.UTF_8);bytes(before);assertThrows(Exception.class,()->store.load());assertThrows(Exception.class,()->store.put(book(2)));assertThrows(Exception.class,()->store.remove(book(1).comicId));assertArrayEquals(before,Files.readAllBytes(file.toPath()));
        }
    }
    @Test public void duplicateOrMalformedEntryAndUnexpectedCredentialFieldsFailClosed()throws Exception {
        JSONObject valid=book(1).json();
        for(JSONArray rows:new JSONArray[]{new JSONArray().put(valid).put(valid),new JSONArray().put(book(1).json().put("password","not-allowed")),new JSONArray().put(book(1).json().put("comicId",book(2).comicId)),new JSONArray().put(book(1).json().put("sourceId",-1)),new JSONArray().put(book(1).json().put("remoteId","1")),new JSONArray().put(book(1).json().put("savedAt","invalid"))}){
            json(root(rows));byte[] before=Files.readAllBytes(file.toPath());assertThrows(Exception.class,()->store.put(book(3)));assertArrayEquals(before,Files.readAllBytes(file.toPath()));
        }
    }
    @Test public void fullCollectionRejectsAnExtraBookWithoutEvictingAnyUserSelection()throws Exception {
        JSONArray rows=new JSONArray();for(int i=1;i<=HostSavedBooks.MAX_BOOKS;i++)rows.put(book(i).json());json(root(rows));byte[] before=Files.readAllBytes(file.toPath());
        assertThrows(IOException.class,()->store.put(book(501)));assertEquals(500,store.load().size());assertArrayEquals(before,Files.readAllBytes(file.toPath()));
    }
    @Test public void oversizedOrInvalidUtf8InputIsRetainedAndRefusesWrites()throws Exception {
        for(byte[] before:new byte[][]{new byte[HostSavedBooks.MAX_BYTES+1],new byte[]{(byte)0xff}}){bytes(before);assertThrows(Exception.class,()->store.put(book(1)));assertArrayEquals(before,Files.readAllBytes(file.toPath()));}
    }
    @Test public void serializedAllowlistContainsNoEndpointRawUrlSessionAuthOrAccountName()throws Exception {
        store.put(book(1));JSONObject root=HostJson.object(Files.readAllBytes(file.toPath())),row=root.getJSONArray("books").getJSONObject(0);
        assertEquals(2,root.length());assertEquals(9,row.length());for(String key:new String[]{"endpoint","url","auth","username","password","cookie","token","sessionId","pages"})assertFalse(row.has(key));
        assertEquals(0,LocalComicStore.list(context).size());assertEquals(0,UnifiedCatalogStore.load(context).byId.size());
    }
    @Test public void independentStoreInstancesSerializeConcurrentWritesInThisProcess()throws Exception {
        HostSavedBooks other=new HostSavedBooks(context);HostSavedBooks.Book first=book(1),second=book(2);java.util.concurrent.ExecutorService workers=java.util.concurrent.Executors.newFixedThreadPool(2);java.util.concurrent.CountDownLatch start=new java.util.concurrent.CountDownLatch(1);
        try{java.util.concurrent.Future<?> a=workers.submit(()->{start.await();store.put(first);return null;}),b=workers.submit(()->{start.await();other.put(second);return null;});start.countDown();a.get(5,java.util.concurrent.TimeUnit.SECONDS);b.get(5,java.util.concurrent.TimeUnit.SECONDS);assertEquals(2,store.load().size());}finally{workers.shutdownNow();}
    }
    @Test public void frameworkAtomicFileRecoversItsValidBackupInsteadOfResettingTheCollection()throws Exception {
        store.put(book(1));byte[] original=Files.readAllBytes(file.toPath());Files.write(new File(file+".bak").toPath(),original);Files.write(file.toPath(),"{interrupted owned fixture".getBytes(StandardCharsets.UTF_8));
        assertEquals(book(1).comicId,new HostSavedBooks(context).load().get(0).comicId);assertArrayEquals(original,Files.readAllBytes(file.toPath()));
    }
}
