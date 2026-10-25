# Explicit source admission and passive account observations

This local continuation is based on the frozen PR207 candidate `1b7a9184eca11f73b295a55827d2cddee34dc69c`. It is not in that already-delivered Windows/Dev83 package. No new build, push, install or Release is implied.

## Local-first defaults

`SourceRuntime()` now starts with no external source enabled. The default `LibraryService` and `ProviderService` contexts inherit that rule; injecting an SDK or having environment credentials does not grant source permission. Source access still uses the existing revision/AbortController lease machinery, without a new framework or source protocol.

Desktop continues to pass `sourcePolicyForConfig(config)` explicitly. New local profiles stay source-free; existing configs without the policy field keep their documented pre-policy choices. Explicit saved choices/revisions remain unchanged. This is not permission to log out users or rewrite accounts, content, preferences or data.

The CLI also constructs the source runtime explicitly. Local commands and `serve` default to none. An online invocation must select the adapters it intends to use, for example:

```text
pica-library sync --sources pica
pica-library serve --sources eh,jm
pica-library serve --sources none
```

Choices are invocation-local, not a write to Desktop settings. Missing, empty, repeated, duplicate or unknown selections reject before the CLI opens its database. Existing CLI automation that intentionally uses an online source must add this flag. Credentials alone no longer implicitly enable all three adapters. CLI startup/environment loading and executable behavior are not locally exercised in this phase.

## Passive JM observation is not connection verification

| Action | Actual authority | Worker/network effect |
| --- | --- | --- |
| Open settings / GET status | Allowlisted cached identity, remembered flag, source enabled flag | None |
| Connect / restore sign-in | Existing JM account/status/login implementation, explicitly requested | May start the worker and restore saved login |
| Search/read/import | Existing source-scoped operational permission | Existing bounded source operation |

`JmProvider.accountSnapshot()` returns a fresh allowlisted copy, not the remembered password or an arbitrary worker reply. `verification=CACHED` describes an earlier session result, not a fresh connection/expiry check; `NOT_CHECKED` is distinct from verified login failure. The UI says so in Chinese/English/Japanese. Merely opening the JM section was the old trigger, not ordinary homepage startup.

`POST /api/v1/desktop/sources/jm/connect` accepts an empty object only and stays behind the existing Desktop loopback/origin/CSRF boundary. It cannot enable a disabled source or accept credentials/source choices in the request. An explicit retry may retry remembered login; passive reads never do. The existing pinned JM SDK/worker protocol is reused, not reimplemented. Login/logout, preview-confirm import and local data ownership remain separate.

## Evidence and remaining work

Development checks: 108 assertions across 17 inspected pure/fake-DOM/fake-transport/owned synthetic SQLite suites, strict TypeScript and Web51 syntax passed at the first local commit. The first run retained 68 pass/1 historical hash-guard failure; the reviewed policy default changes the pin, with an inverse old-hash assertion proving the entire original policy text is unchanged except that one constructor default. A later actual guard-expression test reproduced empty-array acceptance (4 pass/1 fail, preserved). The follow-up requires a non-null, non-array empty object and adds null/primitive/field counterexamples; final selected-source target is 109 assertions, recorded separately after sealing.

Historical fixtures had implicitly relied on all adapters being enabled. Fifty fixture/harness files now explicitly request their original enabled context through a test-only helper (92 constructors); this is not production fallback. Existing assertions remain, with the exact benchmark call expectation and JM endpoint shape updated. New default tests deliberately do not use that helper. Actual HTTP CSRF/route tests were extended but not executed locally; no listener/Java/browser/application/provider or production data was used. Full CI, compiled packages, three-language real browser and physical/provider acceptance remain pending. Prior PR207 CI does not validate this new source.

Source/host catalogue identities, arbitrary user-installed extensions/trust, native/sync parity and a fully source-neutral application remain open. This change removes accidental admission and observation side effects; it does not introduce a source marketplace, content catalogue or official external service. No database/schema, lockfile/dependency, Android, recommendation/Visual, updater, stable OTA or existing frozen package change is included.
