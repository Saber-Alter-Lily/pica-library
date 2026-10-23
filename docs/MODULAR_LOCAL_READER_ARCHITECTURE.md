# Local-first modular reader: product contract and execution ledger

## Product authority

User objective, 2026-10-23: this is a **local comic reader and personal library manager**, not a content service. The application does not distribute comic bodies, operate a comic catalog service, or require a particular provider account. It manages material supplied by the user, or connects to external sources that the user chooses. Optional recommendations, tags, visual analysis and advanced tools must not become prerequisites for ordinary reading.

External-source support is an adapter capability, not permission to redistribute provider content. Software/data separation is an engineering boundary, not a legal conclusion. Source code and distribution archives must retain upstream notices; no reference-APK implementation/artwork is imported.

## Boundaries being enforced now

| Module | Current implementation and interface | What it owns | Must not own |
| --- | --- | --- | --- |
| Library | `library`, module API2; local SQLite/catalog and Reader inventory, bounded local ingestion port | User records and progress, independently located from application files | Provider passwords, algorithm ownership of raw facts |
| Tags | **Extracted** pure `src/tags/policy.ts`, JSON schema1/module API2 (adds local namespace); old V5 path is a compatibility re-export | Personal participation/mappings and derived signal views; persistence remains an application adapter | Network, database handles, candidate generation, model execution, rewriting provider facts |
| Native tags | **Extracted** pure Java `tags/TagPolicyRules`; JSON and read-only raw-fact loading remain adapters; shared Desktop/Android golden cases | Identical personal participation/private-binding semantics and unique-work directory counts | Android UI/storage, network, raw metadata mutation, ranking or Visual execution |
| Sources | `ComicProvider` + compiled manifest API 1 + `ProviderRegistry` | Source aliases, ID namespaces, page schemes and capabilities | Choosing a user's preferences or recommendation ranker |
| Media | **Extracted** credential-free `src/media` HTTP/URL policy; source-owned optional cover port | Bounded raster transport and redirects; Library adapter owns source-scoped cache | Provider login, cookies, database or recommendation state |
| Reader | Existing local/remote/native Reader sources, API 1 | Display/navigation/progress interfaces | Source authentication as a prerequisite for local reading |
| Native gestures | **Extracted** pure Java `reader/gestures` decisions/ownership; Android recognition/rendering and phone-local `ReaderGestureSettings` remain adapters | Tap/fling/zoom decisions and double-tap options on that phone | Desktop settings, provider sessions, recommendation policy |
| Recommendation | Existing V3 authority and V5 portable interface | Derived ranking/evidence, explicit user policy | Provider facts or user library identity; ordinary startup cannot force online generation in a source-free install |
| Sync | Existing paired policy and catalog contracts | Merge/transport between authenticated devices | Blindly copying credentials or silently overwriting local conflicts |
| Update | Existing verified incremental/full-application updater | Application tree replacement, health check and rollback | Downloaded bodies, user databases, portable policies or phone-local gestures |

This is **not** a claim that the whole monolithic service/UI has already been decomposed. The version catalog expresses declared public interfaces, not proof of all internal dependency directions, an executable plugin loader, or model/data-format migration support. The first automated import boundary covers the extracted tag domain, pure module-contract parser and source registry. Remaining seams are listed below.

## Source registration and trust

Routing for Pica/EH/ExH/JM now comes from a single compiled manifest: API version, adapter version, comic namespace, source aliases and image-locator schemes. Registry inspection does not log in or fetch anything. Duplicate routes or incompatible adapter APIs reject atomically. Unknown explicit comic/page namespaces never fall back to an unrelated authenticated provider. Legacy unprefixed Pica IDs remain unchanged.

This step remains a **compiled adapter system**, not a finished dynamic-extension ecosystem. Adding a genuinely new provider still needs an explicit stable ID/storage/portable-tag review and native parity. A future downloadable adapter requires signed repository trust, reviewable permissions, enable/disable/remove lifecycle, host compatibility, cancellation/resource limits and rollback. No arbitrary JavaScript/JAR/APK can be installed through these descriptors.

## Local-first startup

The initial setup offers **Set up local library only** in zh-CN/en/ja. It validates/saves the local path and download profile without calling a provider, saving/deleting credentials, or requiring a credential backend. A saved local config is sufficient to reopen the library after restart. Existing source sessions and other preferences are retained. Adding/changing Pica later must preserve EH, JM and every WebDAV-target credential; changing a library folder still respects the active-download lock.

Subsequent ordinary local storage/profile/public-proxy changes also work without a Pica account. A partial Pica login is still rejected, never treated as a successful local-mode login. Empty local settings do not synthesize an empty credential file; an authenticated proxy or another real source secret continues to use the existing secure credential backend.

The Web shell loads existing local state but does not automatically create an online recommendation cycle when the Desktop explicitly reports no Pica/EH account. Explicit discovery/recommendation operations remain separate. NEXT-48 adds bounded folder/CBZ import-to-owned-storage, not direct archive streaming, CBR/PDF or complete source-independent UX; `archiveReader: false` remains honest alongside the separate local-import capability.

## One-click upgrade contract

