# Taste Chronicle / 我的收藏图鉴

Pica Library uses the stable newest-first order returned by a complete favorites pagination pass as an ordinal signal. It does **not** invent favorite timestamps. Rank 1 means the first/newest item in the current snapshot; rank N means the last/oldest item. Ranks are snapshot-relative and may shift when new favorites appear.

The machine-readable `HistoricalTasteSnapshot` is the sole input shared by recommendation integration, the Web profile viewer, narratives, and the print/PDF layout. It contains lifetime preferences, bounded ordinal-recency weights, bucketed trends, cluster trends, author/circle/tag trends, analytics-only pair/triple combinations, collection-style summaries, and explicit data-quality semantics.

The Web page is named “我的收藏图鉴”. It includes interest lines and representative works, an interest-universe map, creator and circle views, lifetime/recent comparisons, relative-order trends, a long-tail overview, and an explanation of how the recommendation system uses the same snapshot. Export uses a dedicated 8–12 page print layout and the browser/Windows “Save as PDF” path so Chinese system fonts and charts remain local; no remote renderer, font, analytics, or upload is used. Browser Lite degrades to a readable capability message when a bundle has no optional snapshot.

Pair and triple analytics remain visible, but their default recommendation ranking weights are zero. Ordinal-recency evidence is supplementary and never erases lifetime preferences. The current file cache keeps only the latest valid snapshot and uses a same-directory temporary write plus rollback-capable swap so a failed rebuild preserves the previous snapshot.
