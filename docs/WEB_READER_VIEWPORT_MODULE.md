# Web Reader viewport and lifecycle ownership (local-only)

## Actual module, not a new Reader

`web/reader-viewport.js` owns only the existing browser viewport tracking: saved-page centering, IntersectionObserver selection, passive-scroll sampling, pending animation frames and their cleanup. Its environment supplies browser/document and a numeric onPage port; application state, source identities, credentials, network, persistence and rendering remain outside. `reader-viewport.d.ts` types this browser adapter. It has no imports, runtime/dependency upgrade or separate installer.

The real `app.js` constructs the tracker and delegates existing reset/start calls. Each start has one target, saved page, page count and a predicate bound to the actual Reader object, chapter object, episode ID, mode and active view. Local, optional compiled-source and explicitly authorized user-host reading still share the existing renderer and save endpoints. No source identity is interpreted here.

## Corrected lifecycle

- Stop marks that instance's lifecycle aborted, explicitly cancels pending requestAnimationFrame handles, disconnects its own observer and removes its own scroll listener. An already-delivered old callback cannot write progress, install another observer or stop a replacement owner.
- Saved-page centering still precedes observation by one frame. The original viewport-center rule, `-45%` margins, lazy images, passive fallback and per-frame scroll coalescing remain. Invalid/foreign/non-intersecting page entries cannot write progress.
- Leaving Reader through ordinary navigation now stops tracking, flushes existing dirty progress and invalidates outstanding comic/chapter requests. Late responses cannot redraw the hidden Reader or reopen it.
- Opening another comic stops old tracking before awaiting a save. An explicit exit stops tracking immediately and rechecks its Reader/request ownership after save and fullscreen awaits; an old exit cannot close a newer work or chapter.
- Delayed paged-mode scroll-to-top checks the same Reader/chapter/current mode. Invalid or inactive-view progress samples are ignored; valid 400ms debounce, save payload, existing endpoints, dirty/saved semantics and keepalive remain unchanged.

This is not a claim that all asynchronous persistence is serialized or that a failed save is durable. It does not add server-side write ordering, database migrations, recovery, new sources, settings, touch recognition or a recommendation change. Browser fullscreen behavior, physical scrolling feel, hidden-page/BFCache behavior, real storage/network errors and actual device QA still require their own evidence.

Subsequent local [Reader progress maintenance](READER_PROGRESS_MODULE.md) separately addresses service-submission ordering and stale Web acknowledgements. It does not convert this viewport module's mock evidence into HTTP/browser/crash/cross-device acceptance, or supply persistent replay/intent ordering across packet reordering.

## Verification scope

The selected source gates cover the existing147 tests plus27 Reader lifecycle contracts and26 new viewport/application tests. New checks execute the actual module against explicitly mocked browser APIs and selected actual AST-extracted app functions against controlled promises. They cover stop at either restore frame, late observer/scroll callbacks, old/new ownership, fallback coalescing, invalid pages, detached nodes, actual navigation/request fences, pending exit/fullscreen races, saved-page behavior and valid progress debounce.

Initial development attempt:199 tests,197 passed/2 failed. The failures were test synchronization across a VM promise and a whitespace-sensitive moved static assertion; both are preserved in raw logs. The test now waits for the actual mocked API-start signal and retains the original sampling assertion with whitespace tolerance. After one additional pending-comic regression,200 tests pass. Final clean-source results bind their exact commit; type and Web syntax logs are separate. These are not full app/browser startup, real HTTP, CI, physical keyboard/touch or installable tests.

Existing public module numbers, schema14, Android gesture options, source/provider contracts, tag/recommendation/Visual data, synchronization, application update implementation and dependencies are unchanged. The existing full Web-tree package copy/update path carries this internal module; no per-module installation/update is introduced. The immutable `9e879d3...`/Dev82 r2 binaries do not include it, the prior keyboard maintenance or the later guide text. They remain a separate bounded acceptance candidate and must not be relabeled.

## Reused browser facilities

Checked 2026-10-25: [cancelAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/cancelAnimationFrame), [IntersectionObserver.disconnect](https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver/disconnect), [AbortController.abort](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort). The AbortController is a local lifecycle marker; it does **not** automatically disconnect observers or cancel frames. The module explicitly performs both cleanup actions and checks the marker before callbacks.

Full local-first/content-free/user-selected-source modular-reader completion and pending source/trust/native/sync/quality/one-action physical-upgrade acceptance remain OPEN. No production data, Java/app/listener execution, push, merge, release, OTA, installation or deployment was performed.
