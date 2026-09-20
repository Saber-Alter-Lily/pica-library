# Next Stable Release Readiness — 2026-09-20

Status: PREPARATION_ALLOWED / PUBLICATION_BLOCKED_BY_FINAL_ACCEPTANCE

## Purpose

This checklist distinguishes release preparation from final publication. The current user is still collecting real Windows + Android acceptance feedback, so no tag, main merge, or GitHub Release is authorized by this document.

## Already ready for release preparation

- Recommendation V5/Visual development remains isolated from `main` and current public v0.4.0.
- Desktop and Android recommendation runtimes are independent; current cycle/session state is not force-synchronized.
- Android sync UX is low-friction by default: ordinary portable differences do not show modal alerts, conflict alerts are optional, automatic connection checking is optional, and sync execution remains explicit/manual.
- Multiple preference conflicts can be resolved in bulk (all Desktop / all Android); per-item dialogs are optional.
- Pairing no longer forces favorite, shelf, or recommendation content merges. Account capability state may still refresh because it is non-secret connection metadata.
- Android mobile help buttons use a smaller 24dp visual surface while keeping an expanded touch target.
- Public v0.4.0 Schema 9 -> current migrations have an automated data-preservation regression and pre-migration backup.
- Database schema capability now derives from migration authority, preventing the historical v0.4 stale-schema declaration from recurring.
- Public v0.4.0 Windows/APK assets are checksum-pinned in the upgrade gate.
- Android production package invariant is known: `com.picalibrary.android`, public versionCode 42.
- Source-scoped future update assets are supported by newer clients.
- Recommendation Ecosystem Pack V1 is read-only only; it cannot alter serving.

## Final publication blockers

### R1 — Two-client real acceptance

Required when the user has access to both devices:

- pair current Windows + Android release candidate;
- verify no sync occurs without an explicit user action;
- verify ordinary changes stay quiet with default settings;
- verify conflict reminder can be turned off;
- verify disabling connection-time checks stops automatic comparison prompts;
- create at least one true concurrent explicit-preference conflict;
- verify bulk Desktop / bulk Android resolution and optional per-item resolution;
- verify Session Intent never crosses devices;
- verify current recommendation cycles remain independent.

### R2 — Android signed in-place upgrade

Build the real production RC with:

- package `com.picalibrary.android`;
- versionCode > 42;
- the same production signing identity as public v0.4.0.

Install it over the public v0.4.0 APK without uninstalling and verify local settings/data survive.

### R3 — Windows real v0.4 full-package replacement

On one real public v0.4.0 data home:

- close v0.4;
- replace application files with the next-stable full Windows package;
- keep `%LOCALAPPDATA%\Pica Library` untouched;
- launch next stable;
- verify database migration, DPAPI credentials, library path, favorites, downloads, shelves, history, WebDAV, themes, recommendation events;
- verify migration backup exists.

### R4 — Release packaging decision

For the first incompatible release after v0.4.0:

- do not publish a legacy generic `Pica-Library-v<target>-update.zip` if public v0.4.0 cannot safely consume it;
- publish the full Windows package and checksums;
- future compatible clients may use source-scoped `update-from-v<source>.zip` assets.

### R5 — Final regression/known-issue review

- review Issue #8 large download queue against the RC; it may remain open if not reproducible, but any recurrence of connection starvation is a release blocker;
- review Issue #11 Explicit Preference UX on the RC; feature completeness does not require editing raw semantic-map statistics;
- review release notes for the trusted-LAN Mobile Bridge limitation; no provider secret handoff is allowed.

## Not blockers for the next stable release

- Canonical Work materialization may remain disabled.
- Recommendation V5 may remain shadow/non-promoted if longitudinal quality evidence is still immature.
- LTR / Contextual Bandit / Active Learning remain deferred.
- Ecosystem Packs may remain read-only E2.
- Velopack migration is a later PoC, not part of this release.
- Missing Visual embeddings on upgraded v0.4 users must degrade gracefully and are not a blocker by themselves.

## Preparation work that may proceed now

- freeze a release-candidate branch after current CI is green;
- choose/finalize version number without publishing;
- prepare changelog/release notes;
- prepare Windows full-package workflow and SHA256SUMS;
- prepare production Android versionCode/versionName and signing gate;
- prepare the v0.4 -> next-stable manual acceptance script;
- prepare a short dual-client acceptance checklist for the user;
- close superseded development PRs and keep only the current V5 + release-engineering chain visible.

## Publication rule

Release preparation may start now.

Formal publication requires R1 + R2 + R3 and a clean final CI/release-package run. No recommendation-quality claim is implied unless the separate V5 evaluation/promotion gate is satisfied.
