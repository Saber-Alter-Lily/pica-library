# S3 source-free local Android emulator acceptance — 2026-10-30

This is a single **focused real-emulator check** of the existing, isolated
`:local-app` using Android 35, original Android reader and shelf/history
storage. It uses the same `reactivecircus/android-emulator-runner@v2` and
Gradle 8.9 already used elsewhere in this repository. No new test framework,
service or production dependency is installed.

## Real user actions checked

On a fresh disposable emulator, create original PNG pages/CBZ and folder
fixtures, place them under the emulator's public Downloads directory, then:
1. Launch the distinct `com.picalibrary.android.localcore.qa` APK.
2. Import a CBZ through the system SAF picker; inspect the original committed
   local manifest and confirm four pages and the imported book's identity.
3. Create a shelf, add the actual imported comic, then open the original Reader.
4. Advance an actual decoded page and inspect original JSON v1 session history.
5. Force-stop/relaunch; open History and resume the same chapter/page.
6. Remove shelf membership and confirm the original JSON v2 tombstone without
   deleting the previously imported comic or the user-selected original fixture.
7. Import a normal folder through the system SAF tree picker, verify a second
   original local comic manifest.

Use only Android's UI hierarchy, `adb shell input`, screenshots, `run-as` and
standard Python 3 modules. There are no real accounts, network connections to
providers, encrypted credentials or read/write access to the signed v0.5.0 app.

## Acceptance and limits

This workflow runs once for the PR's relevant changes. Reports are uploaded
only as short-lived screenshots, native XML trees, original app ledger checks
and a results JSON, including failures. A screenshot is **evidence to inspect**,
not a visual-quality acceptance by itself; a passed emulator is **not** proof of
physical-device stability or a user-data migration. The pre-existing APK DEX
source closure check remains authoritative for the source-free binary.

CI cannot establish G1 real handset acceptance, signing/upgrade compatibility
or G3/G4 release approval. Keep the workflow Draft-only and never promote
fixtures or this QA APK to a formal Release.

## First actual emulator finding

Run [41170950196](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41170950196) reached the Android system SAF picker and selected the CBZ. The existing LocalComicStore rejected the Android platform app-data alias with `Import failed: Unsafe owned comic path`. No comic was imported and later scenarios were not executed. The failure screenshots, UI XML and exact log are retained in the Actions artifact. The follow-up code change fixes only the root/descendant path comparison and symlink-safe cleanup, then reruns the **same real emulator** flow; do not mark this run as PASS.

## Second emulator result and non-product test correction

The rerun [41171406333](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41171406333) **successfully selected and imported the actual CBZ** after the app-owned Android path-alias fix. Android accessibility evidence confirms `Imported comics:1` plus `S3-QA-Comic / 4 pages`; the original previous import failure is absent. The script then falsely failed because it waited for a transient `Import complete` status that is immediately replaced by the normal persistent library count.

The check now waits for the **persisted four-page library row** and reads the actual original manifest. Its folder check likewise waits for a stable two-page library row, while native Reader page checks can reveal chrome when the original auto-hide operates normally. This is a test script correction, not a change to correct production UI behavior. Shelf, Reader, history, restart and folder stages were **not yet run** in that failed attempt.
