package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.time.Instant;
import java.util.*;
import org.json.*;

/**
 * Original app-facing shelf API: retain installed storage path, original
 * UnifiedCatalog metadata and Desktop sync. The single local shelf schema
 * and mutations live in the source-neutral :local-storage ShelfLedger.
 */
final class ShelfStore extends ShelfLedger {
    private ShelfStore(){}
    private static File file(Context context){
        return MobileStoragePaths.dataFile(context,ShelfLedger.FILE);
    }

    static Snapshot syncFromDesktop(Context context)throws Exception{return syncWithDesktop(context);}
    static Snapshot load(Context context){return ShelfLedger.load(file(context));}

    private static void afterSaved(Context context,Snapshot snapshot){
        UnifiedCatalogStore.reconcileLocalReferences(context);
        mergeRichMetadata(context,snapshot);
    }
    static synchronized void save(Context context,Snapshot snapshot){
        ShelfLedger.save(file(context),snapshot);
        afterSaved(context,snapshot);
    }
    static synchronized Shelf create(Context context,String rawName){
        Shelf created=ShelfLedger.create(file(context),rawName);
        afterSaved(context,load(context));
        return created;
    }
    static synchronized void rename(Context context,String id,String rawName){
        ShelfLedger.rename(file(context),id,rawName);
        afterSaved(context,load(context));
    }
    static synchronized void delete(Context context,String id){
        if(ShelfLedger.delete(file(context),id))afterSaved(context,load(context));
    }
    static synchronized void setMembership(Context context,String shelfId,UnifiedCatalogStore.Entry entry,boolean desired){
        ShelfLedger.setMembership(file(context),shelfId,itemFromEntry(entry,now(),""),desired);
        afterSaved(context,load(context));
    }
    static synchronized void setMemberships(Context context,String shelfId,Collection<UnifiedCatalogStore.Entry> entries,boolean desired){
        List<Item> selected=new ArrayList<>();
        if(entries!=null)for(UnifiedCatalogStore.Entry entry:entries)
            if(entry!=null&&entry.id!=null&&!entry.id.isEmpty())selected.add(itemFromEntry(entry,now(),""));
        if(ShelfLedger.setMemberships(file(context),shelfId,selected,desired))afterSaved(context,load(context));
    }
    static List<Shelf> activeForComic(Context context,String comicId){
        return ShelfLedger.activeForComic(file(context),comicId);
    }

    static synchronized Snapshot syncWithDesktop(Context context) throws Exception {
        if(!BridgeStore.paired(context))throw new IllegalStateException("尚未配对 Desktop");
        Snapshot local=load(context);JSONObject remoteRoot=BridgeClient.shelves(context);Snapshot remote=fromRemote(remoteRoot);String last=local.lastDesktopSyncAt;Map<String,Shelf> remoteById=new LinkedHashMap<>();Map<String,Shelf> remoteByName=new LinkedHashMap<>();for(Shelf r:remote.activeShelves()){remoteById.put(r.desktopId.isEmpty()?r.id:r.desktopId,r);remoteByName.put(norm(r.name),r);}Set<String> matched=new HashSet<>();
        for(Shelf l:new ArrayList<>(local.shelves)){
            String desktopId=l.desktopId;Shelf r=desktopId.isEmpty()?remoteByName.get(norm(l.name)):remoteById.get(desktopId);
            if(!l.active()){
                if(r!=null&&!l.deletedAt.isEmpty()&&newer(l.deletedAt,r.updatedAt).equals(l.deletedAt)){BridgeClient.shelfMutate(context,"delete",r.desktopId.isEmpty()?r.id:r.desktopId,"",Collections.emptyList(),new JSONArray());matched.add(r.desktopId.isEmpty()?r.id:r.desktopId);}continue;
            }
            // A previously synced Desktop shelf disappearing remotely is a Desktop-side delete,
            // unless the phone edited that shelf after the last successful reconciliation.
            if(r==null&&!desktopId.isEmpty()&&!last.isEmpty()&&l.updatedAt.compareTo(last)<=0){String t=now();l.deletedAt=t;l.updatedAt=t;continue;}
            if(r==null){
                JSONObject created=BridgeClient.shelfMutate(context,"create","",l.name,Collections.emptyList(),new JSONArray());desktopId=created.optString("id","");if(desktopId.isEmpty())throw new IOException("Desktop 未返回书架 ID");l.desktopId=desktopId;l.updatedAt=now();r=new Shelf(desktopId,desktopId,l.name,l.updatedAt,"",new ArrayList<>());remoteById.put(desktopId,r);
            }else{desktopId=r.desktopId.isEmpty()?r.id:r.desktopId;l.desktopId=desktopId;}
            matched.add(desktopId);boolean localChanged=last.isEmpty()||l.updatedAt.compareTo(last)>0;boolean remoteChanged=last.isEmpty()||r.updatedAt.compareTo(last)>0;
            if(remoteChanged&&!localChanged){l.name=r.name;l.updatedAt=r.updatedAt;}else if(localChanged&&!l.name.equals(r.name)){BridgeClient.shelfMutate(context,"rename",desktopId,l.name,Collections.emptyList(),new JSONArray());}
            mergeMembership(context,l,r,last,localChanged,remoteChanged);
        }
        for(Shelf r:remote.activeShelves()){String rid=r.desktopId.isEmpty()?r.id:r.desktopId;if(matched.contains(rid))continue;Shelf imported=new Shelf(rid,rid,r.name,r.updatedAt,"",copyItems(r.items));local.shelves.add(imported);}
        local.lastDesktopSyncAt=now();save(context,local);return load(context);
    }

