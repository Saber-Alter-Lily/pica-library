package com.picalibrary.android;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Shared, read-only view of the original imported-comic inventory and v1 history.
 * The full installed app and isolated local QA app supply their own history file.
 * No source SDK, network, search index, database or new reading-state schema.
 */
final class LocalLibraryBrowse {
    private LocalLibraryBrowse(){}

    static Map<String,ReaderHistoryLedger.Session> latestFor(
            List<LocalComicReaderPort.Book> books,ReaderHistoryLedger.Snapshot history){
        Set<String> available=new HashSet<>();
        for(LocalComicReaderPort.Book book:books)available.add(book.id);
        Map<String,ReaderHistoryLedger.Session> latest=new LinkedHashMap<>();
        if(history==null)return latest;
        for(ReaderHistoryLedger.Session session:history.sorted()){
            if(!"local".equals(session.sourceKind)||session.chapterId.isEmpty()
                    ||!available.contains(session.comicId))continue;
            latest.putIfAbsent(session.comicId,session);
        }
        return latest;
    }

    static List<LocalComicReaderPort.Book> visible(
            List<LocalComicReaderPort.Book> inventory,
            Map<String,ReaderHistoryLedger.Session> recent,
            String query,int sortMode,int readMode){
        String needle=query==null?"":query.trim().toLowerCase(Locale.ROOT);
        List<LocalComicReaderPort.Book> filtered=new ArrayList<>();
        for(LocalComicReaderPort.Book book:inventory){
            if(!needle.isEmpty()&&!book.title.toLowerCase(Locale.ROOT).contains(needle))continue;
            boolean visited=recent.containsKey(book.id);
            if(readMode==1&&visited||readMode==2&&!visited)continue;
            filtered.add(book);
        }
        if(sortMode==1)filtered.sort(Comparator
                .comparing((LocalComicReaderPort.Book book)->book.title.toLowerCase(Locale.ROOT))
                .thenComparing(book->book.id));
        else if(sortMode==2)filtered.sort(Comparator
                .comparingInt((LocalComicReaderPort.Book book)->book.pageCount).reversed()
                .thenComparing(book->book.title.toLowerCase(Locale.ROOT))
                .thenComparing(book->book.id));
        else filtered.sort(Comparator
                .comparing((LocalComicReaderPort.Book book)->book.updatedAt).reversed()
                .thenComparing(book->book.id));
        return filtered;
    }

    static ReaderHistoryLedger.Session newest(Map<String,ReaderHistoryLedger.Session> recent){
        ReaderHistoryLedger.Session latest=null;
        for(ReaderHistoryLedger.Session value:recent.values())
            if(latest==null||value.lastReadAt.compareTo(latest.lastReadAt)>0)latest=value;
        return latest;
    }

    static LocalComicReaderPort.Book bookFor(
            List<LocalComicReaderPort.Book> inventory,ReaderHistoryLedger.Session session){
        if(session==null)return null;
        for(LocalComicReaderPort.Book book:inventory)
            if(book.id.equals(session.comicId))return book;
        return null;
    }
}
