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

## Third run: durable CBZ import accepted; shelf dialog locator corrected

Run [41171776774](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41171776774) actually completed system SAF selection, confirmed the original CBZ staging/commit and read `local-comics-v1` manifest with four pages (**PASS**). The flow subsequently tapped the **"Create shelf" title** instead of the **"CREATE" button**, leaving the dialog open. The failure screenshot/UI hierarchy exposed title, entered `QA_Shelf`, CANCEL and CREATE. No shelf was created, so no later Reader/history/folder claim is made.

The runner now selects the exact positive button by widget type and waits for the committed shelf-list row `QA_Shelf · 0` before opening it; other dialog-positive actions use exact matching. This changes *only the ADB UI driver*, not application code or the verified schema.

## Fifth run: actual CBZ → shelf → Reader → history/restart accepted

Run [41172161597](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41172161597) on Android 35 produced the following **real, successful** stages:
- System SAF CBZ picker; the original LocalComicStore committed **four pages** in two chapters.
- Original `ShelfLedger` create/add membership, verified against the real schema-2 JSON.
- Opened the original `ViewPager2` Reader from the shelf, displayed real PNG images, navigated from page 1 to page 2, and verified the original history/page JSON.
- Forced app stop, relaunched, opened real History UI and resumed the **same chapter/page 2**.

Next, the emulator's legitimate **first-use immersive fullscreen education** (`Viewing full screen / To exit, swipe down / Got it`) appeared above the app during navigation back to the library. This interrupted only the test driver: it intercepted Back and hid the expected Shelves button. The driver now dismisses the *system* education panel and verifies return to the actual library before continuing. No production UI changes. Membership tombstones and normal-folder SAF import **were not executed** on this run, and remain unaccepted.

## Sixth run: original shelf removal and retained file accepted; folder picker navigation pending

Run [41172551035](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41172551035) completed the original CBZ four-page manifest, real shelf create/add, Reader next page, session history, force-stop and page-2 resume again. It then successfully dismissed the **Android OS fullscreen education**, navigated back into the local shelf, long-pressed the entry, pressed REMOVE, verified the **original schema-2 deletion tombstone** and proved the imported comic still exists. All of those are genuine operation PASSES, backed by real app-private storage checks.

The remaining failure was UI driver navigation in the Android 35 `ACTION_OPEN_DOCUMENT_TREE` picker: the root called its storage directory `Download` (singular) rather than `Downloads`. The fixture folder remained beneath this visible Download root, but the script did not enter it; no claim is made about successful folder import. The only correction is to accept Android's actual `Download` directory label before selecting the QA folder. The app, storage, SAF permission model and existing assertions are unchanged.

## Seventh run: only Android SAF permission confirmation remains

On [run 41173063767](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41173063767), the real emulator passed CBZ import, shelf create/add, ViewPager2 image turn, history and force-stop page resume, and shelf removal tombstone with original comic preserved. The Android 35 folder chooser navigated into the real `Download/S3-QA-Folder` and tapped `USE THIS FOLDER`. The system then displayed its native SAF **ALLOW** permission dialog. The script mistakenly tapped the permission dialog's headline (which contains `Allow ...`) instead of its exact positive Button, so consent was never sent and folder import did not run.

Fix only the `adb` driver: select the exact `ALLOW` control with widget class Button, re-run the original unchanged `LocalComicStore` folder path and check the committed 2-page manifest. No modification to Android provider permissions, user data, or application code. Do not claim this failed run is a full emulator PASS.

## Post-acceptance Reader localization correction

The actual screenshot montage from successful S3 run [41180735910](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41180735910) showed a real functional PASS but an **English UI with Chinese Reader controls**. The next focused candidate uses the already installed Android resource localization system in `:reader-view`, with the same source-neutral original Reader for both apps, rather than a duplicated translation table or a second screen. There are 42 groups of zh/en/ja strings for actual navigation, page counters, options and failures. The existing Android 35 real-emulator flow now requires the native English **Next** button while repeating the original CBZ/shelf/history/restart/folder flow. No statement of final full-phone G1 visual approval is made on the basis of this single emulator scenario.

## Android 35 immersive education timing after native Reader i18n

The first narrowed-label rerun on head `9d68f0b` had a genuine Android system first-use fullscreen tutorial above the original Reader at the point where the test expected a native English Next control. The existing source-free APK build and original Reader stayed unchanged. The UI tree contained the system text `Viewing full screen / Got it`, not the Reader's buttons. The existing ADB flow now dismisses this system overlay at Reader entry and snapshots both native `Settings` and `Next` from one hierarchy pass (avoiding original Reader chrome auto-hide between two polls). It does not suppress the system UI in the app, bypass user consent or claim the failed run is an i18n PASS.
