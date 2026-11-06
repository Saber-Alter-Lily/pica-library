# Existing source-host inspection (NEXT-64, in progress / unpublished)

## Scope and honest capabilities

This adapter follows the [reader-core/source boundary](CORE_READER_SOURCE_BOUNDARY.md). Suwayomi is a user-selected external host, not our content platform, app-operated service, bundled runtime or prerequisite for local reading. Broader source integration must not be reduced to making this one host mandatory.

The optional **Settings → Basic → External comic sources → External host diagnostics** panel connects only when the user explicitly approves an endpoint and presses Inspect or a page button. It checks an already-running Suwayomi host and one page of installed source descriptors. Startup, opening Settings, expanding the panel and changing fields make no host request.

This is not a completed source-reader adapter: **Reader, library import and extension installation remain false** in its actual response and UI. Existing provider IDs, source policy, local identities, module APIs, schema, tags, recommendations and sync formats are unchanged. No new source is registered/enabled, no favorites/history/catalog imported, no extension repository added, and no host/JAR/APK downloaded or started. The actual module is wired into the Desktop command, not an unused mock interface.

## Ownership and reuse

- `src/source-hosts/contract.ts`: explicit one-request consent, endpoint/auth scope, input limits and public non-secret result/error types.
- `suwayomi.ts`: exactly two fixed GraphQL queries and bounded response validation, not an arbitrary GraphQL proxy or a new extension interpreter.
- `inspector.ts`: explicit ephemeral command, one active operation, cancellation/deadline and no late results. Platform-neutral dependency closure excludes SQL, filesystem, provider clients, credentials stores and process launch.
- `http-transport.ts`: standard Node fetch/streams/AbortSignal plus Buffer for explicit Basic auth. No inherited Pica/EH/JM/GitHub/WebDAV/proxy authentication or cookie jar, and no new dependency/framework.
- Desktop/UI adapters: local loopback, configured Desktop, Origin and CSRF authority; work lease and shutdown/engine-restart cancellation; transient panel-only credentials and escaped metadata display. No credential/config persistence.

The standard `AbortSignal.any` runtime is feature-checked; only the missing declaration in pinned TS5.3 DOM types is narrowed. No home-grown cancellation scheduler/polyfill is substituted. A typed transport that fails to cooperate cannot publish late data; abandoning its result is not proof that arbitrary external code can be killed. The real HTTP adapter explicitly cancels both pending readers and a received body when abort wins before reader acquisition.

## Fixed upstream authority

