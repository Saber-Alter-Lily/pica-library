# Feature Matrix

| Capability | Implemented | Evidence | Status / note |
| --- | --- | --- | --- |
| Independent private non-fork repository | Yes | GitHub metadata | Implemented |
| API/media client isolation and debug redaction | Yes | SDK security tests | HTTPS by default; opt-in HTTP remains credential-free |
| Fresh DB raw-ID enqueue | Yes | Database unit tests | LOCAL and GITHUB jobs avoid FK failure |
| Versioned SQLite migration and rollback | Yes | 3 integration tests | Implemented |
| Author review, merge and dictionary import | Yes | Unit/API tests | Implemented |
| Explainable collection recommendation | Yes | Unit tests | Implemented |
| Unified persistent download queue | Yes | Unit/API/CLI tests | Enqueue-only `download add` supports episodes and runner without credentials |
| Job scheduler plus global media gate | Yes | Controlled-promise retry tests | Attempts settle before retry; retry backoff respects cancellation |
| Cumulative progress and pause/resume | Yes | Multi-episode service tests | PREPARING pause is legal; resume preserves retry count and cumulative bytes |
| Manual failed-job retry | Yes | Database/API/Web tests | Retry resets error and automatic retry budget; Resume remains distinct |
| Performance profiles | Yes | CLI/Web/workflow and profile tests | Balanced default; Custom applies explicit overrides |
| Local and GitHub runner semantics | Yes | Queue/workflow/artifact tests | GitHub jobs and artifact records use `GITHUB` |
| Downloaded-only update checking | Yes | Fake-provider service tests | Partial download stores full observed episode baseline |
| Repair missing/empty/failed files | Yes | Filesystem unit tests | Implemented |
| Portable Bundle validation | Yes | Bundle and Browser Lite tests | Schema/kind/secrets checked |
| Browser Lite prepared recommendations | Yes | Browser state and 1280x720/390x844 QA | Default cards omit diagnostics and popularity |
| Browser Lite IndexedDB persistence | Yes | Pure state round-trip plus browser load QA | Records, authors, recommendations/profile and plans persist |
| Five-area Web IA | Yes | Browser load QA and syntax checks | Browser Lite first screen verified |
| Popular and complete Related views | No | None | Deferred until stable provider contract |
| Real Pica speed benchmark | No | None | NOT YET BENCHMARKED |
| Public release, Pages, npm package | No | Policy and repository checks | Intentionally prohibited |
