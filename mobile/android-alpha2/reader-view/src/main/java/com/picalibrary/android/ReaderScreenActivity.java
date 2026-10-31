package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
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
import com.picalibrary.android.readerview.R;
import java.util.*;
import java.util.concurrent.*;

abstract class ReaderScreenActivity extends Activity {
    // The original screen stays single-owner; concrete providers, settings sync,
    // recommendation evidence and locale remain in the app's ReaderActivity.
    protected abstract ReaderChapterSource createReaderSource(String kind);
    protected abstract ReaderImageLoader createReaderImages(ReaderChapterSource source);
    protected abstract ReaderProgressLedger createReaderProgress(ReaderChapterSource source);
    protected abstract ReaderDisplaySettings.Snapshot reconcileReaderSettings();
    protected abstract void pushReaderSettings();
    protected abstract int readerPrefetchPages();
    protected abstract String translateReaderText(String source);
    protected abstract TextView readerText(String text,float sp,int color,boolean bold);
    protected abstract String readerGestureTitle();
    protected abstract void showReaderGestures(Runnable onChanged,Runnable onDismiss);
    protected abstract void openReaderStorageSettings();
    protected abstract void recordReaderComplete(Context context,String comicId);
    protected boolean readerLocaleChangedOnResume(){return false;}

