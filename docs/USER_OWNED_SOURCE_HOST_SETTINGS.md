# User-owned host settings — NEXT-66 (unpublished)

## Product boundary

The application is a local manga reader/personal library, **not a manga content platform**. The user chooses and manages external hosts/content access. There is no app-operated content service, official content catalogue, source marketplace, prefilled/default host, installed extension repository, required source account or required Suwayomi backend. Local reading remains independent.

This boundary is implemented through opt-in connections and separate authority, not merely a disclaimer. It is **not** a legal-exemption guarantee or a claim that adapter implementation/security is someone else's responsibility. Existing compiled Pica/EH/JM, source-specific UI and source-owned vocabulary are unfinished compatibility separation; they are not silently removed, relabelled neutral or granted new permissions by this slice.

## What actually works

Settings → Basic → External sources now has **My external host settings (experimental)**, separate from the existing ephemeral diagnostic. Opening either panel performs no host request. Even reading saved local settings requires an explicit button; no automatic refresh/poll is added.

1. User enters a label, their existing Suwayomi 2.4 endpoint, authentication mode and optional explicit LAN-HTTP permission, then approves **inspect-only** scope.
2. Save creates a random local connection UUID and stores **disabled** public metadata in `<desktop root>/config/source-hosts.json`. No host request or provider/source activation occurs. Endpoints are not editable in-place: removing/re-adding creates a new identity rather than reusing old permission.
3. User may separately enable manual inspection. That action also performs no host request.
4. Only **Inspect one source page** contacts the configured host. It reuses the actual fixed-query inspector, bounded HTTP transport, deadline, cancel, no redirects and LongString parser from NEXT-64. No new source interpreter, dependency or remote protocol was invented. The existing diagnostic offers explicit paged inspection; this saved-host command requests just one page at offset0.
5. Basic credentials must be entered per request and are not persisted, returned, uploaded or synced. No Pica/EH/JM/GitHub/WebDAV/proxy account or browser session is inherited. Remembered secure host sessions remain future work; the existing OS vault is deliberately neither read nor modified here.
6. Disable/remove aborts the owned in-flight request and fences its late result. No local/remote comic, source extension, account, database row, favorite, history or download is deleted. Engine restart/exit and client disconnect cancel active inspection. Persisted enable flags do not cause connection on restart.

## Module and failure authority

- `src/source-hosts/connections.ts`: actual platform-neutral permission state machine with injected metadata store/ID/inspector. Its emitted dependency graph is only itself and the existing contract. No SQL, filesystem, process, provider account or default network client in the domain.
- `src/desktop/source-host-store.ts`: separate bounded UTF8/JSON file adapter. Strict schema, maximum16 hosts, URL/auth restrictions, unique IDs/endpoints, public-field allowlist, no future permissions or secrets. Random exclusive temporary file plus atomic replacement; damaged/unreadable files are not overwritten/reset. Only this optional module becomes unavailable; local reader setup/startup still works.
- Actual Desktop controller + server: all three host routes require configured local Desktop, loopback peer, same local Origin, CSRF, JSON,16KiB body and5-second incomplete-body deadline. Public failures are enumerated non-secret codes. Read/list also uses this protected POST surface, not an open host-address export.
- UI: Chinese/English/Japanese, no markup or link interpretation, no browser storage, no default endpoints. Credentials clear after a request, panel close/page exit and rendering. Aborting a browser save is **not** promised to undo a server commit; UI explicitly asks for manual refresh to confirm.
- Host revision rejects stale-tab enable/remove/inspection. A failed disk write cannot grant a new permission. An attempted revocation cancels the current request before persistence; if storage fails, the operation reports failure, not durable revocation success. No power-loss/whole-profile backup guarantee is inferred from atomic replacement.

## Explicitly unsupported

This is **a real persisted configuration/permission lifecycle, not a finished external-source Reader**. Responses keep `reader=false`, `libraryImport=false`, `extensionInstall=false`; existing ephemeral inspection keeps `persisted=false` because its returned descriptors are not an imported catalogue. A connection UUID is not a comic/source/provider ID. No external ID is cast to Pica/local, no catalogue is added to recommendation/sync, no remote source is silently selected, and no future read/search/install consent is inherited.

Next dependencies remain: source-specific search/read permissions, stable host+source+comic identity (including remote-ID reuse), actual unified Reader and private progress integration, secure opt-in credentials, source/tag/library/native boundaries and real-host interoperability. Remote fetch operations may themselves mutate/cache metadata on the user's host; future UI must describe that scope rather than mislabel every GraphQL request as read-only. No host or recovered APK implementation is copied/executed here.

## Evidence and rollout

Local inspected checks currently113/113 across7 pure/temp/fake-fetch/source-graph files, TypeScript and Web47/47 syntax PASS. First attempt retained an esbuild shared-ancestor access failure and one mock tuple type error; narrower filesystem authorization and an explicit mock signature corrected them. No criterion was relaxed. No Java, browser/app/listener, Gradle/JM worker, firewall rule, production account/profile/body/vector or installed app was used locally.

Real local HTTP, three-language Chromium and actual compiled Windows save/enable/inspect/disable/remove tests are authored for **current-source CI only**; current-source PASS requires their fresh results and installable provenance, not prior NEXT-65 greens. Existing update/rollback/deep canaries remain. Dev80→81 advances only candidate version authority; native implementation is unchanged. Signed-package/emulator results are not physical install, provider or experience acceptance. User testing remains deferred.

No main merge, tag/Release, stable OTA change, signing key download, install or deployment. Full modular/content-free-reader objective remains OPEN.
