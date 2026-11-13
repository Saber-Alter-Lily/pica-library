# Android source lifecycle (NEXT-50, unpublished candidate)

## User-visible contract

The phone has its own **Online sources** page under account/source settings, available in Chinese, English and Japanese. Checkboxes edit a draft; **Save choices** applies it. A stale editor must reload. Rotation retains an unsaved draft only while its baseline revision is current. Desktop pairing does not overwrite these phone-local choices.

Fresh installations start with Pica, E-H/ExH and JM off. An existing installation adopts its legacy source availability once, based only on the presence of a disclaimer/account preference; no secret is decrypted for migration. Thereafter `filesDir/source-access-v1.json` is authoritative. A malformed/oversized file fails closed and is retained instead of silently overwritten.

Disabling a source stops new provider requests, revokes retained client requests, cancels its queued downloads and pauses its registered tasks. Re-enabling requires reopening an online screen and manually resuming paused work. Existing downloads, reader cache, credentials, catalog entries, private tags, favorites, reading history and recommendation batches are retained. User-requested logout/deletion remain separate operations. Ordinary local/LAN/WebDAV reads, pairing and sync are not online-provider permissions; provider relay requests are.

## Module boundaries

- `sources/SourceAccessPolicy`: pure Java snapshot/CAS, per-source epoch, cancellation registration and short local commit guard. It imports neither Android nor a provider SDK. Saving persists before changing runtime access; a failed persistence callback must not revoke requests.
- `SourceAccess`: Android AtomicFile adapter, bounded strict schema and one-time legacy adoption. No account fields are stored in this policy. Source-choice preferences are not portable tag or gesture preferences.
- `SourceHttpConnection`: wraps the existing transports, with cancellation and checks around stream/header operations. Source clients attach their permit to fetched metadata; catalog/favorite/cache publication rechecks that same epoch.
- `SourceTasks`: uses existing WorkManager and task registries. A malformed historical download identity is retained and skipped without preventing source-wide cancellation. Scheduler initialization failure does not falsely report that the already-persisted source policy failed to save; transport/commit guards remain effective.
- JM reuses the pinned MIT `JMComic-Api-Java` SDK v1.1.12. `JmSource.revoke()` cancels SDK initialization and closes the active SDK without waiting on the source's synchronized request monitor. No protocol or second network stack is introduced. Re-enabling creates a new adapter.
- Reader sources expose an optional permit. Cached pages and downloaded files still decode directly; newly fetched bytes cannot publish to the reader cache after their source epoch is revoked, including disable followed by re-enable. JM covers use the JM/public media port rather than depending on a Pica login.

Source disabling cannot undo a request already received by a remote service. Native WebView cancellation and Storage Access Framework/OEM provider behavior still need device evidence; no universal instant remote-side rollback is claimed.

## Validation and upgrade boundary

Automated tests use synthetic application directories, fake transports and fake SDK responses. They cover fresh/legacy installs, persistence/restart, corrupt schema, stale save, three locales, unsaved rotation, transport abort, late catalog/favorite/cache rejection, task cancellation, retained data and local/LAN/WebDAV independence. The shared JVM test specifically blocks a fake SDK request and proves revoke closes it without waiting on the request monitor.

Windows-host Robolectric cannot reproduce Android 12+ AtomicFile POSIX replacement using Windows `File.renameTo`. Persistence/activity cases therefore run with SDK28 on Windows and SDK28/35 on Linux CI. Windows SDK35 skips are reported explicitly; Linux CI must execute them before package acceptance. Reader cache/transport/pure-policy tests are not skipped for that limitation.

Dev versionCode advances 64 → 65 with the existing package ID and fixed CI signing certificate. Signature continuity is not a physical install test. Desktop schema/module contracts, compiled source manifest and stable OTA are unchanged by NEXT-50; shared JVM changes still require current Windows packaging/upgrade gates. Exact source SHA, CI results, installable hashes and applicable-platform counts belong in the immutable final handoff, not in a provisional PASS claim here.

## Still pending

Real phone touch/OEM/background behavior, real Pica/E-H/JM sessions and pagination, SAF output behavior, cross-device/offline user acceptance, dynamic trusted extension hosting, Android direct folder/archive import, and the remaining recommendation/tag/gesture module boundaries remain open. No main merge, tag, Release, production data access or automatic deployment is part of this candidate.