    private static void mergeMembership(Context context,Shelf local,Shelf remote,String last,boolean localChanged,boolean remoteChanged) throws Exception {
        Map<String,Item> localMap=new LinkedHashMap<>(),remoteMap=new LinkedHashMap<>();for(Item i:local.items)localMap.put(i.comicId,i);for(Item i:remote.items)if(i.active())remoteMap.put(i.comicId,i);
        if(remoteChanged&&!localChanged){local.items.clear();local.items.addAll(copyItems(remote.items));return;}
        LinkedHashSet<String> desired=new LinkedHashSet<>(remoteMap.keySet());for(Item i:local.items)if(i.active())desired.add(i.comicId);for(Item i:local.items)if(!i.active()&&(last.isEmpty()||i.deletedAt.compareTo(last)>0))desired.remove(i.comicId);
        List<String> add=new ArrayList<>(),remove=new ArrayList<>();JSONArray records=new JSONArray();for(String id:desired)if(!remoteMap.containsKey(id)){add.add(id);Item item=localMap.get(id);if(item!=null)records.put(itemJson(item));}for(String id:remoteMap.keySet())if(!desired.contains(id))remove.add(id);
        String desktopId=local.desktopId;if(!add.isEmpty())BridgeClient.shelfMutate(context,"add",desktopId,"",add,records);if(!remove.isEmpty())BridgeClient.shelfMutate(context,"remove",desktopId,"",remove,new JSONArray());
        List<Item> merged=new ArrayList<>();for(String id:desired){Item item=localMap.get(id);if(item==null)item=remoteMap.get(id);if(item!=null)merged.add(new Item(item.comicId,item.title,item.author,item.canonicalAuthor,new ArrayList<>(item.tags),new ArrayList<>(item.categories),item.finished,item.downloadedPictures,item.knownPictures,item.updatedAt,""));}for(Item i:local.items)if(!i.active())merged.add(i);local.items.clear();local.items.addAll(merged);local.updatedAt=now();
    }

    private static Item itemFromEntry(UnifiedCatalogStore.Entry e,String updated,String deleted){return new Item(e.id,e.title,e.author,e.canonicalAuthor,new ArrayList<>(e.tags),new ArrayList<>(e.categories),e.finished,e.desktopDownloadedPictures,e.knownPictures,updated,deleted);}
    private static void mergeRichMetadata(Context context,Snapshot snapshot){UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(context);for(Shelf shelf:snapshot.shelves)if(shelf.active())for(Item item:shelf.items)if(item.active()){UnifiedCatalogStore.Entry entry=catalog.byId.get(item.comicId);if(entry==null){entry=new UnifiedCatalogStore.Entry(item.comicId,item.title,item.author);catalog.byId.put(item.comicId,entry);}if(item.title!=null&&!item.title.isEmpty())entry.title=item.title;if(item.author!=null&&!item.author.isEmpty())entry.author=item.author;if(item.canonicalAuthor!=null&&!item.canonicalAuthor.isEmpty())entry.canonicalAuthor=item.canonicalAuthor;if(!item.tags.isEmpty()){entry.tags.clear();entry.tags.addAll(item.tags);}if(!item.categories.isEmpty()){entry.categories.clear();entry.categories.addAll(item.categories);}entry.finished=item.finished;entry.knownPictures=Math.max(entry.knownPictures,item.knownPictures);if(item.updatedAt!=null&&item.updatedAt.compareTo(entry.updatedAt==null?"":entry.updatedAt)>0)entry.updatedAt=item.updatedAt;}UnifiedCatalogStore.save(context,catalog);}

}
