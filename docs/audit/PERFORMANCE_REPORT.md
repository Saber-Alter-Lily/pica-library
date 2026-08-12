# Performance Report

- Synthetic Library size: 1770 records.
- Initial rendered Library records: 48.
- Subsequent increment: 48; hard page-size clamp: 100.
- Cover loading: native lazy loading and asynchronous decoding.
- Recommendation seed budget: default 12, hard maximum 16.
- Recall routes: related seeds plus top two tag/category/author/circle signals.
- Provider recall concurrency: 3.
- Candidate requests: first page only; no recommendation `searchAll` or
  `comicsAll` fanout.

These are implementation bounds, not throughput claims. Final browser visual QA
and full regression results are recorded separately during RC validation.
