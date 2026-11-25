package com.picalibrary.android;

import android.app.Activity;
import android.content.Context;
import android.view.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;

/** A cache read, allocation, hidden Activity, or a page replaced before drawing is not exposure. */
final class RecommendationPageReceipt {
    private static final ExecutorService writes=Executors.newSingleThreadExecutor();
    private static Future<?> pending;
    static synchronized void enqueue(Context context,NativeRecommendationStore.Snapshot snapshot,List<NativeRecommendationStore.Item> page){
        pending=writes.submit(()->NativeRecommendationStore.acknowledgePage(context,snapshot,page));
    }
    static void flush() throws Exception{Future<?> p; synchronized(RecommendationPageReceipt.class){p=pending;}if(p!=null)p.get();}
    static void afterDraw(Activity activity,View container,NativeRecommendationStore.Snapshot current,BooleanSupplier stillCurrent){
        final List<NativeRecommendationStore.Item> page=new ArrayList<>(current.current());if(page.isEmpty())return;
        final Context context=activity.getApplicationContext();
        class Receipt implements ViewTreeObserver.OnDrawListener,View.OnAttachStateChangeListener {
            boolean done;
            public void onDraw(){
                if(done)return;
                if(!stillCurrent.getAsBoolean()||activity.isFinishing()||activity.isDestroyed()){finish();return;}
                if(!activity.hasWindowFocus()||!container.isShown()||container.getWindowVisibility()!=View.VISIBLE)return;
                finish();enqueue(context,current,page);
            }
            // Android forbids mutating the observer's draw-list inside onDraw itself.
            private void finish(){done=true;container.post(this::remove);}
            private void remove(){ViewTreeObserver tree=container.getViewTreeObserver();if(tree.isAlive())tree.removeOnDrawListener(this);container.removeOnAttachStateChangeListener(this);}
            public void onViewAttachedToWindow(View v){}
            public void onViewDetachedFromWindow(View v){done=true;remove();}
        }
        Receipt listener=new Receipt();container.addOnAttachStateChangeListener(listener);container.getViewTreeObserver().addOnDrawListener(listener);container.invalidate();
    }
    private RecommendationPageReceipt(){}
}
