package com.picalibrary.android;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Benchmark-only resource snapshot bridge.
 *
 * Explicit shell broadcasts can query current G17 WorkManager resource occupancy without making
 * the benchmark target debuggable or exposing this surface in release/debug variants.
 */
public final class BenchmarkResourceSnapshotReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        try {
            AndroidTaskResources.Snapshot snapshot=
                AndroidTaskResources.snapshot(context.getApplicationContext());
            StringBuilder out=new StringBuilder();
            out.append("runningTotal=").append(snapshot.runningTotal());
            out.append(";waitingTotal=").append(snapshot.waitingTotal());
            for(String resource:AndroidTaskResources.ALL){
                out.append(';').append(resource).append('=')
                    .append(snapshot.running(resource)).append('/')
                    .append(snapshot.waiting(resource));
            }
            setResultCode(Activity.RESULT_OK);
            setResultData(out.toString());
        } catch (Exception error) {
            setResultCode(Activity.RESULT_CANCELED);
            setResultData("error="+error.getClass().getSimpleName());
        }
    }
}
