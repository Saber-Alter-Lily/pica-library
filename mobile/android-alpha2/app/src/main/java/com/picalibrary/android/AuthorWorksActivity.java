package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import java.util.*;
import java.util.concurrent.*;

/** Creator works over provider bindings. Core retrieval is Pica + E-H; ExH is optional. */
public final class AuthorWorksActivity extends LocaleAwareActivity {
    private static final class LocalState {
        final UnifiedCatalogStore.Snapshot catalog;
        final AuthorConceptStore.Concept concept;

        LocalState(
            UnifiedCatalogStore.Snapshot catalog,
            AuthorConceptStore.Concept concept
        ) {
            this.catalog = catalog;
            this.concept = concept;
        }
    }

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private String conceptId = "", sourceMode = "all";
    private TextView heading, status;
    private RecyclerView list;
    private boolean destroyed, refreshing, localLoading;
    private int localLoadGeneration;
    private AuthorConceptStore.Concept concept;
    private UnifiedCatalogStore.Snapshot catalog;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        Ui.applyWindow(this);
        conceptId = safe(getIntent().getStringExtra("authorConceptId"));
        renderShell();
        loadLocalState(true);
    }

    private Button compact(
        String label,
        android.view.View.OnClickListener action
    ) {
        return Ui.button(this, label, action, true);
    }

    private void renderShell() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v, i) -> {
            v.setPadding(
                0,
                i.getSystemWindowInsetTop(),
                0,
                i.getSystemWindowInsetBottom()
            );
            return i;
        });

        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(
            Ui.dp(this, 8),
            Ui.dp(this, 6),
            Ui.dp(this, 8),
            Ui.dp(this, 4)
        );
        bar.addView(compact("‹ 返回", v -> finish()));
        heading = Ui.text(
            this,
            concept == null ? "作者作品" : concept.canonicalName,
            21,
            Ui.TEXT,
            true
        );
        bar.addView(heading, new LinearLayout.LayoutParams(0, -2, 1));
        bar.addView(compact("↻", v -> refreshOnline()));
        root.addView(bar);

        HorizontalScrollView scroller = new HorizontalScrollView(this);
        LinearLayout filters = new LinearLayout(this);
        filters.setPadding(
            Ui.dp(this, 12),
            0,
            Ui.dp(this, 12),
            Ui.dp(this, 2)
        );
        addFilter(filters, "全部", "all");
        addFilter(filters, "Pica", "pica");
        addFilter(filters, "E-H", "eh");
        if (EhCapabilityStore.load(this).available())
            addFilter(filters, "ExH", "exh");
        scroller.addView(filters);
        root.addView(scroller);

        status = Ui.text(this, "", 12, Ui.MUTED, false);
        status.setPadding(
            Ui.dp(this, 14),
            Ui.dp(this, 3),
            Ui.dp(this, 14),
            Ui.dp(this, 3)
        );
        root.addView(status);

        list = new RecyclerView(this);
        list.setLayoutManager(new LinearLayoutManager(this));
        list.setItemAnimator(null);
        list.setPadding(
            Ui.dp(this, 6),
            0,
            Ui.dp(this, 6),
            Ui.dp(this, 16)
        );
        root.addView(list, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        root.requestApplyInsets();
    }

    private void addFilter(
        LinearLayout parent,
        String label,
        String value
    ) {
        Button b = compact(
            label + (sourceMode.equals(value) ? " ✓" : ""),
            v -> {
                sourceMode = value;
                renderShell();
                renderWorks();
                refreshOnline();
            }
        );
        LinearLayout.LayoutParams lp =
            new LinearLayout.LayoutParams(-2, -2);
        lp.setMargins(0, 0, Ui.dp(this, 6), 0);
        parent.addView(b, lp);
    }

    private LocalState readLocalState() {
        UnifiedCatalogStore.Snapshot nextCatalog =
            UnifiedCatalogStore.load(this);
        EhSemanticStore.Snapshot semantics = EhSemanticStore.load(this);
        AuthorConceptStore.Snapshot authors =
            AuthorConceptStore.build(nextCatalog, semantics);
        return new LocalState(nextCatalog, authors.get(conceptId));
    }

    private void loadLocalState(boolean refreshAfterLoad) {
        final int generation = ++localLoadGeneration;
        localLoading = true;
        if (status != null)
            status.setText(LocalizedText.ui("正在读取本地作者作品…"));

        worker.submit(() -> {
            LocalState next = readLocalState();
            runOnUiThread(() -> {
                if (
                    destroyed ||
                    generation != localLoadGeneration
                )
                    return;
                localLoading = false;
                applyLocalState(next);
                renderWorks();
                if (refreshAfterLoad) refreshOnline();
            });
        });
    }

    private void applyLocalState(LocalState next) {
        catalog = next.catalog;
        concept = next.concept;
        if (heading != null)
            heading.setText(
                concept == null
                    ? LocalizedText.ui("作者作品")
                    : concept.canonicalName
            );
    }

    private void renderWorks() {
        if (status == null || list == null) return;
        if (localLoading || catalog == null) {
            status.setText(LocalizedText.ui("正在读取本地作者作品…"));
            list.setAdapter(
                new UnifiedComicCollectionAdapter(
                    this,
                    UnifiedComicCollectionAdapter.MODE_LIST,
                    Collections.emptyList(),
                    null
                )
            );
            return;
        }
        if (concept == null) {
            status.setText(
                LocalizedText.ui(
                    "作者信息已变化，请返回作者列表重新选择"
                )
            );
            list.setAdapter(
                new UnifiedComicCollectionAdapter(
                    this,
                    UnifiedComicCollectionAdapter.MODE_LIST,
                    Collections.emptyList(),
                    null
                )
            );
            return;
        }

        LinkedHashSet<String> ids = new LinkedHashSet<>();
        if ("all".equals(sourceMode))
            ids.addAll(concept.comicIds);
        else
            for (AuthorConceptStore.Binding b : concept.bindings)
                if (bindingMatches(b, sourceMode))
                    ids.addAll(b.comicIds);

        ArrayList<UnifiedCatalogStore.Entry> items =
            new ArrayList<>();
        for (String id : ids) {
            UnifiedCatalogStore.Entry e = catalog.byId.get(id);
            if (e == null) continue;
            if (
                "eh".equals(sourceMode) &&
                !e.sourceBindings.contains("eh")
            )
                continue;
            if (
                "exh".equals(sourceMode) &&
                !e.sourceBindings.contains("exh")
            )
                continue;
            if (
                "pica".equals(sourceMode) &&
                !(
                    e.picaAvailable ||
                    e.sourceBindings.contains("pica") ||
                    "pica".equals(e.providerId)
                )
            )
                continue;
            items.add(e);
        }

        items.sort(
            (a, b) ->
                safe(b.updatedAt).compareTo(safe(a.updatedAt))
        );
        status.setText(
            (
                refreshing
                    ? LocalizedText.ui("正在刷新在线作品 · ")
                    : ""
            ) +
            items.size() +
            LocalizedText.ui(" 部已识别作品 · ") +
            AuthorConceptStore.sourceLabel(concept)
        );
        list.setAdapter(
            new UnifiedComicCollectionAdapter(
                this,
                UnifiedComicCollectionAdapter.MODE_LIST,
                items,
                this::open
            )
        );
    }

    private boolean bindingMatches(
        AuthorConceptStore.Binding b,
        String mode
    ) {
        return "pica".equals(mode)
            ? "pica".equals(b.providerId)
            : (
                "eh".equals(mode) ||
                "exh".equals(mode)
            ) &&
            "eh".equals(b.providerId);
    }

    private void refreshOnline() {
        if (
            refreshing ||
            localLoading ||
            concept == null
        )
            return;

        refreshing = true;
        renderWorks();

        final String mode = sourceMode;
        final String picaQuery =
            AuthorConceptStore.queryForPica(concept);
        final String ehQuery =
            AuthorConceptStore.queryForEh(concept);

        worker.submit(() -> {
            try {
                if (
                    ("all".equals(mode) || "pica".equals(mode)) &&
                    PicaClient.available(this)
                ) {
                    try {
                        PicaClient.ComicPage page =
                            new PicaClient(this).search(
                                picaQuery,
                                1,
                                "ld",
                                Collections.emptyList()
                            );
                        UnifiedPicaCatalogSync.mergeAll(
                            this,
                            page.comics
                        );
                    } catch (Exception ignored) {}
                }

                if ("all".equals(mode) || "eh".equals(mode)) {
                    try {
                        List<EhClient.Comic> rows =
                            new EhClient(this).search(
                                ehQuery,
                                "eh"
                            );
                        UnifiedEhCatalogSync.mergeAll(
                            this,
                            rows
                        );
                    } catch (Exception ignored) {}
                }

                if (
                    ("all".equals(mode) || "exh".equals(mode)) &&
                    EhAccountStore.load(this).configured()
                ) {
                    try {
                        EhCapabilityStore.Snapshot capability =
                            EhCapabilityStore.refresh(
                                this,
                                false
                            );
                        if (capability.available()) {
                            List<EhClient.Comic> rows =
                                new EhClient(this).search(
                                    ehQuery,
                                    "exh"
                                );
                            UnifiedEhCatalogSync.mergeAll(
                                this,
                                rows
                            );
                        }
                    } catch (Exception ignored) {}
                }
            } finally {
                LocalState next = readLocalState();
                runOnUiThread(() -> {
                    if (destroyed) return;
                    refreshing = false;
                    applyLocalState(next);
                    renderWorks();
                });
            }
        });
    }

    private void open(UnifiedCatalogStore.Entry entry) {
        Intent i =
            new Intent(this, UnifiedComicDetailActivity.class);
        i.putExtra("comicId", entry.id);
        i.putExtra("title", entry.title);
        i.putExtra("author", entry.displayAuthor());
        startActivity(i);
    }

    @Override protected void onDestroy() {
        destroyed = true;
        localLoadGeneration++;
        worker.shutdownNow();
        super.onDestroy();
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
