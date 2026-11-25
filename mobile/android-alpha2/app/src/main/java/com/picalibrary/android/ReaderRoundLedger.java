package com.picalibrary.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import java.util.*;

/** Separate app-private index. Never mutates favorites, catalog or reader progress. */
final class ReaderRoundLedger extends SQLiteOpenHelper {
    private static ReaderRoundLedger instance;
    static synchronized ReaderRoundLedger get(Context c){
        if(instance==null)instance=new ReaderRoundLedger(c.getApplicationContext());return instance;
    }
    private ReaderRoundLedger(Context c){super(c,"reader-round-v1.db",null,2);setWriteAheadLoggingEnabled(true);}
    private static void addKnownWorks(SQLiteDatabase d){d.execSQL("CREATE TABLE IF NOT EXISTS shown_work(work TEXT PRIMARY KEY NOT NULL)");}
    @Override public void onCreate(SQLiteDatabase d){
        d.execSQL("CREATE TABLE shown(upload TEXT PRIMARY KEY NOT NULL)");
        addKnownWorks(d);
        d.execSQL("CREATE TABLE author_clock(author TEXT PRIMARY KEY NOT NULL, round_no INTEGER NOT NULL)");
        d.execSQL("CREATE TABLE following(author TEXT PRIMARY KEY NOT NULL,label TEXT NOT NULL,since INTEGER NOT NULL)");
        d.execSQL("CREATE TABLE baseline(author TEXT NOT NULL,provider TEXT NOT NULL,PRIMARY KEY(author,provider))");
        d.execSQL("CREATE TABLE works(author TEXT NOT NULL,upload TEXT NOT NULL,chapters INTEGER NOT NULL,PRIMARY KEY(author,upload))");
        d.execSQL("CREATE TABLE inbox(author TEXT NOT NULL,upload TEXT NOT NULL,chapter INTEGER NOT NULL,title TEXT NOT NULL,stamp INTEGER NOT NULL,PRIMARY KEY(author,upload,chapter))");
    }
    @Override public void onUpgrade(SQLiteDatabase d,int oldVersion,int newVersion){if(oldVersion==1&&newVersion==2)addKnownWorks(d);else throw new IllegalStateException("Unsupported reader ledger version");}
    Set<String> shownWorks(){
        Set<String> out=new HashSet<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT work FROM shown_work",null)){while(c.moveToNext())out.add("work:"+c.getString(0));}return out;
    }
    Set<String> shown(){
        Set<String> out=new HashSet<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT upload FROM shown",null)){while(c.moveToNext())out.add(c.getString(0));}return out;
    }
    Map<String,Integer> clocks(){
        Map<String,Integer> out=new HashMap<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT author,round_no FROM author_clock",null)){while(c.moveToNext())out.put(c.getString(0),c.getInt(1));}return out;
    }
    void presented(int ordinal,Collection<NativeRecommendationStore.Item> items){
        SQLiteDatabase d=getWritableDatabase();d.beginTransaction();try{
            for(NativeRecommendationStore.Item item:items)if(item!=null&&!item.comicId.isEmpty()){
                d.execSQL("INSERT OR IGNORE INTO shown(upload) VALUES(?)",new Object[]{item.comicId});
                if(!item.confirmedWorkId.isEmpty())d.execSQL("INSERT OR IGNORE INTO shown_work(work) VALUES(?)",new Object[]{item.confirmedWorkId});
                String a=ReaderRoundPlanner.author(item.author);
                if(ordinal>0&&!a.isEmpty()){
                    d.execSQL("INSERT OR IGNORE INTO author_clock(author,round_no) VALUES(?,?)",new Object[]{a,ordinal});
                    d.execSQL("UPDATE author_clock SET round_no=? WHERE author=? AND round_no<?",new Object[]{ordinal,a,ordinal});
                }
            }
            d.setTransactionSuccessful();
        }finally{d.endTransaction();}
    }
    Map<String,String> following(){
        Map<String,String> out=new LinkedHashMap<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT author,label FROM following ORDER BY label",null)){while(c.moveToNext())out.put(c.getString(0),c.getString(1));}return out;
    }
    void follow(String label){
        String a=ReaderRoundPlanner.author(label);if(a.isEmpty())throw new IllegalArgumentException("没有可确认的作者");
        getWritableDatabase().execSQL("INSERT OR IGNORE INTO following(author,label,since) VALUES(?,?,?)",new Object[]{a,label,System.currentTimeMillis()});
    }
    long subscriptionSince(String author){
        try(Cursor c=getReadableDatabase().rawQuery("SELECT since FROM following WHERE author=?",new String[]{author})){return c.moveToFirst()?c.getLong(0):-1;}
    }
    void unfollow(String a){
        SQLiteDatabase d=getWritableDatabase();d.beginTransaction();try{
            for(String table:new String[]{"baseline","works","inbox","following"})d.delete(table,"author=?",new String[]{a});
            d.setTransactionSuccessful();
        }finally{d.endTransaction();}
    }
    static final class Entry {
        final String author,id,title;final int chapter;
        Entry(String a,String i,String t,int n){author=a;id=i;title=t;chapter=n;}
    }
    List<Entry> inbox(){
        List<Entry> out=new ArrayList<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT author,upload,title,chapter FROM inbox ORDER BY stamp DESC,title,chapter",null)){
            while(c.moveToNext())out.add(new Entry(c.getString(0),c.getString(1),c.getString(2),c.getInt(3)));}return out;
    }
    void dismiss(Entry v){getWritableDatabase().delete("inbox","author=? AND upload=? AND chapter=?",new String[]{v.author,v.id,Integer.toString(v.chapter)});}
    void openedChapter(String id,int chapter){
        if(id!=null&&!id.isEmpty())getWritableDatabase().delete("inbox","upload=? AND (chapter=0 OR chapter=?)",new String[]{id,Integer.toString(chapter)});
    }
    static final class Observation {
        final String id,title;final int chapters;final long publishedAt;
        Observation(String id,String title,int chapters,long stamp){this.id=id;this.title=title;this.chapters=chapters;publishedAt=stamp;}
    }
    void observe(String a,String provider,List<Observation> rows,boolean completeBaseline,long startedAfter){
        SQLiteDatabase d=getWritableDatabase();d.beginTransaction();try{
            long since;try(Cursor c=d.rawQuery("SELECT since FROM following WHERE author=?",new String[]{a})){if(!c.moveToFirst())return;since=c.getLong(0);}
            if(since>startedAfter)return; // old request completed after unfollow/re-follow
            boolean established;try(Cursor c=d.rawQuery("SELECT 1 FROM baseline WHERE author=? AND provider=?",new String[]{a,provider})){established=c.moveToFirst();}
            for(Observation item:rows){
                Integer previous=null;try(Cursor c=d.rawQuery("SELECT chapters FROM works WHERE author=? AND upload=?",new String[]{a,item.id})){if(c.moveToFirst())previous=c.getInt(0);}
                int n=Math.max(0,Math.min(10000,item.chapters));
                for(int chapter:SubscriptionDiff.updates(previous,n,established,since,item.publishedAt)){
                    d.execSQL("INSERT OR IGNORE INTO inbox(author,upload,chapter,title,stamp) VALUES(?,?,?,?,?)",new Object[]{a,item.id,chapter,item.title,startedAfter});
                }
                d.execSQL("INSERT OR REPLACE INTO works(author,upload,chapters) VALUES(?,?,?)",new Object[]{a,item.id,Math.max(previous==null?0:previous,n)});
            }
            if(completeBaseline)d.execSQL("INSERT OR IGNORE INTO baseline(author,provider) VALUES(?,?)",new Object[]{a,provider});
            d.setTransactionSuccessful();
        }finally{d.endTransaction();}
    }
}
