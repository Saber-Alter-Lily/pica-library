# S3 CORE-HOST-23 — separate source-free Desktop core with user-owned Suwayomi Host

Date: 2026-11-01. Status: **Draft PR #281, unpublished; genuine Host network and physical Windows UI not yet verified**.

## The real product gap

The original full Web/Reader already works as an isolated, physically source-free Windows core. Its remote Host controls, on the other hand, were only bound in the old provider-enabled Desktop composition. This batch makes the existing user-owned Suwayomi Host optional for the separate core without rebuilding a manga SDK/Reader or making an external Host mandatory.

User workflow: explicitly launch the separate Host-enabled candidate, retain original local books/shelves/history, open original settings, choose an owned Suwayomi endpoint, save and enable it with consent, authorize one 15-minute reading session, list its installed sources or own library, choose a work, search/read the source in the **same original Web Reader**. Downloading a chapter as a persistent local copy is **not** yet available in this new standalone preview; the service has no local-download ports and advertises `downloads:false`.

## Open-source/component decisions

| Option | Reuse decision | Boundary |
| --- | --- | --- |
| [Suwayomi Server](https://github.com/Suwayomi/Suwayomi-Server) | Existing fixed GraphQL Host requests, permission-based `HostedLibraryReader` and SourceHost connections | User must provide/run their own Host; no bundled executable/extension or automatic catalogue |
| [Mihon](https://github.com/mihonapp/mihon) | Optional sources distinct from the Reader | UX/architecture reference; not Mihon extension ABI or source scripts |
| Pica Library original `ReaderService` / `OnlineReaderService` / Web Reader | Real existing chapter/image/progress and local CBZ/SQLite, not reimplemented | No duplicate database or renderer |
| Existing app-owned Host controller and `p-limit` | Reuse current HTTP, source-ID ownership, session expiry, cancellation and caching | No generic network proxy, DNS discovery, credentials inheritance or production source authority |

## Actual source changes

- `scripts/stage-offline-full-web-qa.ts`, `src/offline-core/full-web-qa-assets.ts`: distinct hash-verified original full Web resource lists. Normal core remains without Host management initializers. Host variant only adds the three existing reviewed UI scripts; site account/plugin/search scripts remain physically excluded. `host-library.js` was already an imported, passive module in original `app.js`, not a Host control initializer; leaving it in ordinary default manifest is existing behavior.
- `src/offline-core/qa-http.ts`: optional **type-injected** generic Host ports and existing Host API route meanings under the same authenticated loopback/cookie/CSRF. Image-only same-origin native request allowance is tightly scoped. No Host source runtime import into default offline-core package; no open host request without explicit command.
- `src/desktop/core-preview-runtime.ts`, `src/desktop/core-preview-main.ts`, `src/desktop/core-user-host-preview-main.ts`: preserve original non-exporting default executable while reusing common startup in the explicitly enabled Host alternative. Marked owned profile, existing lock, original SQLite/Reader and OS file picker. Host controller is constructed only in separate entry.
- `scripts/build-offline-core-candidate.ts`: audit separate bundle, require reviewed original host modules and forbid site providers, Pica/E-H/JM account SDK, signed source workers, updater and unapproved dynamic deps.
- `test/unit/offline-user-host-http.test.ts`: real localhost server, synthetic owned Host GraphQL, original Reader and progress; ownership/Origin/CSRF/disable denial; separate default vs Host bundle and staged scripts.

## Audit and failure history

Original #281 first head `de0fd57`: default Web/Desktop CI had 7 failing unit tests. The two specific causes were (1) original zero-export Desktop binary unexpectedly exported shared startup and (2) normal manifest verifier rejected the previously required imported `host-library.js`. Both were corrected by refactoring—not suppressing tests. Follow-up exact SHA checks determine any PASS; parent #280's 25/25 result cannot be reused.

## What this does *not* accomplish

Not a live user-managed Host certification; no real manga platform, account, extension or copyrighted content downloaded. Not a signed official source/root, protected OS sandbox or Android Binder service. No v0.5.0 actual private profile migration/rollback, full Windows physical UI QA or final 42+12 requirement acceptance. G1–G4 remain OPEN. No formal release, main merge or OTA.
