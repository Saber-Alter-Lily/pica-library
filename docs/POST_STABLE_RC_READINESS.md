# Post-stable isolated RC readiness

Task: **NEXT-33**. Baseline: main `095d6910c34e00824e03b08a30af0ce4e708137e`, after published v0.5.0 and PR #198's reconnect fix.

This pipeline produces unpublished test applications, not a release or a performance certification. Stable v0.5.0, Android v55, tags, OTA and production data remain unchanged.

## Read the evidence level first

| Result | Meaning | Does not establish |
| --- | --- | --- |
| `CONTRACT_ONLY_NO_INSTALLABLE_ARTIFACTS` | PR checks passed; package jobs intentionally skipped | A Windows ZIP or APK exists |
| `INSTALLABLE_ARTIFACTS_READY_MANUAL_QA_PENDING` | Both trusted packaging jobs passed and uploaded their artifacts | Physical-device or performance acceptance |
| `FAILED_OR_INCOMPLETE` | A required job failed, was cancelled or was skipped unexpectedly | Permission to use an older artifact as the new candidate |

Read `RC_STATUS.json` together with the exact run's Windows/Android artifacts, `SOURCE_SHA.txt`, `VERSION.txt` and SHA-256 files. Status is derived from job completion, including upload success; it is not an independent download re-verification. All artifacts retain the repository's one-day retention policy. Expired artifacts require a fresh trusted run, not a release upload.

## Build authority

- Workflow: `.github/workflows/post-stable-rc-packages.yml`.
- Pull requests run non-secret contracts only. The exact task branch or an explicit trusted manual dispatch builds installables. The workflow has only `contents: read`.
- Candidate version: `0.5.0-postrc.<12-char-source-sha>`; repository version and Android defaults are not bumped.
- Windows pins the public v0.5.0 full package at SHA-256 `14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf` before reusing its launcher baseline.
- The RC builder checks provenance against checked-out HEAD and restores temporary `package.json` changes in `finally`.
- If the stable baseline changes, review and update this workflow and its pins deliberately; do not select an unverified latest package dynamically.

## Windows — keep all existing data untouched

Artifact: `Pica-Library-Post-Stable-RC-Windows-x64.zip`.

The launcher forces a new data root:

```text
%LOCALAPPDATA%\Pica Library Post Stable RC
```

It does not reuse either `%LOCALAPPDATA%\Pica Library` or `%LOCALAPPDATA%\Pica Library P2 RC`. Historical P2 databases may contain development-only migration history; there is no reason to copy them into this packaging/reconnect test. No installation or user-data migration is performed by creating the artifact.

For authorized manual testing, extract the complete ZIP into a separate application directory and launch only its `Pica Library.exe`. Do not overwrite the stable application, copy databases/config/credentials, or manually run bundled entries with a production data root. Windows SmartScreen may report an unsigned application.

Automated package checks use a random temporary `LOCALAPPDATA`, fake configuration and test database. They exercise startup, setup persistence, port collision and full application replacement from public v0.5.0. They are not a stable-to-RC in-product update bypass, and do not establish behavior with the user's live library.

## Android — side-by-side, not formal OTA

- Package: `com.picalibrary.android.dev` / **Pica Library Dev**.
- Ephemeral name: `0.5.0-postrc.<sha>-dev-pr35`; versionCode **55**.
- Expected signer SHA-256: `64fb87dc7d8bd6bc7b2cec92cc8c83fad3afe8cfb07591a2e53d53cbd3ab2f9d`.
- CI verifies signer, package ID, version and label before upload. Signing material is confined to a short-lived runner directory and never included in artifacts.
- The formal `com.picalibrary.android` app is not replaced. Existing Dev data may be reused only by Android's normal compatible update; do not uninstall to work around a signature mismatch or a higher installed versionCode. Stop and report the exact incompatibility.
- Android unit/lint/APK verification is not physical-device acceptance. This lane does not add a new Android feature.

## Reconnect validation

The real-Chromium regression executes the shipped `update-reconnect.js` with controlled network responses. It covers startup HTTP 503, stability-window reset after a transient shell failure, expected-version mismatch, invalid HTML and network loss. It must not reload on failed probes.

This does not claim an end-to-end physical Windows update. The separate temporary full-replacement check verifies package startup and test-data preservation. Manual follow-up must still check the visible update page after restart, browser cache/port behavior and meaningful error recovery. Do not update a production installation just to obtain this evidence.

## Remaining project gates

Local preflight on 2026-10-06 (Windows, Node 24.15.0, isolated source checkout):

- TypeScript and Web syntax: PASS (37 Web modules).
- Vitest: 225 files PASS, 1211 tests PASS, 1 existing skip.
- Real Chromium / Playwright 1.63.0: 27 tests PASS, including 4 new reconnect cases; loopback static fixtures and a fresh browser profile only.
- Application bundle and both legacy/post-stable C# launcher variants: build PASS.
- Both changed PowerShell scripts: syntax parse PASS; package execution is a separate trusted CI gate.

These results do not claim the new Windows/Android artifacts have already been built. Consult the exact candidate workflow run and its `RC_STATUS.json` for that result.

K1 Windows, K2 Android, K3 real download/Reader, K4 Windows/manual and Android/OEM, J7B real Provider, J10 real Visual and low-end Windows CPU/jank traces remain pending until representative evidence is collected and reconciled. Their harnesses already exist; building this RC does not supply their results.

H2B threshold decisions, C3/G20 resource enforcement, P4 platform promotion and later Remote Web stages remain outside this change. See `DEVELOPMENT_TASK_LOG.md` NEXT-33–35 for the current queue and new issues.
