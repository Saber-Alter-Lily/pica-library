# P2 Unpublished RC Test Packages

Status: **SOURCE/ARTIFACT_ACCEPTED — PR #195 / final-head validation pending / stable release unchanged**

## Purpose

This stage turns the post-v0.4.11 P2 runtime-hardening branch into installable
manual-QA candidates without publishing another stable release.

The public stable channel remains **v0.4.11**. The repository package version is
not bumped by this work.

Candidate artifacts use an ephemeral build identity derived from the source
commit:

`0.4.11-p2rc.<12-char-source-sha>`

This identifies the exact test build without reserving or claiming a future
stable version such as v0.4.12.

## Windows candidate

Artifact:

`Pica-Library-P2-RC-Windows-x64.zip`

The authoritative stable `scripts/build-windows-package.ps1` remains unchanged.

The dedicated `scripts/build-windows-rc-package.ps1` first exercises that
normal v0.4.11 full-package path against the checksum-pinned official v0.4.10
baseline. It then unpacks the resulting application tree in an isolated
temporary directory, temporarily injects the strict commit-derived RC version
only while rebuilding the bundled JavaScript, restores `package.json` in a
`finally` block, and replaces only the bundled application JavaScript plus the
launcher needed for the isolated RC.

The package uses `RcLauncher.cs`, which sets:

- `PICA_LIBRARY_DESKTOP_HOME=%LOCALAPPDATA%\Pica Library P2 RC`;
- `PICA_LIBRARY_TEST_BUILD=p2-unpublished-rc`.

Therefore the default RC run does **not** read or migrate the stable
`%LOCALAPPDATA%\Pica Library` data root.

The existing Windows artifact smoke is reused with an explicit expected version
and Desktop home name. It still verifies startup, clean setup, Registry runtime
assets, recommendation preparation, UI contracts, encrypted credential
persistence, relaunch, single-instance behavior and bounded shutdown.

## Android candidate

Artifact:

`Pica-Library-P2-RC-Android-SideBySide.apk`

The Android RC intentionally uses the existing debug/manual-QA identity:

`com.picalibrary.android.dev`

It therefore installs beside the formal `com.picalibrary.android` application
and uses separate app data.

The workflow reuses the existing fixed QA signing material and verifies the
certificate SHA-256 already used by the repository candidate pipeline. This
allows later P2 RC builds to replace the same side-by-side QA package without
changing the formal production package.

The Android candidate is not a Release APK and is not connected to formal OTA.

## Why stable v0.4.11 is not updated directly to this RC

The updater deliberately rejects `local-test` packages when the installed
application is stable. Stable incremental packages are additionally required to
be backed by a published, non-prerelease GitHub Release.

The RC pipeline does not weaken either rule.

There is also a schema boundary:

- public v0.4.11: app API 2 / database schema 13;
- current P2 development: database schema 16.

The released-baseline registry now explicitly records v0.4.11 as schema 13.
The existing compatibility classifier therefore judges 13 → 16 as:

`FULL_APPLICATION / SCHEMA_JUMP`

A future formal release must use the full-application migration/rollback gate
rather than silently producing a normal v0.4.11 incremental package.

## CI / publication boundary

`.github/workflows/p2-unpublished-rc-packages.yml`:

- uses `contents: read` only;
- never creates a GitHub Release;
- never creates or moves a tag;
- never writes the `android-preview` channel;
- uploads one-day GitHub Actions artifacts only;
- runs the static RC contract on pull requests;
- builds installable RC artifacts only on the dedicated RC branch or explicit
  workflow dispatch.

## Automated acceptance before final-head write

Implementation head `7a66d02d1523cf4c603c4850b28e3b96aced63ef`
passed both required acceptance planes before this documentation write:

- PR validation: **25/25** triggered workflows passed with zero failures,
  including normal CI, v0.4 direct-upgrade acceptance, P2-L, Desktop J3–J11
  regression harnesses, Android durable recovery, Macrobenchmark build and
  experimental platform package gates;
- dedicated branch-push RC run `36275848212`: **3/3** jobs passed:
  `contract`, `windows-rc`, and `android-rc`.

The branch-push run produced one-day manual-QA artifacts:

- Windows artifact id `10916927763`,
  `Pica-Library-P2-RC-Windows`, 36,063,197 bytes;
- Android artifact id `10917522055`,
  `Pica-Library-P2-RC-Android`, 4,110,039 bytes.

The Windows job exercised the full repository test suite on a Windows host,
which exposed and then fixed host-dependent POSIX path simulation in
`defaultDesktopRoot` and macOS managed-browser discovery. The POSIX chmod
token-file test is now explicitly skipped on Windows because Windows does not
provide the Unix permission-bit semantics that test is designed to validate.

This acceptance proves the RC build/source contract and that installable
candidate artifacts can be produced from the exact source head. It does not
replace representative human/physical-device evidence. The documentation head
created by this acceptance write must again pass both the full PR matrix and
the branch-push RC package run before PR #195 is merged.

## Intended manual test scope

Once the candidate build passes its workflow and the normal repository gates,
manual QA may cover:

- Windows Library / Online / Recommendation / Settings / Reader;
- long-task visibility and foreground responsiveness;
- download, recommendation, Visual and WebDAV user flows where configured;
- pairing and cross-client synchronization;
- Android Library / Online / Recommendation / Reader;
- Android Task Center and foreground/background transitions;
- ordinary UI/layout/localization/onboarding regression.

These are RC/manual-QA observations. They do not replace P2-K representative
hardware measurements, K2/K3 physical Macrobenchmark evidence, K4 human
acceptance artifacts, J7B real Provider evidence, J10 real-model evidence or
the low-end Windows trace.

## Separate migration acceptance

Testing the real stable data root remains a separate, explicit operation.

Before any candidate is run against the stable Windows data root, the migration
acceptance must:

1. identify the exact stable application/data baseline;
2. take a recoverable data snapshot;
3. verify the normal pre-migration database backup;
4. start the candidate and validate migrated state;
5. validate candidate-only state separately;
6. restore the pre-candidate snapshot and matching stable application if
   rollback is required.

The isolated RC package is the default because broad feature testing should not
need to risk the user's stable data.
