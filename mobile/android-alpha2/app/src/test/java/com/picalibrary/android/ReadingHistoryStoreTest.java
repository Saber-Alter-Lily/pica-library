package com.picalibrary.android;

import static org.junit.Assert.*;
import java.time.*;
import java.util.*;
import org.junit.Test;

public class ReadingHistoryStoreTest {
    private ReadingHistoryStore.Session session(String id,String stamp){ReadingHistoryStore.Session s=new ReadingHistoryStore.Session(id);s.comicId=id;s.lastReadAt=stamp;s.startedAt=stamp;return s;}
    @Test public void filtersTodaySevenThirtyAndExactDateInLocalZone(){ZoneId zone=ZoneId.of("UTC");LocalDate today=LocalDate.now(zone);ReadingHistoryStore.Snapshot snapshot=new ReadingHistoryStore.Snapshot();String now=today.atTime(12,0).atZone(zone).toInstant().toString(),six=today.minusDays(6).atTime(12,0).atZone(zone).toInstant().toString(),eight=today.minusDays(8).atTime(12,0).atZone(zone).toInstant().toString(),old=today.minusDays(40).atTime(12,0).atZone(zone).toInstant().toString();snapshot.byId.put("a",session("a",now));snapshot.byId.put("b",session("b",six));snapshot.byId.put("c",session("c",eight));snapshot.byId.put("d",session("d",old));assertEquals(1,ReadingHistoryStore.filter(snapshot,ReadingHistoryStore.Range.TODAY,null,zone).size());assertEquals(2,ReadingHistoryStore.filter(snapshot,ReadingHistoryStore.Range.DAYS_7,null,zone).size());assertEquals(3,ReadingHistoryStore.filter(snapshot,ReadingHistoryStore.Range.DAYS_30,null,zone).size());assertEquals(4,ReadingHistoryStore.filter(snapshot,ReadingHistoryStore.Range.ALL,null,zone).size());assertEquals("c",ReadingHistoryStore.filter(snapshot,ReadingHistoryStore.Range.ALL,today.minusDays(8),zone).get(0).sessionId);}
    @Test public void sessionSortUsesLastReadTimestamp(){ReadingHistoryStore.Snapshot snapshot=new ReadingHistoryStore.Snapshot();snapshot.byId.put("old",session("old","2026-01-01T00:00:00Z"));snapshot.byId.put("new",session("new","2026-02-01T00:00:00Z"));assertEquals("new",snapshot.sorted().get(0).sessionId);}
    @Test public void localDayParsesIsoInstant(){assertEquals(LocalDate.of(2026,9,14),ReadingHistoryStore.localDay("2026-09-14T12:00:00Z",ZoneId.of("UTC")));}
}
