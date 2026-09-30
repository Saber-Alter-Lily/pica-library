package com.picalibrary.android;

import android.app.Activity;
import java.util.*;

/**
 * Shared Library/Shelf selection state. Selection actions are rendered by the
 * host in the bottom navigation area instead of Android ActionMode overflow.
 */
final class CollectionSelectionController implements UnifiedComicCollectionAdapter.Selection {
    interface Host {
        void addSelectedToShelf(List<UnifiedCatalogStore.Entry> entries);
        void removeSelectedFromShelf(String shelfId,List<UnifiedCatalogStore.Entry> entries);
        void removeSelectedFavorites(List<UnifiedCatalogStore.Entry> entries);
        void onCollectionSelectionStateChanged(boolean active,int selectedCount,boolean shelfMode);
    }

    private final Activity activity;
    private final Host host;
    private final LinkedHashMap<String,UnifiedCatalogStore.Entry> selected=new LinkedHashMap<>();
    private final List<UnifiedCatalogStore.Entry> visible=new ArrayList<>();
    private UnifiedComicCollectionAdapter adapter;
    private boolean selectionActive;
    private boolean shelfMode;
    private String shelfId="";

    CollectionSelectionController(Activity activity,Host host){this.activity=activity;this.host=host;}

    void attach(UnifiedComicCollectionAdapter adapter,List<UnifiedCatalogStore.Entry> items,boolean shelfMode,String shelfId){
        if(selectionActive)finish();
        this.adapter=adapter;
        this.visible.clear();
        if(items!=null)this.visible.addAll(items);
        this.shelfMode=shelfMode;
        this.shelfId=shelfId==null?"":shelfId;
        selected.clear();
        if(adapter!=null)adapter.setSelection(this);
    }

    void detach(){
        boolean wasActive=selectionActive;
        selectionActive=false;
        selected.clear();
        if(adapter!=null)adapter.notifyDataSetChanged();
        adapter=null;
        visible.clear();
        shelfMode=false;
        shelfId="";
        if(wasActive)host.onCollectionSelectionStateChanged(false,0,false);
    }

    void finish(){
        if(!selectionActive)return;
        selectionActive=false;
        selected.clear();
        if(adapter!=null)adapter.notifyDataSetChanged();
        host.onCollectionSelectionStateChanged(false,0,shelfMode);
    }

    void selectAll(){
        if(!selectionActive)return;
        selected.clear();
        for(UnifiedCatalogStore.Entry entry:visible)
            if(entry!=null&&entry.id!=null&&!entry.id.isEmpty())selected.put(entry.id,entry);
        changed();
    }

    void clearSelection(){
        if(!selectionActive)return;
        selected.clear();
        changed();
    }

    void addSelectionToShelf(){
        if(!selectionActive||selected.isEmpty())return;
        host.addSelectedToShelf(snapshot());
    }

    void removeSelection(){
        if(!selectionActive||selected.isEmpty())return;
        List<UnifiedCatalogStore.Entry> entries=snapshot();
        if(shelfMode)host.removeSelectedFromShelf(shelfId,entries);
        else host.removeSelectedFavorites(entries);
    }

    int selectedCount(){return selected.size();}
    boolean shelfMode(){return shelfMode;}

    @Override public boolean active(){return selectionActive;}
    @Override public boolean selected(String comicId){return selected.containsKey(comicId);}

    @Override public void start(UnifiedCatalogStore.Entry entry){
        if(entry==null)return;
        selectionActive=true;
        selected.put(entry.id,entry);
        changed();
    }

    @Override public void toggle(UnifiedCatalogStore.Entry entry){
        if(entry==null)return;
        if(!selectionActive){start(entry);return;}
        if(selected.containsKey(entry.id))selected.remove(entry.id);else selected.put(entry.id,entry);
        changed();
    }

    private List<UnifiedCatalogStore.Entry> snapshot(){return new ArrayList<>(selected.values());}

    private void changed(){
        if(adapter!=null)adapter.notifyDataSetChanged();
        host.onCollectionSelectionStateChanged(selectionActive,selected.size(),shelfMode);
    }
}
