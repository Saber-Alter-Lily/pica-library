# P0-R1 / CORE-02 — explicit optional translation load

Date: 2026-10-26. Local source229330e85657f6fdee54d5ec5620c91330b74ccb, after documentation baseline c9a9926. Unpublished; no Windows/Android build, deployment, version/signature/OTA change or production-profile access.

## Reproduced defect, not a guessed cloud attribution

The complete original web/v040-parity.js was executed in an inert VM with explicit DOM/fetch ports, replacing only its locale import. Original source SHA25624ee1bb991ccc2985a59642aea9d2afa6f8b8832a05e3911c227f8ac49e7b8a4 attempted four GitHub translation requests at ordinary boot: sha + db.text.json, twice. A language rebuild added two further requests. The two no-network regressions actually failed (31other cases PASS). Raw output is retained.

This proves a shipped idle-network defect and is consistent with the4/16 blocked-event counts in frozen run40305007546. It does not retroactively prove the destinations of that Windows run: its old event recording omitted targets/protocols. All six old FAIL results stay FAIL. No unmodified cloud rerun or whitelist relaxation is a fix.

## Narrow behavior correction

- Boot, language rebuild and provider dropdown changes no longer initiate translation or capability requests.
- E-H/ExH's existing advanced filters have a labeled optional GitHub translation action with localized loading/error/status text. Original canonical tags work without it.
- A click checks the existing passive capabilities/source-policy snapshot. Unknown/malformed/disabled policies fail closed and do not enable a source or try saved credentials.
- Only the exact existing public dictionary endpoints are requested, with credentials omitted, no referrer and redirects refused. No new proxy, SDK, taxonomy import or dependency.
- One single-flight load has a10second total bound. Source-choice events or switching away cancel it. Aborted/older results cannot publish over new results; parsed maps are committed together only after the active-task check. Failures retry only after another explicit action.
- Loaded translations remain a public in-memory display/suggestion sidecar, not platform facts, private tags, credentials or recommendation inputs. Cached public translations need not be deleted when disabling a source.

The source event is local to the current document. Cross-window instantaneous revocation is not established by these tests; source lifecycle case SRC-07 remains open. This slice is not a claim that every optional frontend network path or every application page is now quiet.

## Cloud evidence improvement

The existing actual Windows gate still aborts all nonloopback requests and requires an empty blocked-request list. Its new classifier emits only fixed protocol/resource-type/category enums, including the two known translation endpoint categories. It never emits raw URL, hostname, path, query, fragment, userinfo or headers. Unknown/sensitive URLs remain unclassified and blocked.

The bounded classifier is tested locally, but its real Playwright route and new Windows build have not executed. A later authorized exact-source run must establish actual application boot and all six transactions, without borrowing old source/package checks or replacing old-helper evidence.

## Evidence

Local folder: _validation/source-idle-attribution-20261026 (not part of public Git source).

| Check | Actual result / limit |
| --- | --- |
| unit-1 | Infrastructure failure before tests: sandbox denied esbuild parent-directory reads; retained, not a product test |
| unit-2 original-source counterexample |31PASS /2FAIL /0skip; exact four/six inert fetch attempts captured; no real I/O |
| unit-3 fixed-source selection |54PASS /0FAIL /0skip across4files;23new translation/attribution cases plus existing parity/source/gate cases |
| types-1 | Full tsc noEmit with incremental disabled PASS |
| web-1 |54/54 Web modules syntax PASS |
| Runtime guard | All five phases report0real I/O boundary events; no Java/application/browser/TCP listener or production data |
| Actual Windows/Android / provider/device | NOT RUN for this local source; no new installable candidate |

The tests execute the whole shipped module for ordinary boot, language rebuild, explicit EH/ExH permission, disabled/invalid policy, duplicate clicks, timeout, source/dropdown revocation, late result replacement, failure/retry and classification redaction. They are inert DOM tests, not physical browser UI or touch evidence.

PRE_HANDOFF_CLEANUP: one committed source/test set and this contract are retained. Compact red/green/type/syntax receipts, boundary audits and their small logs have audit/reproduction roles; pre-existing caches, failed evidence, frozen packages and research are not deleted or relabeled. No new installable or redundant full-source ZIP was generated.

## Remaining gates / next action

P0-R1 is LOCAL_DEFECT_FIXED / ACTUAL_CLOUD_ATTRIBUTION_PENDING, not DONE. This is the first evidence-backed product correction for the shared idle-network condition; earlier workflow/readiness-oracle failures have different causes. Maximum two correction cycles still applies.

While real cloud execution remains unrequested here, continue P0-R2's bounded old-controller transition analysis using read-only source and pure simulations. Legacy v0.5.0 launch/health recovery stays HOLD; source search/download/native integration, real user/gesture/sync acceptance and the full product goal remain open.
