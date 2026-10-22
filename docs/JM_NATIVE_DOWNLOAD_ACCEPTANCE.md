# Native JM explicit downloads — unpublished acceptance slice

Date: 2026-10-22 (America/Los_Angeles). Base source: `0549bc5e271d936c656cd9c6bdf6baa7e13b5681`; existing Draft PR #205. Status: IMPLEMENTED_CANDIDATE / FRESH_AUTOMATED_AND_PACKAGE_GATES_PENDING / HUMAN_PROVIDER_QA_PENDING.

## User-visible scope

- JM search → common comic details → single chapter or explicitly confirmed all-chapter download.
- Direct phone access through the existing pinned MIT JM SDK; Desktop need not be running.
- The existing task center displays JM tasks with progress and pause/resume/cancel. Wi-Fi-only storage settings and media-network/filesystem resource tags are reused.
- Completed chapters use `PhoneDownloadStore` and `PhoneDownloadReaderSource`; they survive logout and are persistent downloads, not disposable Reader cache.
- Do not mark a partly downloaded chapter readable. Earlier completed chapters survive an interruption in a later chapter.

## Integrity and lifecycle

- Separate internal, per-comic/chapter AtomicFile checkpoints record only SDK page locator, local URI, SHA-256 and byte count. They contain no account secrets. Checkpoints stay internal as WorkManager resume metadata, independent of the user-selectable catalog data root.
- Resume verifies the saved page checksum and length, not merely whether a nonempty file exists. Checkpoints remain available after cancellation for a later explicit retry; cancellation does not delete user downloads.
- App-private external storage is the default body-page destination. An explicitly chosen SAF tree is honored; a nonwritable tree must not silently fall back to another location. Temporary files created by the current write are removed on failure; existing destination files are never pre-deleted to make room.
- New pages are capped at 20 MiB, validated by image signatures and decoded bounds, with a 100-million-pixel safety limit. Comic/chapter IDs and every page locator are validated before fetching pages. A selected chapter must belong to the requested comic.
- Login attempts/logout rotate a persistent non-secret job epoch. An older queued job cannot continue using another account. A session that cannot be restored must not fall through to anonymous requests under an authenticated job binding. Explicit resume captures the current binding. Clearing login does not delete downloaded chapters.
- One active WorkManager task per JM comic prevents duplicate taps from starting another active job. The task center reconstructs actual IDs from persisted tags, not the UUID of a request discarded by KEEP. A striped same-comic engine lock also serializes replacement overlap.

## Deliberately unchanged

- No production database/credentials/app instance used for tests. No schema or existing Pica/E-H download-format rewrite.
- No recommendation weight, automatic JM recall, Like/style feedback, Visual model, embedding, generation pointer or sync-protocol change.
- Native JM cross-device progress/proxy parity, full source-screen localization, dynamic third-party extensions and incremental/OTA runtime distribution remain out of scope.
- Existing frozen acceptance package is retained. Dev identity remains `com.picalibrary.android.dev`; the CI-only next candidate code is 56, with the existing fixed signing certificate. Never uninstall to bypass an incompatible update.

## Required gates

1. Synthetic engine tests: complete chapter → existing offline Reader; mid-page failure/pause → no partial chapter; restart/resume; corrupt saved bytes; foreign identities; empty/non-image/invalid decoded responses; account-switch binding; no fake favorite/Like.
2. WorkManager tests: reconstruct JM after registry loss, preserve paused identity, cancel, duplicate KEEP without relabeling, unchanged Pica/E-H recovery tests.
3. Full Android unit tests, lint, Dev build and release shrinker build; independent downloaded fixed-signature APK verification. Fresh Desktop/Web/package gates remain bound to the same candidate source.
4. Deferred real JM/device checks: account/no-account/network behavior, Wi-Fi switching, process kill/OEM restrictions, real SAF providers and revoked permissions, full storage, cancellation during write, offline Reader/restart and touch UI. Synthetic host tests are not these results.
5. No main merge, Release/tag/stable OTA/deployment/issue closure. The user is not asked to test yet; collect these checks for the next consolidated acceptance.
