import fs from 'node:fs'

function patch(file, before, after, label) {
    const text = fs.readFileSync(file, 'utf8')
    const first = text.indexOf(before)
    if (first < 0) throw new Error(`missing ${label}`)
    if (text.indexOf(before, first + before.length) >= 0)
        throw new Error(`duplicate ${label}`)
    fs.writeFileSync(
        file,
        text.slice(0, first) + after + text.slice(first + before.length)
    )
}

const root = 'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/'

patch(
    root + 'EhFavoriteStore.java',
    '    static synchronized void captureLegacyEhLocals(Context context,List<BridgeClient.ComicItem> legacy){Snapshot s=load(context);boolean changed=false;for(BridgeClient.ComicItem item:legacy)if(item!=null&&EhClient.isEhId(item.id)&&s.localIds.add(item.id))changed=true;if(changed)save(context,s);}\n',
    `    static final class LegacySplit {\n        final List<BridgeClient.ComicItem> remaining=new ArrayList<>();\n        final LinkedHashSet<String> localIds=new LinkedHashSet<>();\n    }\n    static LegacySplit splitLegacy(List<BridgeClient.ComicItem> legacy){LegacySplit out=new LegacySplit();if(legacy==null)return out;for(BridgeClient.ComicItem item:legacy){if(item==null)continue;if(EhClient.isEhId(item.id))out.localIds.add(item.id);else out.remaining.add(item);}return out;}\n    /** One-time, idempotent migration: persist legacy E-H locals first, then strip them from the legacy/Pica cache. */\n    static synchronized Snapshot migrateLegacyEhLocals(Context context){FavoriteCacheStore.Snapshot legacy=FavoriteCacheStore.load(context);LegacySplit split=splitLegacy(legacy.items);Snapshot s=load(context);if(split.localIds.isEmpty())return s;boolean changed=s.localIds.addAll(split.localIds);if(changed)save(context,s);FavoriteCacheStore.save(context,split.remaining,legacy.coversPrefetched);return changed?load(context):s;}\n`,
    'legacy E-H favorite capture'
)

patch(
    root + 'UnifiedCatalogStore.java',
    '        FavoriteCacheStore.Snapshot favorites=FavoriteCacheStore.load(context);EhFavoriteStore.captureLegacyEhLocals(context,favorites.items);EhFavoriteStore.Snapshot ehFavorites=EhFavoriteStore.load(context);if(!favorites.updatedAt.isEmpty()||!ehFavorites.updatedAt.isEmpty()){',
    '        EhFavoriteStore.Snapshot ehFavorites=EhFavoriteStore.migrateLegacyEhLocals(context);FavoriteCacheStore.Snapshot favorites=FavoriteCacheStore.load(context);if(!favorites.updatedAt.isEmpty()||!ehFavorites.updatedAt.isEmpty()){',
    'unified favorite migration call'
)

patch(
    root + 'PicaBootstrapWorker.java',
    '            UnifiedPicaCatalogSync.mergeAll(app,favorites);EhFavoriteStore.captureLegacyEhLocals(app,FavoriteCacheStore.load(app).items);List<BridgeClient.ComicItem> items=new ArrayList<>();',
    '            UnifiedPicaCatalogSync.mergeAll(app,favorites);EhFavoriteStore.migrateLegacyEhLocals(app);List<BridgeClient.ComicItem> items=new ArrayList<>();',
    'Pica bootstrap legacy E-H migration'
)

fs.writeFileSync(
    'mobile/android-alpha2/app/src/test/java/com/picalibrary/android/EhFavoriteMigrationTest.java',
    `package com.picalibrary.android;\n\nimport java.util.*;\nimport org.junit.Test;\nimport static org.junit.Assert.*;\n\npublic class EhFavoriteMigrationTest {\n    @Test public void splitLegacyMovesEhAndRetainsOnlyNonEhCacheRows(){\n        List<BridgeClient.ComicItem> legacy=Arrays.asList(\n            new BridgeClient.ComicItem("pica-1","Pica","A","",0),\n            new BridgeClient.ComicItem("eh:123:0123456789","EH","B","",0),\n            new BridgeClient.ComicItem("eh:456:abcdef0123","EH2","C","",0)\n        );\n        EhFavoriteStore.LegacySplit split=EhFavoriteStore.splitLegacy(legacy);\n        assertEquals(1,split.remaining.size());\n        assertEquals("pica-1",split.remaining.get(0).id);\n        assertEquals(new LinkedHashSet<>(Arrays.asList("eh:123:0123456789","eh:456:abcdef0123")),split.localIds);\n    }\n\n    @Test public void splitLegacyIsIdempotentOnceLegacyCacheContainsNoEhRows(){\n        List<BridgeClient.ComicItem> legacy=Collections.singletonList(new BridgeClient.ComicItem("pica-1","Pica","A","",0));\n        EhFavoriteStore.LegacySplit split=EhFavoriteStore.splitLegacy(legacy);\n        assertTrue(split.localIds.isEmpty());\n        assertEquals(1,split.remaining.size());\n    }\n}\n`
)

console.log('EH_FAVORITE_MIGRATION_FIX=APPLIED')
