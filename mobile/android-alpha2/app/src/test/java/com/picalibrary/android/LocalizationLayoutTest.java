package com.picalibrary.android;

import static org.junit.Assert.*;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Rect;
import android.text.Layout;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.ImageButton;
import android.widget.TextView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

import java.util.ArrayList;
import java.util.List;

/**
 * Non-artifact multilingual layout gate. It exercises the real programmatic Android UI
 * at three representative widths and verifies horizontal bounds, single-line clipping,
 * and ordinary 44dp touch targets.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class LocalizationLayoutTest {
    private static final int HEIGHT_DP = 900;

    @Test @Config(qualifiers = "w360dp-h900dp-mdpi")
    public void zhCn360() { runScenario(LocaleStore.ZH_CN, 360); }

    @Test @Config(qualifiers = "w360dp-h900dp-mdpi")
    public void ja360() { runScenario(LocaleStore.JA, 360); }

    @Test @Config(qualifiers = "w360dp-h900dp-mdpi")
    public void en360() { runScenario(LocaleStore.EN, 360); }

    @Test @Config(qualifiers = "w412dp-h900dp-mdpi")
    public void zhCn412() { runScenario(LocaleStore.ZH_CN, 412); }

    @Test @Config(qualifiers = "w412dp-h900dp-mdpi")
    public void ja412() { runScenario(LocaleStore.JA, 412); }

    @Test @Config(qualifiers = "w412dp-h900dp-mdpi")
    public void en412() { runScenario(LocaleStore.EN, 412); }

    @Test @Config(qualifiers = "w600dp-h900dp-mdpi")
    public void zhCn600() { runScenario(LocaleStore.ZH_CN, 600); }

    @Test @Config(qualifiers = "w600dp-h900dp-mdpi")
    public void ja600() { runScenario(LocaleStore.JA, 600); }

    @Test @Config(qualifiers = "w600dp-h900dp-mdpi")
    public void en600() { runScenario(LocaleStore.EN, 600); }

    private void runScenario(String language, int widthDp) {
        Context app = RuntimeEnvironment.getApplication();
        LocaleStore.set(app, language);
        OnboardingStore.setAutoShow(app, false);
        app.getSharedPreferences("pica-disclaimer-v1", Context.MODE_PRIVATE)
                .edit().putString("accepted_version", "1").commit();
        app.getSharedPreferences("alpha81-ui", Context.MODE_PRIVATE)
                .edit().putBoolean("libraryRefreshed", true).commit();

        for (int tab = 0; tab < 4; tab++) {
            Intent intent = new Intent(app, HomeActivity.class).putExtra("tab", tab);
            checkActivity(HomeActivity.class, intent, widthDp, language + "/home-tab-" + tab);
        }

        checkActivity(RecommendationStyleActivity.class, new Intent(app, RecommendationStyleActivity.class),
                widthDp, language + "/recommendation-settings");
        checkActivity(PairingActivity.class, new Intent(app, PairingActivity.class),
                widthDp, language + "/pairing");
        checkActivity(OnboardingSettingsActivity.class, new Intent(app, OnboardingSettingsActivity.class),
                widthDp, language + "/onboarding-settings");
    }

    private <T extends Activity> void checkActivity(
            Class<T> cls, Intent intent, int widthDp, String label) {
        ActivityController<T> controller = Robolectric.buildActivity(cls, intent)
                .create().start().resume().visible();
        try {
            T activity = controller.get();
            ViewGroup content = activity.findViewById(android.R.id.content);
            assertNotNull(label + ": content view missing", content);

            int width = widthDp;
            int height = HEIGHT_DP;
            int widthSpec = View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY);
            int heightSpec = View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY);
            content.measure(widthSpec, heightSpec);
            content.layout(0, 0, width, height);

            List<String> problems = new ArrayList<>();
            inspect(content, content, width, problems);
            assertTrue(label + "\n" + String.join("\n", problems), problems.isEmpty());
        } finally {
            controller.pause().stop().destroy();
        }
    }

    private void inspect(ViewGroup root, View view, int width, List<String> problems) {
        if (view.getVisibility() != View.VISIBLE || view.getWidth() <= 0 || view.getHeight() <= 0) return;

        if (view != root && !insideHorizontalScroller(view, root)) {
            Rect rect = new Rect();
            view.getDrawingRect(rect);
            try {
                root.offsetDescendantRectToMyCoords(view, rect);
                if (rect.left < -2 || rect.right > width + 2) {
                    problems.add("horizontal overflow: " + describe(view) + " rect=" + rect + " rootWidth=" + width);
                }
            } catch (IllegalArgumentException ignored) {
                // The view was detached by a synchronous Activity refresh; it is not part of the final surface.
            }
        }

        if ((view instanceof Button || view instanceof ImageButton) && view.isClickable()) {
            String text = view instanceof TextView ? String.valueOf(((TextView) view).getText()) : "";
            boolean delegatedInfoTip = "!".equals(text);
            if (!delegatedInfoTip && view.getHeight() < 44) {
                problems.add("touch target <44dp: " + describe(view) + " height=" + view.getHeight());
            }
        }

        if (view instanceof TextView && !(view instanceof EditText)) {
            TextView tv = (TextView) view;
            Layout layout = tv.getLayout();
            int available = Math.max(0, tv.getWidth() - tv.getPaddingLeft() - tv.getPaddingRight());
            if (layout != null && tv.getMaxLines() == 1 && tv.getEllipsize() == null && layout.getLineCount() > 0) {
                float lineWidth = layout.getLineWidth(0);
                if (lineWidth > available + 2) {
                    problems.add("single-line text clipped: " + describe(tv) +
                            " textWidth=" + Math.round(lineWidth) + " available=" + available);
                }
            }
        }

        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                inspect(root, group.getChildAt(i), width, problems);
            }
        }
    }

    private boolean insideHorizontalScroller(View view, View root) {
        android.view.ViewParent parent = view.getParent();
        while (parent instanceof View && parent != root) {
            if (parent instanceof HorizontalScrollView) return true;
            parent = parent.getParent();
        }
        return false;
    }

    private String describe(View view) {
        String type = view.getClass().getSimpleName();
        if (view instanceof TextView) {
            String text = String.valueOf(((TextView) view).getText()).replaceAll("\\s+", " ").trim();
            if (text.length() > 80) text = text.substring(0, 80) + "…";
            return type + "(\"" + text + "\")";
        }
        CharSequence description = view.getContentDescription();
        return description == null ? type : type + "(" + description + ")";
    }
}
