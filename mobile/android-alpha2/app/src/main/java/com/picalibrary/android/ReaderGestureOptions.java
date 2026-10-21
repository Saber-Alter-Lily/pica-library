package com.picalibrary.android;

import android.app.AlertDialog;
import android.content.Context;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.view.View;

/** Small local-only panel; changes apply without rebuilding or reloading reader pages. */
final class ReaderGestureOptions {
    private ReaderGestureOptions() {}

    static String title(Context context) {
        return LocalizedText.ui(context, "手势与放大（仅此手机）",
                "Gestures & zoom (this phone)", "ジェスチャーと拡大（この端末のみ）");
    }

    static AlertDialog show(Context context, Runnable onChanged, Runnable onDismiss) {
        ReaderGestureSettings.Snapshot current = ReaderGestureSettings.local(context);
        LinearLayout panel = new LinearLayout(context);
        panel.setOrientation(LinearLayout.VERTICAL);
        int padding = dp(context, 24);
        panel.setPadding(padding, dp(context, 12), padding, dp(context, 8));

        Switch enabled = new Switch(context);
        enabled.setText(LocalizedText.ui(context, "双击放大", "Double-tap to zoom", "ダブルタップで拡大"));
        enabled.setMinHeight(dp(context, 48));
        enabled.setChecked(current.doubleTapEnabled);
        panel.addView(enabled, new LinearLayout.LayoutParams(-1, -2));

        TextView help = new TextView(context);
        help.setText(LocalizedText.ui(context,
                "关闭后，轻点直接翻页或显隐工具栏。双指缩放始终可用。设置只保存在此手机。",
                "When off, taps turn pages or toggle controls immediately. Pinch zoom stays available. These settings stay on this phone.",
                "オフにすると、タップですぐにページ移動や操作バーの表示切替ができます。ピンチ拡大は引き続き使えます。設定はこの端末だけに保存されます。"));
        panel.addView(help, new LinearLayout.LayoutParams(-1, -2));
        TextView label = new TextView(context);
        label.setText(LocalizedText.ui(context, "双击放大倍率", "Double-tap zoom level", "ダブルタップの拡大率"));
        label.setPadding(0, dp(context, 16), 0, 0);
        panel.addView(label, new LinearLayout.LayoutParams(-1, -2));

        RadioGroup levels = new RadioGroup(context);
        for (int percent : new int[]{150, 200, 300}) {
            RadioButton option = new RadioButton(context);
            option.setId(View.generateViewId());
            option.setTag(percent);
            option.setText(percent == 150 ? "1.5×" : percent == 200 ? "2×" : "3×");
            option.setMinHeight(dp(context, 48));
            option.setEnabled(current.doubleTapEnabled);
            levels.addView(option, new RadioGroup.LayoutParams(-1, -2));
            if (percent == current.zoomPercent) levels.check(option.getId());
        }
        panel.addView(levels, new LinearLayout.LayoutParams(-1, -2));

        enabled.setOnCheckedChangeListener((button, checked) -> {
            ReaderGestureSettings.save(context, checked, ReaderGestureSettings.local(context).zoomPercent);
            for (int i = 0; i < levels.getChildCount(); i++) levels.getChildAt(i).setEnabled(checked);
            onChanged.run();
        });
        levels.setOnCheckedChangeListener((group, id) -> {
            RadioButton option = group.findViewById(id);
            if (option == null) return;
            ReaderGestureSettings.save(context, enabled.isChecked(), (Integer) option.getTag());
            onChanged.run();
        });
        ScrollView scroll = new ScrollView(context);
        scroll.addView(panel, new ScrollView.LayoutParams(-1, -2));
        AlertDialog dialog = new AlertDialog.Builder(context).setTitle(title(context))
                .setView(scroll).setPositiveButton(LocalizedText.ui(context, "确定", "OK", "OK"), null).create();
        dialog.setOnDismissListener(d -> onDismiss.run());
        dialog.show();
        return dialog;
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
