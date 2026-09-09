package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.*;
import android.widget.*;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.viewpager2.widget.ViewPager2;
import java.util.*;
import java.util.concurrent.*;

public class ReaderActivity extends Activity {
    private FrameLayout root, canvas;
    private LinearLayout top, bottom;
    private TextView heading, counter;
    private Button retry;
    private ProgressBar loading;
    private SeekBar seek;
    private ViewPager2 pager;
    private RecyclerView continuous;
    private ReaderSource source;
    private ReaderImages images;
    private ReaderProgress progress;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService metadata = Executors.newFixedThreadPool(2);
    private Future<?> chapterRequest;
    private final Set<Holder> holders = new HashSet<>();
    private List<BridgeClient.ChapterItem> chapters = new ArrayList<>();
    private List<BridgeClient.PageItem> pages = new ArrayList<>();
    private String comic, title, chapter, desiredChapter;
    private int index, generation, mode;
    private boolean chrome, dragging, destroyed, chapterReady, rebuilding;
    private final Runnable syncProgress = () -> progress.sync();

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        String sourceKind = getIntent().getStringExtra("source");
        source = "remote".equals(sourceKind) ? new RemoteReaderSource(this) : new DesktopReaderSource(this);
        images = new ReaderImages(this, source);
        progress = new ReaderProgress(this, source);
        comic = getIntent().getStringExtra("comicId"); title = getIntent().getStringExtra("title");
        desiredChapter = saved == null ? getIntent().getStringExtra("episodeId") : saved.getString("chapter");
        if (desiredChapter == null || desiredChapter.isEmpty()) desiredChapter = progress.recentChapter(comic);
        ReaderSettingsStore.Snapshot localSettings = ReaderSettingsStore.local(this);
        mode = localSettings.mode;
        getWindow().setStatusBarColor(Color.BLACK); getWindow().setNavigationBarColor(Color.BLACK);
        if (localSettings.keepOn) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        render(); syncPortableSettings(); loadInitial(); progress.sync();
    }
    private Button button(String text, View.OnClickListener click) {
        Button b = new Button(this); b.setText(text); b.setTextColor(Color.WHITE);
        b.setBackgroundColor(Color.TRANSPARENT); b.setAllCaps(false); b.setTextSize(13); b.setOnClickListener(click); return b;
    }
    private void render() {
        root = new FrameLayout(this); root.setBackgroundColor(Color.BLACK);
        canvas = new FrameLayout(this); root.addView(canvas, new FrameLayout.LayoutParams(-1, -1));
        loading = new ProgressBar(this); root.addView(loading, new FrameLayout.LayoutParams(48, 48, Gravity.CENTER));
        retry = button("读取失败，点此重试", v -> loadInitial()); retry.setVisibility(View.GONE);
        root.addView(retry, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
        top = new LinearLayout(this); top.setGravity(Gravity.CENTER_VERTICAL); top.setBackgroundColor(0xdd111111);
        top.addView(button("返回", v -> finish()));
        heading = Ui.text(this, title == null ? "阅读" : title, 15, Color.WHITE, true); heading.setMaxLines(1);
        top.addView(heading, new LinearLayout.LayoutParams(0, -2, 1)); top.addView(button("章节", v -> chooseChapter()));
        root.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));
        bottom = new LinearLayout(this); bottom.setOrientation(LinearLayout.VERTICAL); bottom.setBackgroundColor(0xdd111111);
        counter = Ui.text(this, "正在读取章节…", 13, Color.WHITE, false); counter.setGravity(Gravity.CENTER); bottom.addView(counter);
        seek = new SeekBar(this); bottom.addView(seek);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onStartTrackingTouch(SeekBar s) { dragging = true; }
            public void onProgressChanged(SeekBar s, int value, boolean user) { if (user) counter.setText((value + 1) + " / " + pages.size()); }
            public void onStopTrackingTouch(SeekBar s) { dragging = false; go(s.getProgress(), false); }
        });
        LinearLayout actions = new LinearLayout(this);
        actions.addView(button("上一页", v -> flip(-1)), new LinearLayout.LayoutParams(0, -2, 1));
        actions.addView(button("阅读设置", v -> displayOptions()), new LinearLayout.LayoutParams(0, -2, 1));
        actions.addView(button("下一页", v -> flip(1)), new LinearLayout.LayoutParams(0, -2, 1));
        bottom.addView(actions); root.addView(bottom, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        root.setOnApplyWindowInsetsListener((v, insets) -> {top.setPadding(0, insets.getSystemWindowInsetTop(), 0, 0);bottom.setPadding(0, 0, 0, insets.getSystemWindowInsetBottom()); return insets;});
        setContentView(root); setChrome(true);
    }
    private void syncPortableSettings() {
        metadata.submit(() -> {
            ReaderSettingsStore.Snapshot snapshot = ReaderSettingsStore.reconcile(ReaderActivity.this);
            main.post(() -> {
                if (destroyed) return;boolean modeChanged = mode != snapshot.mode;mode = snapshot.mode;
                if (snapshot.keepOn) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                if (modeChanged && chapterReady) buildPages();
            });
        });
    }
    private void loadInitial() {
        final int serial = ++generation;if (chapterRequest != null) chapterRequest.cancel(true);
        loading.setVisibility(View.VISIBLE); retry.setVisibility(View.GONE); chapterReady = false;
        chapterRequest = metadata.submit(() -> {
            try {
                List<BridgeClient.ChapterItem> available = source.chapters(comic);available.removeIf(c -> c.downloadedPictures <= 0); available.sort(Comparator.comparingInt(c -> c.order));
                if (available.isEmpty()) throw new IllegalStateException("没有可读章节");String selected = desiredChapter;
                if (selected == null || selected.isEmpty()) {try { selected = source.recentChapter(comic); }catch (Exception ignored) { selected = ""; }}
                if ((selected == null || selected.isEmpty()) && source instanceof DesktopReaderSource) {try { for (BridgeClient.RecentItem r : BridgeClient.recent(ReaderActivity.this, 100)) if (r.comic.id.equals(comic)) { selected = r.episodeId; break; } }catch (Exception ignored) {}}
                boolean found = false; for (BridgeClient.ChapterItem c : available) if (c.id.equals(selected)) found = true;if (!found) selected = available.get(0).id;
                BridgeClient.ChapterData data = source.chapter(comic, selected);main.post(() -> { if (valid(serial)) { chapters = available; apply(data, -1); } });
            } catch (Exception e) { main.post(() -> { if (valid(serial)) failChapter(); }); }
        });
    }
    private boolean valid(int serial) { return !destroyed && serial == generation; }
    private void failChapter() {loading.setVisibility(View.GONE); retry.setVisibility(View.VISIBLE); setChrome(true);counter.setText(source instanceof RemoteReaderSource ? "无法读取章节，请检查 WebDAV 或本地缓存后重试" : "无法读取章节，请检查电脑连接后重试");}
    private void loadChapter(String id, int start) {
        save(true); desiredChapter = id; final int serial = ++generation;if (chapterRequest != null) chapterRequest.cancel(true);
        chapterReady = false; loading.setVisibility(View.VISIBLE); retry.setVisibility(View.GONE); clearPages();
        chapterRequest = metadata.submit(() -> {try {BridgeClient.ChapterData data = source.chapter(comic, id);main.post(() -> { if (valid(serial)) apply(data, start); });} catch (Exception e) { main.post(() -> { if (valid(serial)) failChapter(); }); }});
    }
    private void apply(BridgeClient.ChapterData data, int start) {
        chapter = desiredChapter = data.episode.id; pages = data.pages;
        index = ReaderPolicy.clampPage(start == -2 ? pages.size() - 1 : start >= 0 ? start : progress.position(comic, chapter, data.progressIndex), pages.size());
        heading.setText((title == null ? "漫画" : title) + " · " + data.episode.title);loading.setVisibility(View.GONE); chapterReady = true; seek.setMax(Math.max(0, pages.size() - 1));
        buildPages(); updateCounter();prefetchAround();if (pages.isEmpty()) { counter.setText("该章节尚无可读取页面"); setChrome(true); }
    }
    private void clearPages() {if (pager != null) pager.setAdapter(null); if (continuous != null) continuous.setAdapter(null);for (Holder holder : new ArrayList<>(holders)) holder.cancel();holders.clear(); canvas.removeAllViews(); pager = null; continuous = null;}
    private void buildPages() {
        rebuilding = true; int restore = index; clearPages(); Pages adapter = new Pages();
        if (mode == 2) {
            continuous = new RecyclerView(this); LinearLayoutManager layout = new LinearLayoutManager(this);continuous.setLayoutManager(layout); continuous.setItemAnimator(null); continuous.setAdapter(adapter);
            continuous.addOnScrollListener(new RecyclerView.OnScrollListener() {public void onScrolled(RecyclerView v, int dx, int dy) {int p = layout.findFirstVisibleItemPosition(); if (!rebuilding && p >= 0 && p != index) selected(p);}});
            canvas.addView(continuous, new FrameLayout.LayoutParams(-1, -1)); layout.scrollToPositionWithOffset(restore, 0);
        } else {
            pager = new ViewPager2(this); pager.setLayoutDirection(mode == 1 ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR);pager.setOffscreenPageLimit(1); pager.setAdapter(adapter);
            pager.registerOnPageChangeCallback(new ViewPager2.OnPageChangeCallback() {public void onPageSelected(int p) { if (!rebuilding) selected(p); }});
            canvas.addView(pager, new FrameLayout.LayoutParams(-1, -1)); pager.setCurrentItem(restore, false);
        }
        index = restore; rebuilding = false;
    }
    private void selected(int p) { index = ReaderPolicy.clampPage(p, pages.size()); updateCounter();prefetchAround(); save(false); }
    private void prefetchAround(){
        int count=StorageSettings.prefetchPages(this);List<String> targets=new ArrayList<>();if(count>0&&!pages.isEmpty())for(int step=1;step<=count;step++){int p=index+step;if(p>=pages.size())break;targets.add(pages.get(p).url);}images.prefetch(targets);
    }
    private void updateCounter() { if (!dragging) { seek.setProgress(index); counter.setText((pages.isEmpty() ? 0 : index + 1) + " / " + pages.size() + (source instanceof RemoteReaderSource ? " · 云端/缓存" : " · 电脑/缓存")+" · 预载 "+StorageSettings.prefetchPages(this)); } }
    private void save(boolean flush) {
        if (!chapterReady || pages.isEmpty()) return;boolean displayed = false; for (Holder h : holders) if (h.position == index && h.loaded) displayed = true;if (!displayed) return;
        progress.save(comic, chapter, index, flush); main.removeCallbacks(syncProgress);if (flush) progress.sync(); else main.postDelayed(syncProgress, 1200);
    }
    private void go(int p, boolean smooth) {if (!chapterReady || pages.isEmpty()) return; p = ReaderPolicy.clampPage(p, pages.size());if (pager != null) pager.setCurrentItem(p, smooth);else if (continuous != null) { ((LinearLayoutManager)continuous.getLayoutManager()).scrollToPositionWithOffset(p, 0); selected(p); }}
    private void flip(int direction) {
        if (!chapterReady || pages.isEmpty()) return;if (mode == 2 && continuous != null && continuous.canScrollVertically(direction)) { continuous.smoothScrollBy(0, direction * (int)(continuous.getHeight() * .85f)); return; }
        int next = index + direction;if (next >= 0 && next < pages.size()) { go(next, true); return; }
        int current = -1; for (int i = 0; i < chapters.size(); i++) if (chapters.get(i).id.equals(chapter)) current = i;int target = current + direction;
        if (target >= 0 && target < chapters.size()) loadChapter(chapters.get(target).id, direction > 0 ? 0 : -2);else Toast.makeText(this, direction > 0 ? "已经到最后一章" : "已经到第一章", Toast.LENGTH_SHORT).show();
    }
    private void chooseChapter() {String[] titles = new String[chapters.size()]; for (int i = 0; i < titles.length; i++) titles[i] = chapters.get(i).title;new AlertDialog.Builder(this).setTitle("章节").setItems(titles, (d, i) -> loadChapter(chapters.get(i).id, -1)).show();}
    private void displayOptions() {
        ReaderSettingsStore.Snapshot current = ReaderSettingsStore.local(this);
        String[] choices = {"横向翻页（从左到右）", "横向翻页（从右到左）", "纵向连续阅读", "屏幕常亮：" + (current.keepOn ? "开" : "关"), "缓存与预加载 · 当前 "+StorageSettings.prefetchPages(this)+" 页"};
        new AlertDialog.Builder(this).setTitle("阅读设置").setItems(choices, (d, i) -> {
            if (i < 3) {save(true); mode = i; ReaderSettingsStore.saveLocal(this, mode, current.keepOn); ReaderSettingsStore.pushAsync(this); buildPages();prefetchAround();}
            else if(i==3){boolean keep = !current.keepOn; ReaderSettingsStore.saveLocal(this, mode, keep); ReaderSettingsStore.pushAsync(this);if (keep) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);}
            else startActivity(new Intent(this,StorageSettingsActivity.class));
        }).show();
    }
    private void setChrome(boolean visible) {chrome = visible; top.setVisibility(visible ? View.VISIBLE : View.GONE); bottom.setVisibility(visible ? View.VISIBLE : View.GONE);getWindow().getDecorView().setSystemUiVisibility(visible ? View.SYSTEM_UI_FLAG_VISIBLE : View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);}
    @Override protected void onResume(){super.onResume();if(chapterReady){updateCounter();prefetchAround();}}
    @Override protected void onPause() { save(true); super.onPause(); }
    @Override protected void onSaveInstanceState(Bundle out) { save(true); out.putString("chapter", chapter == null ? desiredChapter : chapter); super.onSaveInstanceState(out); }
    @Override protected void onDestroy() { destroyed = true; ++generation; main.removeCallbacksAndMessages(null); if (chapterRequest != null) chapterRequest.cancel(true); metadata.shutdownNow(); clearPages(); images.close(); super.onDestroy(); }
    @Override public boolean onKeyDown(int key, KeyEvent event) { if (key == KeyEvent.KEYCODE_VOLUME_UP || key == KeyEvent.KEYCODE_VOLUME_DOWN) { flip(key == KeyEvent.KEYCODE_VOLUME_UP ? -1 : 1); return true; } return super.onKeyDown(key, event); }

    private final class Holder extends RecyclerView.ViewHolder {
        final FrameLayout frame; final ZoomImageView picture; final Button error; final ProgressBar spinner;ReaderImages.Request request; int position; boolean loaded;
        Holder(FrameLayout frame) {
            super(frame); this.frame = frame; picture = new ZoomImageView(ReaderActivity.this);frame.addView(picture, new FrameLayout.LayoutParams(-1, -1));
            spinner = new ProgressBar(ReaderActivity.this); frame.addView(spinner, new FrameLayout.LayoutParams(48, 48, Gravity.CENTER));error = button("图片读取失败 · 点此重试", v -> bind(position)); error.setVisibility(View.GONE);frame.addView(error, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
            picture.setNavigationListener(new ZoomImageView.NavigationListener() {public void onPrevious() { flip(mode == 1 ? 1 : -1); }public void onNext() { flip(mode == 1 ? -1 : 1); }public void onCenterTap() { setChrome(!chrome); }}); picture.setPagerManaged(mode != 2);
        }
        void cancel() { if (request != null) request.cancel(); loaded = false; picture.setImageDrawable(null); }
        void bind(int p) {
            cancel(); position = p; error.setVisibility(View.GONE); spinner.setVisibility(View.VISIBLE);int chapterGeneration = generation;
            request = images.load(pages.get(p).url, getResources().getDisplayMetrics().widthPixels, new ReaderImages.Callback() {
                public void complete(Bitmap bitmap) {if (!valid(chapterGeneration) || position != p) return;picture.setImageBitmap(bitmap); loaded = true; spinner.setVisibility(View.GONE);if (mode == 2) { int w = Math.max(1, canvas.getWidth()); frame.getLayoutParams().height = Math.max(1, (int)((long)w * bitmap.getHeight() / bitmap.getWidth())); frame.requestLayout(); }if (position == index) save(false);}
                public void failed() { spinner.setVisibility(View.GONE); error.setVisibility(View.VISIBLE); }
            });
        }
    }
    private final class Pages extends RecyclerView.Adapter<Holder> {
        public Holder onCreateViewHolder(ViewGroup parent, int type) {FrameLayout frame = new FrameLayout(ReaderActivity.this); frame.setBackgroundColor(Color.BLACK);frame.setLayoutParams(new RecyclerView.LayoutParams(-1, mode == 2 ? Math.max(1, canvas.getHeight()) : -1));Holder holder = new Holder(frame); holders.add(holder); return holder;}
        public void onBindViewHolder(Holder holder, int position) { holders.add(holder); holder.bind(position); }
        public void onViewRecycled(Holder holder) { holder.cancel(); holders.remove(holder); }
        public int getItemCount() { return pages.size(); }
    }
}
