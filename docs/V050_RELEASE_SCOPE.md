# v0.5.0 Release Scope — Published

Status: **PUBLISHED** — v0.5.0 / Android v55 published 2026-10-01 04:46:04 UTC from `bec7f9f31828e8c57e0a2c103b6b1206c22c37cf`.

Authority: [v0.5.0 Release](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.5.0) and [successful publish/verification run 36815096800](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/36815096800). The released Windows v0.4.11 → v0.5.0 upgrade, Android v54 → v55 signed install and uploaded assets were checked in that transaction. This is not completion of all platform/performance tracks.

Post-release PR #198's reconnect stabilization is on main but not in these released assets. Its current-baseline candidate path is tracked separately in [POST_STABLE_RC_READINESS.md](POST_STABLE_RC_READINESS.md); do not republish v0.5.0 to include it.

This document separates the **v0.5.0 stable product scope** from the much larger repository backlog. It does not mark unfinished P1/P2/P3/P4/W5/P6 tracks complete.

## Version identity

- Frozen Desktop version: **0.5.0**
- Frozen Android versionCode / versionName: **55 / 0.5.0**
- Public upgrade baseline: **v0.4.11**
- Public v0.4.11 Desktop authority: App API 2 / SQLite schema 13
- v0.5.0 release candidate authority: App API 2 / SQLite schema 14

The minor-version boundary is intentional: the release contains a large post-v0.4.11 product/runtime batch and establishes a durable full-application update contract, while remaining pre-1.0.

## Stable user-facing scope

### Windows / Web

- one primary in-product update action for compatible incremental updates and verified full-application replacement;
- direct source-scoped **v0.4.11 -> v0.5.0** one-click bridge when the final artifact preserves App API 2, schema 13 -> 14 and the legacy updater helper;
- persistent external upgrade assistant under `runtime-state/upgrade-assistant`, with hash-bound runtime/helper metadata;
- automatic Web reconnect/reload after successful replacement;
- application/data-tree separation, pre-migration backup, health verification and automatic rollback;
- E-H connection/login-state feedback and stale local-engine recovery;
- task-oriented Web onboarding;
- simplified Settings/action hierarchy;
- single visible owner for Library display controls;
- support-provider migration to **AZZ / 爱赞助**.

### Android

- bounded quick favorite reconciliation for ordinary recommendation cycles;
- visible Library refresh and same-work checking state;
- authoritative known page count on detail;
- favorite-order sorting;
- shared Library/Shelf long-press multi-selection;
- bottom contextual selection actions instead of hiding core actions in overflow;
- provider-aware batch add/remove/unfavorite operations;
- recommendation author-exposure control across a cycle;
- balanced positive/negative recommendation controls;
- preference editing without unnecessary whole-catalog reload;
- expanded task-oriented onboarding;
- same production package identity and signing lineage, released versionCode 55.

## Internal improvements included in the production source

The release also contains substantial post-v0.4.11 runtime and architecture work that supports stability but is not presented as a separate end-user feature list:

- long-task ownership/progress/control hardening;
- Desktop query/write/cache/observer improvements;
- Android WorkManager/recovery/UI-thread hardening;
- startup/shutdown fault isolation;
- structured runtime diagnostics;
- benchmark/evidence harnesses;
- shared platform capability/data-root abstractions;
- conservative Work Identity/Visual/recommendation foundations already present in production code.

These implementations may ship because they are part of the production source tree. Their broader project tracks remain open where representative evidence, later policy decisions or future product promotion are still required.

## Explicitly not promoted by v0.5.0

The following work remains outside the formal stable-support claim even if supporting code or automated preview packaging exists:

- Linux x64 formal support;
- macOS arm64 formal support;
- Windows ARM64 formal support;
- Server/Docker formal product support;
- Remote Web W5D-W5H authorization/offline/write/multi-user scope;
- P2 production concurrency budgets not yet justified by representative evidence;
- platform signing/reputation/notarization work not already required by the existing Windows/Android channels;
- any unfinished P1/P2/P3/P4/W5/P6 backlog item.

## Windows upgrade contract

Normal path:

```text
public v0.4.11
  -> Web "one-click check & update"
  -> Pica-Library-v0.5.0-update-from-v0.4.11.zip
  -> legacy v0.4.11 updater applies schema 13 -> 14 compatible payload
  -> v0.5.0 starts and registers runtime-state/upgrade-assistant
  -> later incompatible releases may use verified full-application replacement
```

Fallback path:

`Pica-Library-v0.5.0-upgrade-assistant-from-v0.4.11.zip`

The fallback assistant is recovery-only. It must not become the normal instruction for v0.4.11 users if the published source-scoped one-click asset passes final Release verification.

## Required Windows release assets

- `Pica-Library-v0.5.0-windows-x64.zip`
- `Pica-Library-v0.5.0-update-from-v0.4.11.zip`
- `Pica-Library-v0.5.0-upgrade-assistant-from-v0.4.11.zip`
- SHA-256 sums
- build/provenance metadata
- release notes

The full Windows package must contain both:

- `app/updater.js`
- `app/full-upgrader.js`

The v0.4.11 source-scoped incremental package must **not** replace `app/updater.js` and must install `app/full-upgrader.js`.

## Required Android release assets

- production-signed `Pica-Library-Android-v55.apk`
- signer-certificate SHA-256
- Android update metadata
- SHA-256 sums
- build/provenance metadata

The formal APK must preserve:

- package name `com.picalibrary.android`;
- the existing production signing certificate;
- versionCode strictly greater than public v54.

## Completed publication gates

The published transaction completed these gates; retain them as historical release requirements, not open blockers:

1. latest release-intent CI is green;
2. v0.5.0 formal Windows candidate is built from one frozen source SHA;
3. real public-v0.4.11 updater replacement reaches v0.5.0/schema 14 and preserves external user state;
4. the persistent external upgrade assistant is registered and hash-bound after that upgrade;
5. the fallback assistant is generated from the same full candidate and its PowerShell parses successfully;
6. the production-identity Android v55 candidate has the same package/signing identity as v54;
7. release assets and SHA/provenance metadata are internally consistent;
8. no stable Release, `latest`, or Android OTA pointer is changed until uploaded assets are verified.

## Future publication boundary

The unpublished v0.5.0 candidate workflow is artifact-only. It is not authorization to publish.

The v0.5.0 / Android v55 transaction is complete. Later changes need their own explicitly authorized release decision and verified source/artifacts; this reconciliation does not alter the published tag, assets or OTA pointers.