    private FrameLayout root, canvas;
    private LinearLayout top, bottom;
    private TextView heading, counter;
    private Button retry, nextPageButton, chapterAdvance;
    private ProgressBar loading;
    private SeekBar seek;
    private ViewPager2 pager;
    private RecyclerView continuous;
    private ReaderChapterSource source;
    private ReaderImageLoader images;
    private ReaderProgressLedger progress;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService metadata = Executors.newFixedThreadPool(2);
    private Future<?> chapterRequest;
    private final Set<Holder> holders = new HashSet<>();
    private List<ReaderContent.Chapter> chapters = new ArrayList<>();
    private List<ReaderContent.Page> pages = new ArrayList<>();
    private String comic, title, chapter, desiredChapter, chapterError="", completionRecordedChapter="";
    private int index, generation, mode;
    private boolean chrome, dragging, destroyed, chapterReady, rebuilding;
    private final Runnable syncProgress = () -> progress.sync();
    private final Runnable hideChrome = () -> { if(!destroyed && chapterReady && chrome) setChrome(false); };

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        String sourceKind = getIntent().getStringExtra("source");
        try { source=createReaderSource(sourceKind); } catch(IllegalArgumentException error) { Toast.makeText(this,error.getMessage(),Toast.LENGTH_LONG).show();finish();return; }
        images = createReaderImages(source);
        progress = createReaderProgress(source);
        comic = getIntent().getStringExtra("comicId"); title = getIntent().getStringExtra("title");
        desiredChapter = saved == null ? getIntent().getStringExtra("episodeId") : saved.getString("chapter");
        if (desiredChapter == null || desiredChapter.isEmpty()) desiredChapter = progress.recentChapter(comic);
        ReaderDisplaySettings.Snapshot localSettings = ReaderDisplaySettings.local(this);mode = localSettings.mode;
        getWindow().setStatusBarColor(Color.BLACK); getWindow().setNavigationBarColor(Color.BLACK);if (localSettings.keepOn) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        render(); syncPortableSettings(); loadInitial(); progress.sync();
    }
    private Button button(String text, View.OnClickListener click) {Button b = new Button(this); b.setText(text); b.setTextColor(Color.WHITE);b.setBackgroundColor(Color.TRANSPARENT); b.setAllCaps(false); b.setTextSize(13); b.setOnClickListener(click); return b;}
    private void render() {
        root = new FrameLayout(this); root.setBackgroundColor(Color.BLACK);canvas = new FrameLayout(this); root.addView(canvas, new FrameLayout.LayoutParams(-1, -1));
        loading = new ProgressBar(this); root.addView(loading, new FrameLayout.LayoutParams(48, 48, Gravity.CENTER));retry = button(getString(R.string.reader_retry_load), v -> loadInitial()); retry.setVisibility(View.GONE);root.addView(retry, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
        top = new LinearLayout(this); top.setGravity(Gravity.CENTER_VERTICAL); top.setBackgroundColor(0xdd111111);top.addView(button(getString(R.string.reader_back), v -> finish()));heading = readerText( title == null ? getString(R.string.reader_title) : title, 15, Color.WHITE, true); heading.setMaxLines(1);top.addView(heading, new LinearLayout.LayoutParams(0, -2, 1)); top.addView(button(getString(R.string.reader_chapters), v -> chooseChapter()));root.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));
        bottom = new LinearLayout(this); bottom.setOrientation(LinearLayout.VERTICAL); bottom.setBackgroundColor(0xdd111111);counter = readerText( getString(R.string.reader_loading_chapter), 13, Color.WHITE, false); counter.setGravity(Gravity.CENTER); bottom.addView(counter);seek = new SeekBar(this); bottom.addView(seek);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {public void onStartTrackingTouch(SeekBar s) { dragging = true; main.removeCallbacks(hideChrome); }public void onProgressChanged(SeekBar s, int value, boolean user) { if (user) counter.setText((value + 1) + " / " + pages.size()); }public void onStopTrackingTouch(SeekBar s) { dragging = false; go(s.getProgress(), false); scheduleHide(); }});
        chapterAdvance=button(getString(R.string.reader_next_chapter),v->advanceChapter());chapterAdvance.setVisibility(View.GONE);chapterAdvance.setTextSize(14);bottom.addView(chapterAdvance,new LinearLayout.LayoutParams(-1,-2));
        LinearLayout actions = new LinearLayout(this);actions.addView(button(getString(R.string.reader_prev_page), v -> flip(-1)), new LinearLayout.LayoutParams(0, -2, 1));actions.addView(button(getString(R.string.reader_options), v -> displayOptions()), new LinearLayout.LayoutParams(0, -2, 1));nextPageButton=button(getString(R.string.reader_next_page), v -> flip(1));actions.addView(nextPageButton, new LinearLayout.LayoutParams(0, -2, 1));bottom.addView(actions); root.addView(bottom, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        root.setOnApplyWindowInsetsListener((v, insets) -> {top.setPadding(0, insets.getSystemWindowInsetTop(), 0, 0);bottom.setPadding(0, 0, 0, insets.getSystemWindowInsetBottom()); return insets;});setContentView(root); setChrome(true);
    }
    private void syncPortableSettings() {metadata.submit(() -> {ReaderDisplaySettings.Snapshot snapshot = reconcileReaderSettings();main.post(() -> {if (destroyed) return;boolean modeChanged = mode != snapshot.mode;mode = snapshot.mode;if (snapshot.keepOn) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);if (modeChanged && chapterReady) buildPages();});});}
    private void loadInitial() {
        final int serial = ++generation;if (chapterRequest != null) chapterRequest.cancel(true);chapterError="";retry.setText(getString(R.string.reader_retry_load));retry.setOnClickListener(v->loadInitial());loading.setVisibility(View.VISIBLE); retry.setVisibility(View.GONE); chapterReady = false;
        chapterRequest = metadata.submit(() -> {try {List<ReaderContent.Chapter> available = new ArrayList<>(source.chapters(comic));available.removeIf(c -> !ReaderPolicy.canFetchChapter(source.kind(),c.downloadedPictures)); available.sort(Comparator.comparingInt(c -> c.order));if (available.isEmpty()) throw new IllegalStateException(getString(R.string.reader_no_chapters));String selected = desiredChapter;
                if (selected == null || selected.isEmpty()) {try { selected = source.recentChapter(comic); }catch (Exception ignored) { selected = ""; }}
                boolean found = false; for (ReaderContent.Chapter c : available) if (c.id.equals(selected)) found = true;if (!found) selected = available.get(0).id;ReaderContent.ChapterData data = source.chapter(comic, selected);main.post(() -> { if (valid(serial)) { chapters = available; apply(data, -1); } });
            } catch (Exception e) { String reason=readerError(e);main.post(() -> { if (valid(serial)) failChapter(reason); }); }});
    }
    private boolean valid(int serial) { return !destroyed && serial == generation; }
    private String readerError(Exception e){String value=e.getMessage()==null?"":e.getMessage().trim();if(value.contains("HTTP 509"))return getString(R.string.reader_error_rate_limited);if(value.contains("HTTP 403"))return getString(R.string.reader_error_denied);if(value.contains("页列表不完整"))return getString(R.string.reader_error_incomplete);if(value.contains("没有可读取图片")||value.contains("图片页没有可读取图片"))return getString(R.string.reader_error_image_url);if(value.contains("timed out")||value.contains("timeout"))return getString(R.string.reader_error_timeout);if(value.isEmpty())return getString(R.string.reader_unavailable);return value.length()>72?value.substring(0,72):value;}
    private void failChapter(String reason) {chapterError=reason==null?"":reason;loading.setVisibility(View.GONE); retry.setVisibility(View.VISIBLE);setChrome(true);if(!source.chapterDiagnosticPath(comic).isEmpty()){retry.setText(getString(R.string.reader_failure_details));retry.setOnClickListener(v->showChapterFailure());}String label=source.readerLabel(this,false);counter.setText(chapterError.isEmpty()?getString(R.string.reader_cannot_load_chapter,label):label+" · "+chapterError);}
    private void loadChapter(String id, int start) {save(true); desiredChapter = id; final int serial = ++generation;if (chapterRequest != null) chapterRequest.cancel(true);chapterError="";chapterReady=false; loading.setVisibility(View.VISIBLE); retry.setVisibility(View.GONE); clearPages();chapterRequest = metadata.submit(() -> {try {ReaderContent.ChapterData data = source.chapter(comic, id);main.post(() -> { if (valid(serial)) apply(data, start); });} catch (Exception e) {String reason=readerError(e);main.post(() -> { if (valid(serial)) failChapter(reason); }); }});}
    private void apply(ReaderContent.ChapterData data, int start) {chapterError="";chapter = desiredChapter = data.episode.id; pages = new ArrayList<>(data.pages);progress.chapterMetadata(data.episode.id,data.episode.title,data.episode.order);index = ReaderPolicy.clampPage(start == -2 ? pages.size() - 1 : start >= 0 ? start : progress.position(comic, chapter, data.progressIndex), pages.size());heading.setText((title == null ? getString(R.string.reader_comic) : title) + " · " + data.episode.title);loading.setVisibility(View.GONE); chapterReady = true; seek.setMax(Math.max(0, pages.size() - 1));buildPages(); updateCounter();prefetchAround();if (pages.isEmpty()) { counter.setText(getString(R.string.reader_no_pages)); setChrome(true); }else if(atChapterEnd())setChrome(true);else scheduleHide();}
    private void clearPages() {if (pager != null) pager.setAdapter(null); if (continuous != null) continuous.setAdapter(null);for (Holder holder : new ArrayList<>(holders)) holder.cancel();holders.clear(); if(canvas!=null)canvas.removeAllViews(); pager = null; continuous = null;}
    private void buildPages() {
        rebuilding = true; int restore = index; clearPages(); Pages adapter = new Pages();
        if (mode == 2) {continuous = new RecyclerView(this); LinearLayoutManager layout = new LinearLayoutManager(this);continuous.setLayoutManager(layout); continuous.setItemAnimator(null); continuous.setAdapter(adapter);continuous.addOnScrollListener(new RecyclerView.OnScrollListener() {public void onScrolled(RecyclerView v, int dx, int dy) {int p = layout.findFirstVisibleItemPosition(); if (!rebuilding && p >= 0 && p != index) selected(p);}});canvas.addView(continuous, new FrameLayout.LayoutParams(-1, -1)); layout.scrollToPositionWithOffset(restore, 0);} 
        else {pager = new ViewPager2(this); pager.setLayoutDirection(mode == 1 ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR);pager.setOffscreenPageLimit(1); pager.setAdapter(adapter);pager.registerOnPageChangeCallback(new ViewPager2.OnPageChangeCallback() {public void onPageSelected(int p) { if (!rebuilding) selected(p); }});canvas.addView(pager, new FrameLayout.LayoutParams(-1, -1)); pager.setCurrentItem(restore, false);}index = restore; rebuilding = false;
    }
    private void selected(int p) { index = ReaderPolicy.clampPage(p, pages.size()); updateCounter();prefetchAround(); save(false);if(atChapterEnd())setChrome(true); }
    private void prefetchAround(){int count=readerPrefetchPages();List<String> targets=new ArrayList<>();if(count>0&&!pages.isEmpty())for(int step=1;step<=count;step++){int p=index+step;if(p>=pages.size())break;targets.add(pages.get(p).url);}images.prefetch(targets);}
    private String sourceLabel(){return source.readerLabel(this,true);}
    private int currentChapterIndex(){for(int i=0;i<chapters.size();i++)if(chapters.get(i).id.equals(chapter))return i;return -1;}
    private boolean atChapterEnd(){return chapterReady&&!pages.isEmpty()&&index>=pages.size()-1;}
    private void updateChapterAdvance(){if(chapterAdvance==null||nextPageButton==null)return;if(!atChapterEnd()){chapterAdvance.setVisibility(View.GONE);nextPageButton.setText(getString(R.string.reader_next_page));nextPageButton.setEnabled(true);return;}int current=currentChapterIndex(),next=current+1;if(current>=0&&next<chapters.size()){ReaderContent.Chapter target=chapters.get(next);chapterAdvance.setVisibility(View.VISIBLE);chapterAdvance.setEnabled(true);chapterAdvance.setText(getString(R.string.reader_next_chapter_title,target.title));nextPageButton.setText(getString(R.string.reader_next_chapter));nextPageButton.setEnabled(true);}else{chapterAdvance.setVisibility(View.VISIBLE);chapterAdvance.setEnabled(false);chapterAdvance.setText(getString(R.string.reader_final_chapter));nextPageButton.setText(getString(R.string.reader_finished));nextPageButton.setEnabled(false);}}
    private void advanceChapter(){int current=currentChapterIndex(),target=current+1;if(current>=0&&target<chapters.size())loadChapter(chapters.get(target).id,0);else Toast.makeText(this,getString(R.string.reader_last_chapter),Toast.LENGTH_SHORT).show();}
    private void updateCounter() { if (!dragging) { seek.setProgress(index); counter.setText(getString(R.string.reader_counter,pages.isEmpty()?0:index+1,pages.size(),sourceLabel(),readerPrefetchPages())); } updateChapterAdvance(); }
    private void recordReaderCompleteAsync(){
        if(!source.emitsRecommendationEvidence())return;
        Context app=getApplicationContext();
        String comicId=comic;
        metadata.submit(()->{
            recordReaderComplete(app,comicId);
        });
    }

    private void save(boolean flush) {if (!chapterReady || pages.isEmpty()) return;boolean displayed = false; for (Holder h : holders) if (h.position == index && h.loaded) displayed = true;if (!displayed) return;progress.save(comic, chapter, index, flush);if(index>=pages.size()-1&&!chapter.equals(completionRecordedChapter)){completionRecordedChapter=chapter;recordReaderCompleteAsync();} main.removeCallbacks(syncProgress);if (flush) progress.sync(); else main.postDelayed(syncProgress, 1200);}
    private void go(int p, boolean smooth) {if (!chapterReady || pages.isEmpty()) return; p = ReaderPolicy.clampPage(p, pages.size());if (pager != null) pager.setCurrentItem(p, smooth);else if (continuous != null) { ((LinearLayoutManager)continuous.getLayoutManager()).scrollToPositionWithOffset(p, 0); selected(p); }}
    private void flip(int direction) {if (!chapterReady || pages.isEmpty()) return;if(direction>0&&atChapterEnd()){advanceChapter();return;}if (mode == 2 && continuous != null && continuous.canScrollVertically(direction)) { continuous.smoothScrollBy(0, direction * (int)(continuous.getHeight() * .85f)); return; }int next = index + direction;if (next >= 0 && next < pages.size()) { go(next, true); return; }int current=currentChapterIndex(),target=current+direction;if (target >= 0 && target < chapters.size()) loadChapter(chapters.get(target).id, direction > 0 ? 0 : -2);else Toast.makeText(this, direction > 0 ? getString(R.string.reader_last_chapter) : getString(R.string.reader_first_chapter), Toast.LENGTH_SHORT).show();}
    private void chooseChapter() {main.removeCallbacks(hideChrome);setChrome(true);String[] titles = new String[chapters.size()]; for (int i = 0; i < titles.length; i++) titles[i] = chapters.get(i).title;new AlertDialog.Builder(this).setTitle(getString(R.string.reader_chapters)).setItems(titles, (d, i) -> loadChapter(chapters.get(i).id, -1)).setOnDismissListener(d->scheduleHide()).show();}
    private void displayOptions() {
        main.removeCallbacks(hideChrome);setChrome(true);
        ReaderDisplaySettings.Snapshot current = ReaderDisplaySettings.local(this);
        boolean[] openGestures = {false};
        String[] choices = {
                getString(R.string.reader_mode_ltr),getString(R.string.reader_mode_rtl),
                getString(R.string.reader_mode_vertical),
                getString(R.string.reader_keep_on,
                        getString(current.keepOn?R.string.reader_on:R.string.reader_off)),
                readerGestureTitle(),getString(R.string.reader_cache_prefetch,readerPrefetchPages())
        };
        new AlertDialog.Builder(this).setTitle(getString(R.string.reader_options)).setItems(choices, (d, i) -> {
            if (i < 3) {save(true); mode = i; ReaderDisplaySettings.saveLocal(this, mode, current.keepOn); pushReaderSettings(); buildPages();prefetchAround();}
            else if(i==3){boolean keep = !current.keepOn; ReaderDisplaySettings.saveLocal(this, mode, keep); pushReaderSettings();if (keep) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);}
            else if(i==4) openGestures[0] = true;
            else openReaderStorageSettings();
        }).setOnDismissListener(d -> {
            if (openGestures[0] && !destroyed) {
                showReaderGestures(this::applyGestureSettings, this::scheduleHide);
                main.removeCallbacks(hideChrome);
            } else scheduleHide();
        }).show();
        main.removeCallbacks(hideChrome);
    }
    private void applyGestureSettings() {
        ReaderGestureSettings.Snapshot settings = ReaderGestureSettings.local(this);
        for (Holder holder : holders) holder.picture.setGestureSettings(settings);
    }
    private void scheduleHide(){main.removeCallbacks(hideChrome);if(chapterReady&&chrome&&!atChapterEnd())main.postDelayed(hideChrome,2800);}
    private void setChrome(boolean visible) {main.removeCallbacks(hideChrome);chrome = visible; top.setVisibility(visible ? View.VISIBLE : View.GONE); bottom.setVisibility(visible ? View.VISIBLE : View.GONE);getWindow().getDecorView().setSystemUiVisibility(visible ? View.SYSTEM_UI_FLAG_VISIBLE : View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);if(visible)scheduleHide();}
    @Override protected void onResume(){super.onResume();if(!readerLocaleChangedOnResume()&&chapterReady){updateCounter();prefetchAround();scheduleHide();}}
    @Override protected void onPause() { save(true); main.removeCallbacks(hideChrome); super.onPause(); }
    @Override protected void onSaveInstanceState(Bundle out) { save(true); out.putString("chapter", chapter == null ? desiredChapter : chapter); super.onSaveInstanceState(out); }
    @Override protected void onDestroy() { destroyed = true; ++generation; main.removeCallbacksAndMessages(null); if (chapterRequest != null) chapterRequest.cancel(true); metadata.shutdownNow(); clearPages(); if(images!=null)images.close(); super.onDestroy(); }
    @Override public boolean onKeyDown(int key, KeyEvent event) { if (key == KeyEvent.KEYCODE_VOLUME_UP || key == KeyEvent.KEYCODE_VOLUME_DOWN) { flip(key == KeyEvent.KEYCODE_VOLUME_UP ? -1 : 1); return true; } return super.onKeyDown(key, event); }

    private void showChapterFailure(){String reason=chapterError.isEmpty()?getString(R.string.reader_unavailable):chapterError;AlertDialog.Builder b=new AlertDialog.Builder(this).setTitle(getString(R.string.reader_source_failed,source.readerLabel(this,false))).setMessage(reason).setNegativeButton(getString(R.string.reader_close),null).setPositiveButton(getString(R.string.reader_retry),(d,w)->loadInitial());String diagnostic=source.chapterDiagnosticPath(comic);if(!diagnostic.isEmpty())b.setNeutralButton(getString(R.string.reader_diagnose),(d,w)->runReaderDiagnostic(diagnostic,true));b.show();}
    private void showPageFailure(int position){if(position<0||position>=pages.size())return;String path=pages.get(position).url,reason=images.failureDetail(path);AlertDialog.Builder builder=new AlertDialog.Builder(this).setTitle(getString(R.string.reader_image_failed)).setMessage(reason).setNegativeButton(getString(R.string.reader_close),null).setPositiveButton(getString(R.string.reader_retry),(d,w)->{for(Holder h:new ArrayList<>(holders))if(h.position==position){h.bind(position);break;}});if(source.canDiagnosePage())builder.setNeutralButton(getString(R.string.reader_diagnose),(d,w)->runReaderDiagnostic(path,false));builder.show();}
    private void runReaderDiagnostic(String path,boolean chapterLevel){String sourceName=source.readerLabel(this,false);Toast.makeText(this,getString(R.string.reader_diagnosing,sourceName),Toast.LENGTH_SHORT).show();metadata.submit(()->{String report=images.diagnose(path);main.post(()->{if(destroyed)return;new AlertDialog.Builder(this).setTitle(getString(R.string.reader_diagnostic_title,sourceName)).setMessage(report).setNegativeButton(getString(R.string.reader_close),null).setPositiveButton(getString(R.string.reader_reload),(d,w)->{if(chapterLevel||pages.isEmpty()){loadInitial();return;}for(Holder h:new ArrayList<>(holders))if(h.position==index){h.bind(index);break;}}).show();});});}

    private final class Holder extends RecyclerView.ViewHolder {
        final FrameLayout frame; final ZoomImageView picture; final Button error; final ProgressBar spinner;ReaderImageLoader.Request request; int position; boolean loaded;
        Holder(FrameLayout frame) {super(frame); this.frame = frame; picture = new ZoomImageView(ReaderScreenActivity.this);frame.addView(picture, new FrameLayout.LayoutParams(-1, -1));spinner = new ProgressBar(ReaderScreenActivity.this); frame.addView(spinner, new FrameLayout.LayoutParams(48, 48, Gravity.CENTER));error = button(getString(R.string.reader_image_failure_details), v -> showPageFailure(position)); error.setVisibility(View.GONE);frame.addView(error, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));picture.setNavigationListener(new ZoomImageView.NavigationListener() {public void onPrevious() { flip(mode == 1 ? 1 : -1); }public void onNext() { flip(mode == 1 ? -1 : 1); }public void onCenterTap() { setChrome(!chrome); }}); picture.setPagerManaged(mode != 2);}
        void cancel() { if (request != null) request.cancel(); loaded = false; picture.setImageDrawable(null); }
        void bind(int p) {cancel(); picture.setGestureSettings(ReaderGestureSettings.local(ReaderScreenActivity.this));position = p; error.setVisibility(View.GONE); spinner.setVisibility(View.VISIBLE);int chapterGeneration = generation;request = images.load(pages.get(p).url, getResources().getDisplayMetrics().widthPixels, new ReaderImageLoader.Callback() {public void complete(Bitmap bitmap) {if (!valid(chapterGeneration) || position != p) return;picture.setImageBitmap(bitmap); loaded = true; spinner.setVisibility(View.GONE);if (mode == 2) { int w = Math.max(1, canvas.getWidth()); frame.getLayoutParams().height = Math.max(1, (int)((long)w * bitmap.getHeight() / bitmap.getWidth())); frame.requestLayout(); }if (position == index) save(false);}public void failed() { spinner.setVisibility(View.GONE); error.setVisibility(View.VISIBLE); }});}
    }
    private final class Pages extends RecyclerView.Adapter<Holder> {public Holder onCreateViewHolder(ViewGroup parent, int type) {FrameLayout frame = new FrameLayout(ReaderScreenActivity.this); frame.setBackgroundColor(Color.BLACK);frame.setLayoutParams(new RecyclerView.LayoutParams(-1, mode == 2 ? Math.max(1, canvas.getHeight()) : -1));Holder holder = new Holder(frame); holders.add(holder); return holder;}public void onBindViewHolder(Holder holder, int position) { holders.add(holder); holder.bind(position); }public void onViewRecycled(Holder holder) { holder.cancel(); holders.remove(holder); }public int getItemCount() { return pages.size(); }}
}
