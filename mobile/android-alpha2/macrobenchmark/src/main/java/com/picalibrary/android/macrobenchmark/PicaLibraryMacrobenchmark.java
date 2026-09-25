package com.picalibrary.android.macrobenchmark;

import android.content.ComponentName;
import android.content.Intent;

import androidx.benchmark.macro.CompilationMode;
import androidx.benchmark.macro.FrameTimingMetric;
import androidx.benchmark.macro.StartupMode;
import androidx.benchmark.macro.StartupTimingMetric;
import androidx.benchmark.macro.junit4.MacrobenchmarkRule;
import androidx.test.filters.LargeTest;
import androidx.test.filters.SdkSuppress;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;

import kotlin.Unit;

import org.junit.Rule;
import org.junit.Test;

import java.io.IOException;
import java.util.Collections;

/**
 * P2-G18 Android foreground performance scenarios.
 *
 * Emulator runs are harness validation only. Promotion budgets require repeated measurements on
 * representative physical Android hardware.
 */
@LargeTest
@SdkSuppress(minSdkVersion = 31)
public final class PicaLibraryMacrobenchmark {
    private static final String TARGET_PACKAGE = "com.picalibrary.android";
    private static final String SETUP_ACTIVITY =
        TARGET_PACKAGE + ".BenchmarkSetupActivity";

    @Rule
    public MacrobenchmarkRule benchmarkRule = new MacrobenchmarkRule();

    @Test
    public void coldStartupToUsableLibrary() {
        benchmarkRule.measureRepeated(
            TARGET_PACKAGE,
            Collections.singletonList(new StartupTimingMetric()),
            new CompilationMode.Partial(),
            StartupMode.COLD,
            5,
            scope -> {
                prepareBenchmarkState(scope.getDevice());
                scope.pressHome();
                return Unit.INSTANCE;
            },
            scope -> {
                scope.startActivityAndWait();
                requireObject(scope.getDevice(), "我的书库");
                return Unit.INSTANCE;
            }
        );
    }

    @Test
    public void topLevelTabSwitchFrameTiming() {
        benchmarkRule.measureRepeated(
            TARGET_PACKAGE,
            Collections.singletonList(new FrameTimingMetric()),
            new CompilationMode.Partial(),
            StartupMode.WARM,
            5,
            scope -> {
                prepareBenchmarkState(scope.getDevice());
                scope.pressHome();
                scope.startActivityAndWait();
                requireObject(scope.getDevice(), "我的书库");
                return Unit.INSTANCE;
            },
            scope -> {
                UiDevice device = scope.getDevice();
                clickAndSettle(device, "推荐");
                clickAndSettle(device, "在线");
                clickAndSettle(device, "设置");
                clickAndSettle(device, "书库");
                requireObject(device, "我的书库");
                return Unit.INSTANCE;
            }
        );
    }

    private static void prepareBenchmarkState(UiDevice device) {
        Intent intent = new Intent();
        intent.setComponent(new ComponentName(TARGET_PACKAGE, SETUP_ACTIVITY));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            String component = TARGET_PACKAGE + "/" + SETUP_ACTIVITY;
            String output = device.executeShellCommand("am start -W -n " + component);
            if (output == null || output.contains("Error") || output.contains("Exception")) {
                throw new AssertionError("Benchmark setup failed: " + output);
            }
        } catch (IOException error) {
            throw new AssertionError("Benchmark setup shell command failed", error);
        }
    }

    private static UiObject2 requireObject(UiDevice device, String text) {
        boolean found = device.wait(Until.hasObject(By.text(text)), 10_000L);
        if (!found) throw new AssertionError("Missing UI text: " + text);
        UiObject2 object = device.findObject(By.text(text));
        if (object == null) throw new AssertionError("Missing UI object: " + text);
        return object;
    }

    private static void clickAndSettle(UiDevice device, String text) {
        UiObject2 object = requireObject(device, text);
        object.click();
        device.waitForIdle();
    }
}