- Application modules ship together in the signed/verified application distribution. Users retain one update action; they do not manage seven independent packages.
- `app/module-contracts.json` is copied from the versioned source declaration and compared against the actual running engine by the Windows artifact gate. It contains public interface numbers only, not user state or executable entry points.
- New incremental manifests bind their module declarations to the target payload (or unchanged compiled declaration). Mismatched, undeclared, malformed or removed declarations reject before extraction/application.
- Equal module APIs may update incrementally. A module API change requires the existing full-application one-click path, even if outer App API/schema numbers happen to match. A release with such a break must publish the verified full Windows archive rather than an incompatible incremental package. Global App API and database schema rules still apply; no module metadata overrides a schema downgrade rejection.
- Legacy manifests/packages remain readable. The first contract adoption is additive under the existing App API; it does not retrofit new validation into an old installed updater. Historical direct-upgrade gates must still be tested with the exact released source/binary.
- For a source archive without metadata, the builder uses a frozen first-adoption compatibility floor, not whatever contracts the future target happens to declare. A later breaking module cannot silently claim compatibility with legacy builds merely by changing the current catalog.
- Windows x64 is the current one-click self-update target. Other packaged platforms retain their existing capability declarations; metadata packaging is not a promise of supported self-update there.
- Full-replacement recovery requests authenticated loopback shutdown before a bounded PID fallback, waits for exit, and uses Node's bounded Windows file-removal retries. A missing backup must never cause deletion of the installed tree. Cleanup/report failure after proven health must not roll back a healthy application. The unpublished Windows workflow tests both successful replacement and deliberately failed-health recovery to the original released version.
- Module metadata paths use canonical case; case-folded duplicate or differently cased declarations reject before extraction, including on case-insensitive Windows hosts.
- Dev Android keeps its existing package ID and signing certificate and increments versionCode. The Android installer remains the final system-controlled installation step; no uninstall/data reset is proposed.

## Open-source reuse, not protocol/framework duplication

Primary sources inspected 2026-10-23:

- [Suwayomi Server](https://github.com/Suwayomi/Suwayomi-Server): maintained source-host/client separation and extension-oriented capability design. It is MPL-2.0; no implementation was copied into this MIT project. Running its full extension host is a separate interoperability/security decision, not implied by our manifest.
- [Mihon](https://mihon.app/): bring-your-own-content reader position and optional sources. We are not claiming binary-extension compatibility from this architectural reference.
- [Komga distribution/data separation](https://komga.org/docs/installation/docker/): application replacement with separately retained configuration/content. Our existing updater is reused; no parallel updater was written.
- [JMComic-Api-Java](https://github.com/JUKOMU/JMComic-Api-Java): retain the already-pinned MIT SDK and shared JVM/native adapter. This round does not reimplement its protocol or silently upgrade its dependency.
- [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API): use the already-installed compiler AST for bounded import-direction checks, not a homemade dependency parser or a new framework.

## Required continuation, not completed by this slice

NEXT-47 resolves the JM-cover → Pica-login dependency and extracts shared media transport; NEXT-48 adds bounded local folder/CBZ ingestion. See [source/media evidence](SOURCE_MEDIA_BOUNDARY.md) and [current local ingestion contract](LOCAL_CONTENT_INGESTION.md). Neither provides a dynamic executable extension host.

1. Local-content ingestion: NEXT-48 implements one-comic folder/CBZ preview/copy, `local:` IDs, atomic inventory and progress-preserving reimport through Reader/LAN. See [scope, safety and holds](LOCAL_CONTENT_INGESTION.md). Cross-path relocation/deduplication, watchers, Android direct import and PDF/CBR remain open. Library/tag APIs advance to 2 and require full one-click replacement; schema stays 14.
2. Source lifecycle: NEXT-49 adds explicit persisted Desktop enable/disable, credentials-independent policy, transport cancellation and late-result fences while local reading remains independent. [Desktop semantics](SOURCE_LIFECYCLE.md). NEXT-50 adds [phone-local native choices and worker/transport lifecycle](NATIVE_SOURCE_LIFECYCLE.md), with synthetic tests and exact-source package gates recorded separately. Real WebView/SAF/OEM behavior, optional source-runtime packaging and trusted extension-host/repository decisions remain unfinished.
3. Recommendation service seam: separate retrieval ports, pure policy/ranking, generation persistence and delivery; retain V3 cycles and cached mobile results. The interface version declaration alone does not accomplish this split.
4. Native tag/gesture seams: NEXT-51 [extracts pure native gesture decisions and touch ownership](NATIVE_READER_GESTURE_MODULE.md); NEXT-52 [separates native personal-tag rules from JSON/raw-fact adapters](NATIVE_TAG_POLICY_MODULE.md) with a shared 44-case Desktop/SDK28/35 contract. Both pure modules have empty-classpath compile gates. Physical touch/OEM behavior, real pager/continuous-scroll feel and actual tag/offline-sync UX remain unverified until device evidence exists.
5. Upgrade acceptance: exact prior accepted Dev -> next Dev signature/version continuity; actual Windows archive incremental/full upgrade and rollback with synthetic private-tag, reading and source state. No stable OTA claim without published-artifact acceptance.
6. Concentrated user acceptance: source accounts/pagination, AI-returned JSON, two guides, private tags, Reader gestures and phone/offline sync. Retain all previous unverified items; no issue closure or scientific Visual acceptance by CI alone.

Scope: isolated candidate only. No production data, main merge, tag/Release, stable OTA or automatic deployment. Exact-source results and installable hashes are recorded separately after the final build; prior green runs do not validate this source.
