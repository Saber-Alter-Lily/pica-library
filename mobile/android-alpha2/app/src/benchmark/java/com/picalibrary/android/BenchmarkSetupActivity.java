package com.picalibrary.android;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;

/**
 * Benchmark-only deterministic state setup.
 *
 * Macrobenchmark launches this exported Activity outside the measured block so first-run gates
 * do not contaminate startup/frame samples. This source set is excluded from release/debug APKs.
 */
public final class BenchmarkSetupActivity extends Activity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);

        LocaleStore.set(this, LocaleStore.ZH_CN);
        getSharedPreferences("pica-disclaimer-v1", Context.MODE_PRIVATE)
            .edit().putString("accepted_version", "1").commit();
        OnboardingStore.neverAuto(this);

        getSharedPreferences("updater-v1", Context.MODE_PRIVATE)
            .edit()
            .putLong("lastAutoCheckAt", System.currentTimeMillis())
            .putInt("latestVersionCode", -1)
            .commit();

        finish();
    }
}
