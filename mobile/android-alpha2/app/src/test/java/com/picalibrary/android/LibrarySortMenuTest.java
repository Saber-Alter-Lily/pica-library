package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.ListView;
import java.util.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** Blank Android activity and private synthetic preferences; never starts Home, providers or sync. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=32)
public class LibrarySortMenuTest {
    @Test public void selectingTheAlreadyCheckedRandomRowDispatchesAgainAndPrefsRestoreTheOrder(){
        ActivityController<Activity> host=Robolectric.buildActivity(Activity.class).setup().visible();
        Activity a=host.get();SharedPreferences prefs=a.getSharedPreferences("library-sort-fixture",Context.MODE_PRIVATE);
        List<String> visible=new ArrayList<>(Arrays.asList("a","b"));Random entropy=new Random(22);
        int[] clicks={0};
        try{
            for(int tap=0;tap<3;tap++){
                String first=visible.get(0);UnifiedLibraryFilter.Spec spec=UnifiedFilterStore.load(prefs);
                AlertDialog dialog=HomeActivity.showLibrarySortMenu(a,spec.sort,sort->{
                    clicks[0]++;assertEquals(UnifiedLibraryFilter.Sort.RANDOM,sort);
                    spec.sort=sort;spec.shuffle=spec.shuffle.reroll(visible,entropy);spec.shuffle.sort(visible,id->id);
                    UnifiedFilterStore.save(prefs,spec);
                });
                ListView menu=dialog.getListView();int pos=UnifiedLibraryFilter.Sort.RANDOM.ordinal();
                assertEquals(a.getString(R.string.library_sort_random),menu.getItemAtPosition(pos));
                if(tap>0)assertEquals(pos,menu.getCheckedItemPosition());
                menu.performItemClick(menu.getAdapter().getView(pos,null,menu),pos,menu.getAdapter().getItemId(pos));
                assertEquals(tap+1,clicks[0]);assertFalse(dialog.isShowing());assertNotEquals(first,visible.get(0));
                UnifiedLibraryFilter.Spec restored=UnifiedFilterStore.load(prefs);
                List<String> reopened=new ArrayList<>(Arrays.asList("a","b"));restored.shuffle.sort(reopened,id->id);
                assertEquals(visible,reopened);assertEquals(spec.shuffle.seed,restored.shuffle.seed);
            }
        }finally{host.pause().stop().destroy();}
    }
}