Primary authority: official [Suwayomi v2.4.2366](https://github.com/Suwayomi/Suwayomi-Server/releases/tag/v2.4.2366), commit `40bc5da57820324ed0ae724cbbc020cc4673b594`. Seven protocol-file blob/SHA-256 references and facts are in `test/fixtures/source-host-authority.json`. No upstream implementation/assets are copied or executed.

The [info query](https://github.com/Suwayomi/Suwayomi-Server/blob/40bc5da57820324ed0ae724cbbc020cc4673b594/server/src/main/kotlin/suwayomi/tachidesk/graphql/queries/InfoQuery.kt) supplies name/version. The [source query](https://github.com/Suwayomi/Suwayomi-Server/blob/40bc5da57820324ed0ae724cbbc020cc4673b594/server/src/main/kotlin/suwayomi/tachidesk/graphql/queries/SourceQuery.kt) supports bounded pagination; we request only ID/name/language/latest-list capability and page metadata, not cover URLs, provider pages, preferences or account actions.

Source IDs are signed 64-bit strings, confirmed by both the [LongString scalar](https://github.com/Suwayomi/Suwayomi-Server/blob/40bc5da57820324ed0ae724cbbc020cc4673b594/server/src/main/kotlin/suwayomi/tachidesk/graphql/server/primitives/LongAsString.kt) and its [actual schema registration](https://github.com/Suwayomi/Suwayomi-Server/blob/40bc5da57820324ed0ae724cbbc020cc4673b594/server/src/main/kotlin/suwayomi/tachidesk/graphql/server/TachideskGraphQLSchema.kt). The client preserves canonical strings including values beyond JavaScript's safe integer range. These are **host source IDs, not library/Pica comic IDs**; no routing fallback or catalogue conversion is implemented here.

Only the inspected 2.4 query surface is attempted, and both responses must validate. Other versions reject rather than silently falling back to legacy REST. A self-reported version and successful queries are not host identity/extension-code attestation, compatibility with the full API, or proof of real-provider availability. Stable authentication supports anonymous or explicit BASIC_AUTH; SIMPLE_LOGIN/UI_LOGIN browser sessions and later master multi-user APIs are not guessed or copied. A source listing may initialize the remote host's own extensions under that host's authority; “query” is not a sandbox guarantee.

## Request, privacy and failure bounds

- No URL userinfo, query, fragment, percent-encoded/dot path ambiguity or non-HTTP(S) transport. HTTPS uses normal TLS validation; no bypass is added. Plain HTTP is limited to loopback or explicitly approved literal private IPv4 LAN addresses. Basic credentials never go over LAN HTTP. Link-local metadata/multicast/unspecified destinations reject; this is not DNS/network attestation or a general egress sandbox.
- The system accepts at most16 KiB of local request JSON, with a5-second incomplete-input deadline. Two fixed remote queries share a12-second command deadline; the browser has a separate16-second wait/cancel guard. No background retry or discovery.
- Each response is at most1 MiB of actual decoded stream bytes; MIME, malformed UTF8/JSON, GraphQL partial errors, row bounds and duplicate/invalid IDs reject. A page is25 rows with manual offsets up to5000, not an automatic all-source scan. Host-reported totals are not rewritten as an independently verified inventory.
- All redirects, including same-origin redirects, reject. Cookie responses are not stored/replayed. Errors expose enumerated codes, never remote bodies, usernames, passwords, headers or endpoint strings.
- Entered credentials exist only in current browser-panel/request memory. Explicit page navigation can reuse that panel session; changing endpoint/options, cancelling, closing the panel or leaving clears its active use. No app LocalStorage/SessionStorage/config/DPAPI/sync persistence is added. This is not forensic erasure of JavaScript memory or control over a browser's own password manager.
- Results use text nodes/bidirectional isolation, not HTML, images or external links. Source names remain untrusted text. New source-host requests are independent explicit one-shot diagnostics, not a new persisted source enable flag; compiled source choices remain unchanged.

## Validation and remaining acceptance

Current local source evidence:92/92 assertions across four inspected pure/contract/injected-fetch files, TypeScript and46 Web modules' syntax pass. The real loopback API suite, three-language Chromium flows and actual compiled-Windows scenarios are authored for **CI only**, not yet current-package proof. The Windows gate reuses the existing source/media application's isolated profile and lifecycle, with an additional synthetic host fixture; it does not launch a second application/JVM or ship a fault endpoint.

The initial type pass identified the older DOM declaration and an inferred optional test property; both were fixed without dependency or criterion relaxation. A cancellation test exposed received-body cleanup before reader acquisition; production cleanup was corrected, with separate early-abort and truly pending-reader tests. Failed and passing evidence is retained, not renamed green.

Real Suwayomi interoperability/authentication, a persistent host identity/permission lifecycle, external comic namespace/catalogue/tag/Reader/phone integration, trusted repositories/extension supply chain and real-device/provider acceptance remain OPEN. This phase must not be reported as “all sources now work.” The existing one-action application upgrade remains; external hosts are not silently deployed or updated by it.

No production account/profile/body/vector access, local Java/app/browser/LAN runtime, main merge, tag/Release, stable OTA, key download, installation or deployment. Full objective remains open. Current-source CI/artifact results belong in a new immutable handoff; the prior NEXT-63 package remains unchanged.
