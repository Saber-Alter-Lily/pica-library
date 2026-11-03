# R4 | v0.5.0 Windows profile preservation in existing full updater (Draft)

**Status:** implemented in Draft PR #284; synthetic smoke check passed, exact-HEAD GitHub Actions and physical/user acceptance must be checked separately. No production user data was read or changed.

## Reused product path

The existing stopped-app full-application helper, not a new updater or backup framework, creates and restores the same recovery snapshot. It uses built-in Node fs and crypto and the original config/SQLite storage paths.

## Functional behavior

- New snapshot receipt schema v3 records SHA-256 and byte size for every backed-up regular file. Scope: Desktop config (including opaque credentials and source settings), SQLite library.db/-wal/-shm, saved `packs` (e.g. style/profile assets), and `runtime-state/personalization`. No credential content is written into the receipt or output.
- Snapshot generation compares originals before and after the copy with the saved snapshot; any mismatch prevents application replacement. Recovery verifies all retained v3 file bytes and directory presence **before deleting any current state**, then verifies the restored files.
- Existing receipt schemas v1 and v2 remain restorable without retroactively claiming v3 guarantees or deleting directories not included in those historical backups.
- **Not included in duplicate backup:** manga page bodies, potentially external download folders, regenerated cache, logs, independent upgrade assistant and installed application payload. The updater does not intentionally mutate comic pages; R4 must separately compare their identities across upgrades.
- Symlinks or non-regular entries within the backed-up directories fail closed. A failure retains the recovery snapshot and does not authorize overwrite of the installed application.

## Engineering evidence and next gates

- Focused Vitest: `pnpm exec vitest run test/unit/user-state-snapshot.test.ts`. Round-trip config/SQLite/WAL/packs/personalization and untouched manga bodies; altered/missing SQLite and pack data rejected before destructive recovery; schema-v1/v2 retained compatibility.
- A disposable-data Node smoke executed the v3 round-trip and altered-snapshot refusal. The existing full-upgrade test, actual Windows ZIP unpack/launch, synthetic v0.5.0 full replacement and injected-health-failure rollback remain required at the exact new commit SHA.
- OPEN G3: real v0.5.0 read-only data inventory, permitted one-time backup, cross-version schema/metadata/content comparison, external libraries, physical Windows rollback, Android same-application-ID and real signing continuity. G1 real UI/1500-book performance, G2 verified multi-provider and G4 authorized signed release remain OPEN.

**Release boundary:** Keep main, stable v0.5.0, Android production identity/signature, OTA, and real profiles unchanged until user-approved release acceptance.

## R4 Android: original clean-app in-place install evidence (2026-11-03)

The existing `s3-android-local-emulator` Android 35 flow is extended, not replaced. It now builds **two** actual original four-tab physically source-neutral APKs from the same app code at `versionCode=55` and `56`, keeps both outside Gradle output, and checks package ID `com.picalibrary.android.cleanqa` plus matching signing certificate before installation. No alternate Reader, data store, plugin host, test framework or application ID is introduced.

After the established real system-SAF local CBZ import, original Reader progress, official Suwayomi built-in local-source Binder-to-original-product chapter import, and Host stop/offline playback, this flow snapshots **the app's actual private** local-book manifests, saved PNG SHA-256 digests, `reading-history-v1.json`, and first-use disclaimer preference. It then performs `adb install -r` of the newer matching-cert APK with no uninstall, no clear-data, and no downgrade, verifies `versionCode=56`, compares original data/bytes, force-stops/relaunches the original four-tab Home, and reopens the already saved Host-imported offline chapter. Results include synthetic-only SHA/count evidence and screenshots in the existing emulator artifact.

**Boundaries:** This is an in-place upgrade proof only for the isolated `.cleanqa` identity with QA signing, not a real `com.picalibrary.android` production-signature v0.5.0 update, not actual user data, and not device/OEM manual acceptance. The Android35 push workflow must actually finish SUCCESS at the exact change HEAD before this evidence can be considered verified. If it fails, preserve screenshots/logs and fix the actual blocker instead of waiving the scenario.

The Windows R4 v3 SHA-256 profile backup, preserved style packs and personalization, exact v0.5.0 ZIP replacement/rollback, and distinct G1 physical / G3 production / G4 release gates remain open as above.

## R4 Windows: actual released v0.5.0 forced-health-failure rollback gate

The existing `post-stable-rc-packages.yml` Windows job must now execute **two real extracted Windows application cases** using the pinned SHA-256 official v0.5.0 ZIP and the same new-source RC candidate: first normal full replacement, then the existing `test-windows-universal-full-upgrade.ps1 -ForceHealthFailure` on a second, independent temporary Desktop profile. The latter intentionally rejects the new app version during the health check, forcing the real full-upgrader helper to restore the actual old launcher plus config, database, style packs and personalization. A `R4_ROLLBACK_QA.txt` receipt is only staged after both commands succeed.

This reuses the existing Windows launcher, recovery helper, PowerShell scenarios, and GitHub Actions workflow. No arbitrary kill of user processes, no real user profile, and no unapproved stable release. The exact-SHA Windows job must pass; a green contract-only PR run is not upgrade/rollback evidence. Windows completion is still **engineering/synthetic-data verification**, not production-data G3.
