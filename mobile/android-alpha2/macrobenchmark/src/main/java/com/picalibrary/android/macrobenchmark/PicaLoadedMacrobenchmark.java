package com.picalibrary.android.macrobenchmark;

import androidx.benchmark.macro.CompilationMode;
import androidx.benchmark.macro.FrameTimingMetric;
import androidx.benchmark.macro.junit4.MacrobenchmarkRule;
import androidx.test.filters.LargeTest;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;

import kotlin.Unit;

import org.junit.Assume;
import org.junit.Rule;
import org.junit.Test;

import java.io.IOException;
import java.util.Collections;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * P2-G19 loaded foreground scenario.
 *
 * This is opt-in because it requires a benchmark installation that the tester has configured with
 * a real Pica source or a real synced portable candidate base. No fake provider/download workload
 * is created just to make the benchmark pass.
 */
@LargeTest
@SdkSuppress(minSdkVersion = 31)
public final class PicaLoadedMacrobenchmark {
    private static final String TARGET_PACKAGE = "com.picalibrary.android";
    private static final String SETUP_ACTIVITY =
        TARGET_PACKAGE + ".BenchmarkSetupActivity";
    private static final String RESOURCE_RECEIVER =
        TARGET_PACKAGE + "/.BenchmarkResourceSnapshotReceiver";

    @Rule
    public MacrobenchmarkRule benchmarkRule = new MacrobenchmarkRule();

    @Test
    public void recommendationOverlapTopLevelFrameTiming() {
        Assume.assumeTrue(
            "G19 loaded benchmark is opt-in; run with picaG19Loaded=true after configuring " +
                "the benchmark app with a real Pica source or portable candidate base.",
            loadedScenarioEnabled()
        );

        benchmarkRule.measureRepeated(
            TARGET_PACKAGE,
            Collections.singletonList(new FrameTimingMetric()),
            new CompilationMode.Partial(),
            null,
            5,
            scope -> {
                UiDevice device = scope.getDevice();
                prepareBenchmarkState(device);
                scope.pressHome();
                scope.startActivityAndWait();
                requireObject(device, "我的书库");
                clickAndSettle(device, "推荐");
                requireObject(device, "为你推荐");
                UiObject2 refresh = requireDescription(device, "重新生成手机推荐");
                refresh.click();
                device.waitForIdle();
                waitForRecommendationRunning(device);
                return Unit.INSTANCE;
            },
            scope -> {
                UiDevice device = scope.getDevice();
                assertRecommendationRunning(device, "before foreground navigation");
                clickAndSettle(device, "书库");
                clickAndSettle(device, "在线");
                clickAndSettle(device, "设置");
                clickAndSettle(device, "推荐");
                assertRecommendationRunning(device, "after foreground navigation");
                return Unit.INSTANCE;
            }
        );
    }

    private static boolean loadedScenarioEnabled() {
        return "true".equalsIgnoreCase(
            InstrumentationRegistry.getArguments()
                .getString("picaG19Loaded", "false")
        );
    }

    private static void prepareBenchmarkState(UiDevice device) {
        shell(
            device,
            "am start -W -n " + TARGET_PACKAGE + "/" + SETUP_ACTIVITY,
            "benchmark setup"
        );
    }

    private static void waitForRecommendationRunning(UiDevice device) {
        String last = "";
        long deadline = System.nanoTime() + 20_000_000_000L;
        while (System.nanoTime() < deadline) {
            last = resourceSnapshot(device);
            if (
                running(last, "provider-network") > 0 &&
                running(last, "cpu-analysis") > 0
            ) return;
            try {
                Thread.sleep(250L);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new AssertionError("Interrupted while waiting for recommendation load", error);
            }
        }
        throw new AssertionError(
            "Real recommendation workload never became RUNNING for both provider-network and " +
                "cpu-analysis. Configure a real Pica source or synced candidate base first. " +
                "Last snapshot: " + last
        );
    }

    private static void assertRecommendationRunning(UiDevice device, String phase) {
        String snapshot = resourceSnapshot(device);
        if (
            running(snapshot, "provider-network") <= 0 ||
            running(snapshot, "cpu-analysis") <= 0
        ) {
            throw new AssertionError(
                "Recommendation workload was not RUNNING " + phase + ": " + snapshot
            );
        }
    }

    private static String resourceSnapshot(UiDevice device) {
        return shell(
            device,
            "am broadcast -W -n " + RESOURCE_RECEIVER,
            "resource snapshot"
        );
    }

    private static int running(String shellOutput, String resource) {
        Matcher matcher = Pattern.compile(
            Pattern.quote(resource) + "=(\\d+)/(\\d+)"
        ).matcher(shellOutput == null ? "" : shellOutput);
        if (!matcher.find()) {
            throw new AssertionError(
                "Missing resource " + resource + " in snapshot: " + shellOutput
            );
        }
        return Integer.parseInt(matcher.group(1));
    }

    private static String shell(UiDevice device, String command, String label) {
        try {
            String output = device.executeShellCommand(command);
            if (
                output == null ||
                output.contains("Error:") ||
                output.contains("Exception")
            ) {
                throw new AssertionError(label + " failed: " + output);
            }
            return output;
        } catch (IOException error) {
            throw new AssertionError(label + " shell command failed", error);
        }
    }

    private static UiObject2 requireObject(UiDevice device, String text) {
        boolean found = device.wait(Until.hasObject(By.text(text)), 10_000L);
        if (!found) throw new AssertionError("Missing UI text: " + text);
        UiObject2 object = device.findObject(By.text(text));
        if (object == null) throw new AssertionError("Missing UI object: " + text);
        return object;
    }

    private static UiObject2 requireDescription(UiDevice device, String description) {
        boolean found = device.wait(Until.hasObject(By.desc(description)), 10_000L);
        if (!found) {
            throw new AssertionError("Missing UI content description: " + description);
        }
        UiObject2 object = device.findObject(By.desc(description));
        if (object == null) {
            throw new AssertionError("Missing UI object by description: " + description);
        }
        return object;
    }

    private static void clickAndSettle(UiDevice device, String text) {
        UiObject2 object = requireObject(device, text);
        object.click();
        device.waitForIdle();
    }
}
