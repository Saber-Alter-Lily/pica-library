# Native JM source-screen UX — unpublished acceptance slice (NEXT-41)

Date: 2026-10-22 (America/Los_Angeles). Base: `43d9c2bc5a789994973703fe84408e8824962d5c`. Existing Draft PR #205. Status at source freeze: IMPLEMENTED_CANDIDATE / FRESH_AUTOMATED_PACKAGE_GATES_PENDING / HUMAN_PROVIDER_QA_PENDING.

The user explicitly authorized this round of isolated development/build despite the still-failing Local Memory DPAPI coordination claim. No coordinator identity or secret is changed. This does not authorize main merge, release, OTA, deployment, issue closure or production-data access.

## Bounded user-visible change

- Keep the existing small native source screen and pinned JM SDK. Replace all source-screen labels, dialogs, formatted progress, success/empty/cancel/failure/recreation messages with 68 semantic resources in Simplified Chinese, English and Japanese. Provider titles/authors remain raw content, not UI translation inputs.
- One operation gate disables every conflicting action, including logout, enrichment, result details and the search field. Duplicate taps cannot enqueue another operation. An indeterminate indicator is visible during work. Only favorites scan and metadata enrichment expose Cancel; the message states that an active request may need to finish first.
- Favorites scanning shows pages and counts. Confirmation becomes available only after a complete verified scan, never from cancelled/failed/late results. Import remains explicit and additive; it creates no Likes and performs no remote favorite writes. A failed/expired import preview is cleared and asks for a fresh scan, without asserting that an interrupted storage commit was fully rolled back.
- Enrichment shows processed/updated/failed counts for the existing maximum-20 batch and explicitly retains completed metadata on cancellation. No new metadata inference or schema is added.
- Search supports the IME Search action, empty-field browsing and a clear no-results message. Failure preserves the last successful page; paging uses its submitted query rather than a newly edited, unsubmitted query. All bounded visible IDs are JM namespaced before catalog merge.
- Login errors do not retain the previous signed-in label or display backend exception payloads. Password fields do not save hierarchy state and are cleared on dismiss. Remember remains unchecked by default; existing OS-protected storage semantics are unchanged.
- Rotation/recreation retains bounded visible search metadata, current page and unsent query, but never passwords or import tokens. It does not replay search/import automatically. Interrupted scans require a fresh preview; interrupted imports ask the user to inspect the library rather than claiming rollback. Late callbacks cannot navigate a destroyed Activity.

This is source-screen localization, not a claim that all JM detail/Reader UI or all of Android is fully localized. Native JM proxy/cross-device progress, dynamic plugin trust/lifecycle and automatic JM recommendation recall are still outside this slice.

## Automated gates required for this exact source

- Android synthetic UI tests: three locales and formatted progress; initial status and all-action busy gate; explicit single confirmation; cancellation before work and late success; failed scan/expired preview; enrichment cancel; failed search/paging; IME/empty/length validation; foreign namespace rejection; recreation/token/password exclusion; failed account switch and logout confirmation; status failure and late navigation.
- Existing Android download/Reader/WorkManager/catalog tests, full Android unit/lint/Dev and release-shrinker builds. No synthetic test is a real-account/network/OEM test.
- Desktop resource-contract tests verify all source-screen keys and positional formats in all three locales; existing Desktop/Web/source/browser gates remain required.
- CI-only Dev versionCode 57, package `com.picalibrary.android.dev`, original fixed certificate. The private key remains in Actions. Actual downloaded APK and same-source Windows package need independent provenance/integrity verification.
- Preserve the previous complete handoff ZIP. Build one new complete review ZIP with source/patch, installables when available, compact evidence, licenses, checksums, review prompt and precise remaining holds. Build results recorded after freeze supersede only their earlier PENDING gate labels, not human acceptance.

## Deferred consolidated human QA — not requested now

1. Check the source screen in zh-CN/en/ja, narrow layouts and large font; actual touch, scrolling, TalkBack and IME behavior remain unverified.
2. Use the user's own JM account on a Dev-only device/profile; check Remember off/on, failed switch, restored/expired credentials and logout without deleting local records/downloads.
3. Scan complete/empty/multiple-page favorites; cancel mid-request, rotate and retry. Nothing from an incomplete preview should be imported; explicit repeated complete imports should be idempotent.
4. Interrupt enrichment after some successful items. Verify those items remain and further batches continue. Search failure should preserve the previous page and correctly route details/online/offline Reader.
5. Retain all existing #199/#200/#204, Reader gesture, offline SAF/process-kill/OEM/weak-network/performance and source/provider acceptance holds. No issue is closed and no release follows automatically.
