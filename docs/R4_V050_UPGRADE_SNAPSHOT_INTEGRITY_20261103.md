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

### R4 exact-head failure attribution and narrow correction (2026-11-03)

- Android35 real app accepted the v55→v56 `adb install -r`, verified saved comic images/identities, history and consent, **then failed only at the real versioned onboarding modal** before the post-upgrade Home assertion. The existing test already supports the same `Later` control after other force-stop/restart paths. The new post-upgrade path now taps the genuine on-screen skip button, retaining the guided UX and all data assertions.
- Windows real v0.5.0→RC **normal** replacement passed. The new deliberate failure scenario was blocked before execution by the existing acceptance script's permitted disposable home-name allowlist. Both independent temporary runs can safely use the same *approved* `Pica Library Post Stable RC` profile label, because each script creates its own UUID temp root. The workflow now reuses that name instead of weakening the safety allowlist.
- Failures not reclassified as passes: Android35 #41678556237 FAILED; Windows RC #41679434923 FAILED; next exact-head retries require their own final SUCCESS and package artifacts. No real user profile, production key or official release touched.

## R4 original Android legacy-provider Dev → physically clean original Reader, same package (QA)

This is a second **materially different upgrade journey** in the existing Android 35 user-flow acceptance, not merely a clean→clean versionCode increment. The old original Android `:app:debug` at `com.picalibrary.android.dev` runs with historical provider SDKs and produces its own real local imports, history, original Reader pages and a separate signed Host chapter; these are read from its app-private storage before upgrade.

The new `:app:cleanCompatQa` build type (only when `-PsourceNeutralQa=true`) is based on the already validated physical clean full-product R8 build. It uses the **same `.dev` applicationId** as the old QA app, versionCode 56 instead of 55, and the identical disposable debug signing certificate. The same clean manifest removes the legacy provider screens, and the already existing R8/DEX verification must again report no bundled site SDK. Legacy provider libraries are compile-only for this clean variant. The historical `:app:release` product, stable identity, production signing and normal Debug behavior are not changed.

Using the Android platform's actual `adb install -r` into that existing `.dev` identity, the runner verifies all old local work IDs, raster byte SHA-256, original reading-history JSON, first-use consent and opaque old source-access policy bytes remain unchanged. It restarts the original four-tab Home and reads an already imported Host chapter offline. The old policy remains persisted but is **not activated** by the clean build (`SOURCE_NEUTRAL_QA` disables legacy providers); this does not migrate source credentials into the independent Host.

Both clean→clean and historical-provider→clean upgrades run on one isolated Android35 emulator using the existing actual Android Reader, SAF and Suwayomi pinned upstream tests. Failure of any new step is NOT a pass, and the whole batch still needs exact-head CI and physical hardware signoff. This is only a Dev-signing rehearsal: no `com.picalibrary.android` production data, no actual official v0.5.0 signature continuity, no genuine third-party provider or legal distribution approval.

## R4 signed Host navigation regression before Android legacy-to-clean migration (2026-11-03)

- Exact head `f54a6d73` finished with 29 workflow SUCCESS, 1 intentional SKIP and one Android35 emulator FAILURE. The failure is at the original full app Host-disconnect step **after** the real Suwayomi chapter was already imported with exact bytes and the original `ReaderActivity` opened successfully. The UI hierarchy was still the existing `ExternalImportActivity` ('Save to original Reader', 'Read saved local copy', 'Back'), while the test searched for Host's 'Disconnect'. The later old-provider-to-clean APK test did not run, so it cannot be marked PASS.
- Minimal correction in the **existing emulator journey**, not the product implementation or a new test framework: return once from the original Reader, inspect the currently visible import page, use its real 'Back' button when present, then find and explicitly press Host 'Disconnect' before force-stopping the Host and verifying the original app's offline library. This preserves the user-facing interactive navigation and the mandatory source-revocation check.
- The separate Windows released-v0.5.0 full replacement and injected-health-failure rollback, source-neutral R8/DEX gate and packaged RC acceptance remain previously verified; the Android35 exact new head must be run independently and pass its actual final upgrade steps. Production profile migration, real signer continuity, physical G1 and G4 approval are still OPEN.

## R4 original published Android v0.5.0 signed in-place compatibility gate (2026-11-03)

The previous Android35 emulator at exact source `bfbeb249` [#41751896580](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41751896580) **PASSED** both existing QA transitions: original full clean `.cleanqa` versionCode 55→56, and historical provider-enabled original `.dev` versionCode 55→physically source-neutral original `.dev` 56. The real emulator saved and compared app-private PNG bytes, original book IDs, Reader history, disclaimer and prior opaque source policy. All 29 exact-head checks passed or were intentionally skipped; the v0.4 upgrade retry succeeded.

To advance G3 without touching a real production profile, a **new isolated engineering gate** uses the **actual public** `Pica-Library-Android-v55.apk` from stable Release v0.5.0, pinned to SHA-256 `0bfe382b9026b7942309ac5a1e7cfefc676c0ea3e4e85f288d15d33fead8f598` and public signing-certificate fingerprint `64fb87dc7d8bd6bc7b2cec92cc8c83fad3afe8cfb07591a2e53d53cbd3ab2f9d`. These are verified independently **before** any emulator installation.

The project reuses the exact existing original Android `:app` code and source-neutral R8/DEX gate to configure an unpublished `cleanProductionUpgradeQa` build type (not a new app/reader/data model). It retains the **actual** `com.picalibrary.android` identity, uses a synthetic `versionCode=56`, removes bundled providers and keeps debugging off. Its preview/prod signing material is supplied to a dedicated CI job only from the already-established protected Actions secret, written to a temporary keystore file and deleted after packaging. The signed candidate is **never uploaded**, put in a Release/OTA, or installed outside the one isolated CI emulator.

On Android35, the native **public v0.5.0 non-debuggable UI** creates a synthetic shelf, demonstrates it survives old-app restart, then Android PackageManager executes `adb install -r` to replace the real production **package ID** with the signed source-neutral candidate. It verifies v56 plus the original saved shelf via the original four-tab Home UI after replacement and another offline restart. ADB UI operations are reused from the existing S3 driver. Screenshots, a bounded JSON result and AndroidRuntime logs are the only uploaded artifacts. Unlike the `.dev` debug gate, this test cannot hash the official app's private storage using `run-as`; it proves a genuine visible legacy shelf survived, not a comprehensive private-file diff.

**Acceptance remains conditional on the exact new SHA's real workflow verdict.** This does not inspect a user's actual account/book files; it is not a live-user backup or production Release, and G1 physical experience, G2 licensed real provider, G3 full real profile diff/rollback, and G4 authorization all remain OPEN.
