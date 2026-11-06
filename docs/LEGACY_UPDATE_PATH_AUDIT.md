# Pinned legacy update paths — compatibility audit, not an upgrade fix

## Scope and authority — 2026-10-25

Independent local branch `codex/reader-legacy-update-path-audit-20261025`, parent `749d50fc3de9716600f8cc896a57f9a25e07f515`. The human's standing isolated-local exception applies after context/claim again returned `NOT_FOUND`. No cloud/push approval is inferred from automatic continuation. PR210/Dev86, prior sealed source-review ZIPs, installed applications, formal profiles/schema and OTA remain untouched. No real Java/application/browser/listener, provider request or process replacement runs locally.

**Audit reproduction: PASS. Released-client safe first-hop recovery: HOLD / NOT ACCEPTED. New installable/real browser/HTTP/replacement CI: NOT RUN. Full modular-reader goal: OPEN.**

This is a fixed-release code-level investigation of a possible escape from the [old full-helper launch defect](OLD_CLIENT_FIRST_HOP_GATE.md): would an incremental bridge avoid it? It does not test every historical client or prove recovery for every failure class.

## Authoritative bytes

The archive must match the already pinned public v0.5.0 ZIP SHA-256 `14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf`, source `bec7f9f31828e8c57e0a2c103b6b1206c22c37cf`. Different bytes fail before ZIP parsing/evaluation. There is no live latest-release claim or download.

| Entry | SHA-256 |
| --- | --- |
| `app/desktop.js` | `3866280efae561b85a3b90f57636d53214fbbd64df9a59bbde63900dedc082da` |
| `app/full-upgrader.js` | `06825e73e99f78dabf7357a14a0fe4c77d32fd4e32a41e7505cac965e7430066` |
| `app/updater.js` | `daee49a07795b985820e9bf1cf53050b256026bd2feff3a1d4573348ba896dfa` |
| `app/path-safety-ZJYXxRQU.js` | `1f9713af1ea07b62b9613e5a26aba4dbe1f67c5ca24e90872e6676a8256ac9df` |

`scripts/audit-released-upgrade-paths.mjs` AST-extracts the exact compiled launch functions and controller `apply` / `preparePersistentUpgradeAssistant` methods. Function/method hashes are recorded. It does not rebuild, alter or execute the whole application/helper. Node VM is used only for this trusted pinned code with synthetic ports: **not an untrusted-source/plugin security sandbox**.

## Verified observations and what they mean

| Path | Inert observation | What is not established |
| --- | --- | --- |
| Old incremental → packaged launcher | No startup Promise, zero child `error` listeners; later EACCES escapes the extracted function | Installed rollback or actual process exit |
| Old incremental → Node fallback | Same missing asynchronous error contract | A fallback that avoids this failure |
| Old full application → launcher | Same pinned prior counterexample | That a new target helper repairs the running old helper |
| Old controller → full helper | Exact registration copies installed old helper to persistent/bootstrap paths; staged new helper is never read; immediate `accepted` before child startup | Actual Desktop global-handler behavior or live handoff/recovery |
| Old controller → incremental helper | Uses installed `app/updater.js`, not a staged replacement; immediate `accepted` before child startup | A safe incremental bridge or ready acknowledgement |

The incremental helper's only application import is the pinned path-safety chunk; that chunk imports only `node:path`. The two helpers and this chunk declare no inspected uncaught-exception event hooks or `setUncaughtExceptionCaptureCallback`. No user-installed preload/third-party guardian is assumed. Earlier inspection of the pinned Launcher C# source also found immediate return after Node startup, not an exit-monitor/guardian; that remains source inspection, not launcher-binary execution.

A separate exact-old path-guard observation finds canonical executing-helper self-replacement blocked but a case variant not blocked by its case-sensitive comparison. This is **not a supported transition or a proposed fix**. Never exploit a case/path variant to replace the running updater. Current source already uses a case-insensitive guard; the added regression preserves that rule. Official origin/hash restrictions remain necessary and are not bypassed. No package implementing such a workaround is produced.

Therefore neither "ship a new full helper in the target" nor "first do a normal delta" is established as a safe solution to the old first-hop asynchronous-launch error. Successful current-source helper tests cannot close this hold. This is evidence against those specific proposed escapes, not a proof that no future supported compatibility mechanism can exist.

## Local evidence

- Selected **368/368 Vitest cases, 33 files, 0 skips**, including unchanged current composition/update/reader/source-boundary regressions. Counts are test cases, not individual `expect` calls.
- Strict types PASS after adding the audit MJS's precise `.d.mts` declaration. The initial missing-declaration failure is retained; no `any` waiver, TS-ignore or config weakening.
- Web syntax **54/54 PASS**; no Web product file changes in this slice.
- Final actual fixed-byte audit and test/type/Web phases exited 0 with zero guarded boundary events. VM files are an in-memory Map and children are EventEmitters; runner output is written only to the isolated evidence directory.
- No production `src`, `web`, native, schema, dependency, workflow or application-version changes relative to parent. No formal profile was opened; this is not a production DB hash audit.

The audit's success/exit code 0 means **the old defects and helper selection were reproduced faithfully**, not that old upgrades passed. Its status is explicitly `VERIFIED_LEGACY_BOTH_PATH_COUNTEREXAMPLES_NOT_UPGRADE_PASS`.

## Next decision and verification

The existing separately authorized cloud boundary remains necessary: new Draft/Actions permission, exact-head core/JM/browser/HTTP/package tests and the real pinned-old-controller four-scenario gate. Keep the launch-failure scenario, helper identities, official provenance, state canaries and failures intact. Do not swap in a modern helper, relabel the audit as an installed test, or increase timeouts to obtain green.

If actual old-client execution confirms that its normal route cannot safely recover, a supported legacy compatibility/recovery transition needs a separately reviewed design and explicit user authority. No such bootstrap is implemented here. Manual unzip is not silently accepted as satisfying the user's one-action upgrade goal. Current-source forward safety and historical first-hop acceptance remain separate open requirements; no release or user issue is closed by this audit.
