package com.picalibrary.android;

import android.app.Activity;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import java.util.*;

/**
 * Standard Android contextual selection mode shared by Library and Shelf
 * collections. RecyclerView rendering stays in the shared adapter; this class
 * owns selection state and ActionMode semantics only.
 */
final class CollectionSelectionController implements UnifiedComicCollectionAdapter.Selection {
    interface Host {
        void addSelectedToShelf(List<UnifiedCatalogStore.Entry> entries);
        void removeSelectedFromShelf(String shelfId,List<UnifiedCatalogStore.Entry> entries);
        void removeSelectedFavorites(List<UnifiedCatalogStore.Entry> entries);
    }

    private static final int ACTION_SELECT_ALL=4101;
    private static final int ACTION_CLEAR=4102;
    private static final int ACTION_ADD_SHELF=4103;
    private static final int ACTION_REMOVE=4104;

    private final Activity activity;
    private final Host host;
    private final LinkedHashMap<String,UnifiedCatalogStore.Entry> selected=new LinkedHashMap<>();
    private final List<UnifiedCatalogStore.Entry> visible=new ArrayList<>();
    private UnifiedComicCollectionAdapter adapter;
    private ActionMode actionMode;
    private boolean shelfMode;
    private String shelfId="";

    CollectionSelectionController(Activity activity,Host host){this.activity=activity;this.host=host;}

    void attach(UnifiedComicCollectionAdapter adapter,List<UnifiedCatalogStore.Entry> items,boolean shelfMode,String shelfId){
        if(actionMode!=null)actionMode.finish();
        this.adapter=adapter;this.visible.clear();if(items!=null)this.visible.addAll(items);this.shelfMode=shelfMode;this.shelfId=shelfId==null?"":shelfId;selected.clear();
        if(adapter!=null)adapter.setSelection(this);
    }

    void detach(){
        if(actionMode!=null)actionMode.finish();
        adapter=null;visible.clear();selected.clear();shelfMode=false;shelfId="";
    }

    void finish(){if(actionMode!=null)actionMode.finish();}

    @Override public boolean active(){return actionMode!=null;}
    @Override public boolean selected(String comicId){return selected.containsKey(comicId);}

    @Override public void start(UnifiedCatalogStore.Entry entry){
        if(entry==null)return;
        if(actionMode==null)actionMode=activity.startActionMode(callback);
        if(actionMode==null)return;
        selected.put(entry.id,entry);changed();
    }

    @Override public void toggle(UnifiedCatalogStore.Entry entry){
        if(entry==null)return;
        if(actionMode==null){start(entry);return;}
        if(selected.containsKey(entry.id))selected.remove(entry.id);else selected.put(entry.id,entry);
        changed();
    }

    private List<UnifiedCatalogStore.Entry> snapshot(){return new ArrayList<>(selected.values());}

    private void changed(){
        if(actionMode!=null)actionMode.setTitle("已选 "+selected.size()+" 本");
        if(adapter!=null)adapter.notifyDataSetChanged();
    }

    private final ActionMode.Callback callback=new ActionMode.Callback(){
        @Override public boolean onCreateActionMode(ActionMode mode,Menu menu){
            mode.setTitle("已选 0 本");
            menu.add(0,ACTION_SELECT_ALL,0,"全选").setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM);
            menu.add(0,ACTION_CLEAR,1,"取消全选").setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM);
            menu.add(0,ACTION_ADD_SHELF,2,shelfMode?"加入其他书架":"加入书架").setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM);
            menu.add(0,ACTION_REMOVE,3,shelfMode?"移出当前书架":"取消收藏").setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM);
            return true;
        }
        @Override public boolean onPrepareActionMode(ActionMode mode,Menu menu){return false;}
        @Override public boolean onActionItemClicked(ActionMode mode,MenuItem item){
            if(item.getItemId()==ACTION_SELECT_ALL){
                selected.clear();for(UnifiedCatalogStore.Entry entry:visible)if(entry!=null&&!entry.id.isEmpty())selected.put(entry.id,entry);changed();return true;
            }
            if(item.getItemId()==ACTION_CLEAR){selected.clear();changed();return true;}
            List<UnifiedCatalogStore.Entry> entries=snapshot();
            if(entries.isEmpty())return true;
            if(item.getItemId()==ACTION_ADD_SHELF){host.addSelectedToShelf(entries);return true;}
            if(item.getItemId()==ACTION_REMOVE){
                if(shelfMode)host.removeSelectedFromShelf(shelfId,entries);else host.removeSelectedFavorites(entries);
                return true;
            }
            return false;
        }
        @Override public void onDestroyActionMode(ActionMode mode){
            actionMode=null;selected.clear();if(adapter!=null)adapter.notifyDataSetChanged();
        }
    };
}
