# S2/S3 | Source-neutral Reader boundary and dependency graph (2026-10-28)

Status: **isolated Draft prototype; NOT a released source/plugin system**.

Base: product recovery PR #218, frozen for this branch at `6e5c1a4a`.
Implementation PR: #219, `codex/s2-source-contract-20261028`.
Formal release `v0.5.0`, `main`, user data, accounts and OTA are unchanged.

## Scope and OSS reuse

- Keep the existing `OnlineReaderService`, its `OnlineReaderSource`, `OnlineReaderContract`, per-source cache fingerprint and ordered progress logic. Do not create another Reader or duplicate its persisted progress schema.
- Use the TypeScript compiler already installed in the project to resolve real imports and detect runtime SCC cycles. Do not introduce a bespoke syntax parser or dependency resolver.
- Reuse Mihon's content-free/opt-in source design idea and Suwayomi's optional source runtime concept as **architecture references only**. Their third-party executable extension mechanism is not incorporated, and this implementation grants no permission to execute downloaded source code.
- Reference: https://mihon.app/docs/faq/browse/extensions ; https://github.com/Suwayomi/Suwayomi-Server

## Implemented boundary

| Source | Responsibility | Deliberate limits |
| --- | --- | --- |
| `src/source-extensions/reader-contract.ts` | Pure manifest/DTO/identity validator; API v1, namespaced work IDs, opaque per-work page keys, no executable hints, explicit raster media size cap | No Node, browser, Android, DB, HTTP, SDK or plugin loader |
| `src/source-extensions/desktop-reader-adapter.ts` | Trusted app-provided transport -> existing `OnlineReaderSource`/`OnlineReaderContract` | Desktop Buffer conversion only; no provider SDK or account integration |
| `src/services/online-reader-service.ts` | Existing chapters -> pages -> image/cache -> progress flow; unchanged | Legacy provider path remains intact |
| `scripts/audit-modules.ts` | TypeScript AST + module resolver -> actual graph, type-only edges, runtime SCC cycles; deny protected reverse dependencies | Existing historic cycles and concrete `ProviderService` imports are reported, not magically fixed |
| Unit tests | Real Reader with synthetic source, media, progress, cache/revocation, invalid inputs, module closure and forbidden reverse-edge checks | No real account/source, installation, Android APK, production migration or hosted executable |

Source ID is **not** accepted merely because a manifest says so. The application must explicitly supply a trusted transport and revocation authority. Runtime revision changes whenever session/permission/account scope changes; disabled access fails before cached reads. Media requests use `source-page:<source>:<encoded-work>:<opaque-token>`, never guess ownership from a naked HTTP(S) URL.

## How to verify

```sh
pnpm type:check
pnpm test -- test/unit/external-reader-boundary.test.ts test/unit/module-dag-policy.test.ts
pnpm exec tsx scripts/audit-modules.ts --output=module-graph.json
```

The full `pnpm test` in PR CI also runs these tests. `module-graph.json` is a local generated artifact, not a new source of truth that should overwrite a historic audit. The architecture test deliberately verifies that `src/services/provider-service.ts` still directly depends on concrete providers: **this is a known blocker**.

## Explicit next steps and acceptance

1. **S2-01**: use the generated graph to enumerate composition-to-provider imports; move construction toward one controlled app composition entry. Maintain the existing Pica unprefixed IDs, EH/JM namespaces, source access leases and cache ownership. The currently protected Reader must never import SDK sessions.
2. **S2-02**: connect one real controlled adapter through the new port in a separate, isolated QA build and prove it can be replaced without changing Reader or persisted progress; no unaudited code loading.
3. **S3-01/02**: benchmark Android managed service/IPC vs a Windows separate adapter process and enumerate trust, release signing, permissions and API negotiation. An optional Suwayomi Host must not become mandatory.
4. **S3-03/04**: only then implement source install/enable/disable/revoke/rollback and physically remove all platform-specific SDK/protocols from both *pure core* artifacts; verify actual package dependency closure and a zero-source local/CBZ Reader.
5. **S4/S5**: preserve old credentials (without copying them into modules), 1,500-work catalog, downloads, local progress, source namespaces, previous release upgrade and rollback.

The G1 user/device UI gate is still open but is not a precondition for isolated S2/S3 architecture work per the user's 2026-10-28 instruction. **G2, G3, G4 and production release are not authorized by this prototype**.


## First real DAG evidence and next composition cut (2026-10-28)

The isolated [S2 graph workflow #40677952242](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40677952242) completed successfully for SHA `383c89e5` (before compiled-composition extraction). Downloaded source-only artifact #12810649687 and checked its JSON. The TypeScript-only analysis counted **239 source files, 1,079 import edges, zero runtime SCC cycles and zero forbidden core reverse edges**. It also explicitly recorded the then-current `ProviderService` runtime imports of `pica-provider`, `eh-provider`, `jm-provider`, registry and source types. This is graph evidence, not a core-only release.

The next Draft commits introduced `src/providers/compiled-composition.ts` as a **single explicit legacy construction entry** and changed `ProviderService` to request the existing trio from this entry. The constructor's public argument order, optional EH/JM instance injection, Pica legacy namespace, original provider routing and source-access lease configuration are preserved. A new regression test checks this behavior and the real AST gate now refuses new runtime `ProviderService` imports of the three concrete provider classes. The full application still transitively bundles those source implementations: this change does **not** satisfy NEW-SRC-01 or G2.

These later commits must pass their own **exact-head** unit, TypeScript, Android, packaged app and source-boundary gates; the earlier `383c89e5` green workflow cannot verify the new composition root. Real Android transport/IPC and user source installation remain NOT_IMPLEMENTED.
