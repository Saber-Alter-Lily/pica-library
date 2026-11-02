# R1: Windows + Android local-core candidate (2026-11-02)

Status: IMPLEMENTED_IN_DRAFT. Formal product / physical-device acceptance NOT YET VERIFIED. Integration Draft PR #284; production main, v0.5.0, Release and OTA are unchanged.

## One concrete user journey

**Open independent local app > select a folder or CBZ with the OS picker > confirm import > browse/search/sort > add to shelf > open the original Reader > turn pages/change chapter > close/restart > continue at the recorded page.** No provider login, Source Host or network is required.

## Reuse and actual artifacts

| Platform | Candidate and origin | How it is built/verified | State |
| --- | --- | --- | --- |
| Windows x64 | Original Web UI and Reader in source-free portable ZIP, original Windows native Launcher, isolated persistent profile `%LOCALAPPDATA%\Pica Library Local` | Existing `s3-windows-offline-portable-qa.yml` full-web flavor: original code/compiler, official SHA-pinned Node, native Launcher, ZIP extract/launch, imported book, saved page/shelf and restart | Requires current SHA success before PASS |
| Android | `com.picalibrary.android.localcore.qa` debug APK with the original extracted local-core/local-storage/reader-view implementation, not the original provider-enabled full app | Existing `ci.yml` Android build + DEX/manifest check; original `s3-android-local-emulator.yml` on integration push uses real Android 35 SAF, CBZ, shelves, Reader and restart | Requires current SHA success before PASS |

On the integration branch only, and only after the existing Windows ZIP runtime verification succeeds, the full-Web Windows package is retained as a **three-day GitHub Actions QA artifact** named `pica-r1-local-core-windows-x64-<sha>`. The `reader-only` shell remains metadata-only. The existing CI Android source-free QA APK artifact expires after two days. Neither is a signed Release, OTA, or safe upgrade installer.

Find exact-SHA runs from [PR #284 Checks](https://github.com/Saber-Alter-Lily/pica-library/pull/284/checks) or [GitHub Actions](https://github.com/Saber-Alter-Lily/pica-library/actions). Do not substitute artifacts from older PR heads.

## Manual device acceptance (each platform)

1. Use only a small test folder and test CBZ of content you own or are authorized to use. Never select an installed v0.5.0 profile, credentials, or actual customer archives for automated tests.
2. Windows: fully extract the full-web QA ZIP and use `Start-Local-Only-Draft.cmd`; the old `%LOCALAPPDATA%\Pica Library` must not be read or changed. Android: install the separate `Pica Library Local QA` APK, which has its own package ID/private data and no INTERNET permission.
3. Import folder and CBZ through the native picker. Check accurate page/chapter counts and a real visible work item. Cancel a separate pending import; cancelled work must not masquerade as committed.
4. Search by title and change sorting/read-status filtering. Create a shelf and add the imported work, then navigate away and back.
5. Open the actual reader, change chapter, turn to a later page, close it, reopen it. Verify the expected chapter/page without a fresh source discovery.
6. Completely stop and relaunch the app. Check book, shelf and saved reading position still exist. Remove shelf membership without deleting the comic; test explicit local-copy removal separately.
7. Verify no serious overlap/blank screen on a physical Windows 10/11 x64 desktop and a physical Android handset; check standard and larger text, relevant zh/en/ja copies. Log unsupported UX honestly.

Manual record: exact commit, device/OS, PASS/FAIL/NOT_RUN for steps 1–7, short reproduction and screenshots for failures. Android emulator or CI PASS alone does not close G1.

## Explicit limits

- Windows candidate is an unsigned **engineering** full-Web ZIP, not official Windows v0.5.0, and it has no production update/migration or signed provider install.
- Android candidate is a physically source-free **QA** app, not yet the final original-app layout/feature parity. The original Android app already reuses shared local browsing, but original-app visual acceptance and signed transition are separate work.
- G1 physical UI and user approval OPEN; G2 actual signed optional sources / Android Service-Binder / real providers OPEN; G3 actual v0.5.0 old-profile rollback OPEN; G4 formal signed release OPEN.
- OSS first: directly reuse existing Pica Library components, Android platform SAF/AndroidX and current GitHub Actions; Mihon is a design reference only. No new libraries, database, Reader, updater or testing framework.

Next R1 milestone: complete physical Windows/Android use on this candidate; fix grouped user-blocking issues together in #284, then move to R2. Minor internal tidy-ups remain in backlog.
