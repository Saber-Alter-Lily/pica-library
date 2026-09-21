# Pica Library v0.4.7 Long-task Stability Audit

Status: development / pre-release  
Scope: Windows Desktop + local Web UI + Android

## Product rule

A task that can take more than a few seconds must not behave like a black box.

Every long-running task should expose, where technically meaningful:

- current phase;
- completed / total progress or an explicit indeterminate phase;
- bounded network waits;
- pause or a clearly documented safe-stop equivalent;
- cancel;
- retry / resume;
- failure reason;
- restart recovery;
- preservation of the last usable result until a replacement is complete.

"Pause" has two implementations:

1. **in-place pause** — execution waits at a safe checkpoint and resumes in the same run;
2. **durable safe-stop** — the Worker is stopped at a safe boundary and a new Worker resumes from durable output/checkpoints. The UI must say when resume restarts computation rather than continuing the same CPU state.

## Desktop / Web

| Task | Progress | Pause | Cancel | Retry / resume | Timeout / stall bound | Durable recovery |
| --- | --- | --- | --- | --- | --- | --- |
| Recommendation V3 generation | 7 phases + done / total + live card | In-place checkpoint pause after current bounded provider request | Yes; current usable cycle retained | Resume same run; regenerate after failure | Pica API 15 s; 3 consecutive provider failures stop Pica retrieval | stale `buildingCycleId` cleared on process startup; unusable replacement never promoted |
| Visual-style indexing | comic + page/model phase + overall progress | In-place at comic boundary | Yes; unfinished comics stay pending | Resume same loop; later rebuild skips indexed works | model load 120 s; per-page inference 45 s | index is committed per work; unfinished works remain pending |
| Favorites sync | page / processing progress | In-place at page checkpoint | Yes | Resume same run | Pica API 15 s | incomplete full reconciliation is not committed |
| WebDAV sync | scanning / uploading / publishing; comic/page counts and bytes | In-place at scan/object checkpoints; current max 4 uploads finish first | Yes | Resume same run; later sync reuses existing SHA-matched objects | WebDAV metadata / upload requests are bounded | remote pointer/catalog is published only through sync publication flow |
| WebDAV local scan | comic-by-comic | Shares WebDAV controls | Shares WebDAV controls | Resume sync | file reads are async; event loop yielded between comics | no destructive local mutation |
| Download queue | pages/bytes, speed, ETA, retry count | Persistent queue PAUSED state | Yes | Resume / manual retry | scheduler retry budget and media limits | DB-backed job state and partial-file handling |
| Software update | phase / bytes / state | No byte-range pause; explicit stop is used instead | Yes | Re-check / restart download | abort controller and update progress watchdogs | previous installation remains usable until verified replacement |
| Browser lifecycle | N/A | N/A | explicit full exit | reopen | 5 s browser-close grace | paired mobile device keeps Mobile Bridge alive |

## Android

| Task | Progress | Pause semantics | Cancel | Retry / resume | Network bound | Durable recovery |
| --- | --- | --- | --- | --- | --- | --- |
| Native Recommendation V3 | phase + done / total + foreground / inline panel | Safe-stop: cancel Worker with durable pause marker; Resume starts the current generation again; prior recommendation snapshot remains usable | Yes | Resume / regenerate | Pica connect 7 s / read 20 s; after 3 consecutive Pica failures the run stops using Pica and continues other sources | snapshot is committed only after final cooperative checkpoint |
| Phone downloads | chapter + page progress + foreground notification | Durable true resume: Worker stops and completed page index is already committed | Yes | Resume skips verified pages | Pica/media connection/read timeouts | `.part` files are not trusted; page URI index records complete pages |
| Desktop favorites + covers import | metadata-page and cover counts | Safe-stop; Resume reruns unfinished work and reuses cached data | Yes | Resume / retry | Desktop Bridge requests bounded by client layer | catalog write is atomic; cover cache is reusable |
| Pica favorites bootstrap | Pica page / fetched-total progress | Safe-stop; Resume re-reads remote pages; existing local cache remains usable | Yes | Resume / retry | PicaClient connect 7 s / read 20 s | merge happens after the remote listing completes |
| App update | DownloadManager observable progress | system DownloadManager state; no custom byte-range pause | Yes | Retry | 120 s stall detector | SHA-256, package ID, version and signing identity verified before install |

## Failure invariants

1. A failed recommendation refresh must never replace the prior usable recommendation cycle/snapshot.
2. Killing Desktop during recommendation generation must not require deleting `library.db`.
3. A user-requested pause/cancel must not be swallowed as an ordinary item-level error.
4. UI controls must represent real backend/Worker state; no decorative pause buttons.
5. Reopening or navigating away from a page must not lose a long-running task's authoritative state.
6. Network loss must produce bounded waits and actionable failure states, not indefinite spinners.
7. Partial downloads and partial remote uploads must not be treated as completed content.
8. Long local scans must not monopolize the Node/browser UI event loop.
9. Android WorkManager cancellation must be checked before durable replacement of recommendation snapshots.
10. The last usable user data remains authoritative until a new result is fully committed.

## Release gate for v0.4.7

Before release:

- full TypeScript / unit / integration suite PASS;
- real Chromium localization and recommendation-control smoke PASS;
- Android unit + lint + assemble PASS;
- network interruption recovery tests PASS;
- long-task contract test PASS;
- Windows package smoke PASS;
- formal Android same-package / same-signing-certificate verification PASS;
- manual QA on Windows and Android for at least:
  - start → pause → resume recommendation;
  - cancel recommendation and confirm previous results remain usable;
  - pause/resume visual indexing;
  - pause/resume/cancel favorites sync;
  - pause/resume/cancel one WebDAV sync;
  - pause/resume one Android download;
  - pause/resume Android recommendation and verify old recommendation remains visible.
