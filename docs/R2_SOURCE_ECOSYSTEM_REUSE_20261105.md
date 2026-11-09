# R2 source ecosystem investigation and incremental delivery (2026-11-05)

Status: research complete; Android Host pagination committed in Draft #284 at `7e9bd31c`. CI and physical-device acceptance are independent and remain open. The stable `main`, v0.5.0, Release, OTA and real profiles are unchanged.

## Source candidates (verified GitHub push dates, UTC)

| Project | Last pushed | Licensing | Decision |
| --- | --- | --- | --- |
| [Breeze](https://github.com/deretame/Breeze) | 2026-11-05 | MPL-2.0 main application | Active cross-platform design reference; its plugin runtime is not interchangeable with our signed Worker or Suwayomi Host |
| [Breeze Bika plugin](https://github.com/deretame/Breeze-plugin-bikaComic) | 2026-10-23 | No repository-level LICENSE found | Do not copy/package without permission |
| [Breeze JM plugin](https://github.com/deretame/Breeze-plugin-JmComic) | 2026-10-21 | No repository-level LICENSE found | Do not copy/package without permission |
| [Breeze E-H plugin](https://github.com/deretame/Breeze-plugin-ehentai) | 2026-11-02 | No repository-level LICENSE found | Do not copy/package without permission |
| [Breeze plugin list](https://github.com/deretame/Breeze-plugin-list) | 2026-11-03 | Registry metadata is not an execution API | Monitor upstream maintenance only |
| [Suwayomi Server](https://github.com/Suwayomi/Suwayomi-Server) | 2026-11-01 | MPL-2.0 | Reuse our existing opt-in host, GraphQL and Android Binder |
| [Delta Comic](https://github.com/delta-comic/delta-comic) | 2026-11-01 | AGPL-3.0 | Architecture comparison, not plugin-code reuse |
| [Keiyoushi extension source](https://github.com/keiyoushi/extensions-source) | 2026-11-05 | Apache-2.0 | Do not assume all desired extensions remain distributed |

Keiyoushi documents an E-Hentai extension removal following a copyright takedown request: https://github.com/keiyoushi/extensions-source/issues/14260. An open repository does not grant rights to redistribute third-party site adapters or their content. A recent commit is only maintenance evidence, not successful account, search or image-fetch verification.

## Implemented original-product improvement

Android's independent signed `HostBrowserActivity` previously always called `HostSourceManager.sources(0)` and displayed only the first 25 installed entries. It now offers Previous/Next controls over the **existing** 25-item Suwayomi GraphQL paging operation and shows the current range. Refresh reloads the current page; disconnect and configuration replacement clear stale visible rows. The existing source-binding and consent gates remain authoritative; paging is disabled after binding a source. Windows already has source paging in `web/host-library.js`, so no duplicate implementation is added.

## Release blocker / acceptance

- Existing Android Host code must compile and its first-page source search → Reader → explicit offline save flow must still pass at this exact commit.
- A user-managed Host with 26+ installed entries must demonstrate page 2 selection and back navigation on a real phone before this new UX can be called accepted.
- For each of the requested three sources, a lawful independently obtained and trusted compatible extension must actually work through a supported runtime. The Breeze JavaScript format is **not** directly installed into Suwayomi, and this app does not download, install or host extensions.
- Actual provider interoperability, signer ownership, source update/revocation, licensing, physical G1, production v0.5.0 migration G3 and Release G4 remain OPEN.

Next functional batch: select a lawful existing host extension → search → open chapter/page in the original Reader → explicitly save → revoke Host → offline reopen, on Windows and Android. Record exact extension identity, version, licence and real successful evidence; stop calling synthetic/local-source success equivalent to third-party site support.

## Triad extension metadata evidence — 2026-11-05 (source-discovery only)

The [Hyperion Mihon-Extensions aggregate](https://github.com/HyperionHXH/Mihon-Extensions) **currently lists all three requested sources in its 1,601-entry** [Mihon/Tachiyomi extension index](https://raw.githubusercontent.com/HyperionHXH/Mihon-Extensions/main/repo/index.min.json). These are not Breeze JS plugins and are therefore substantially closer to the existing user-managed Suwayomi extension ecosystem, but **index presence is not successful installation or real-site reading**:

| User-facing source | Source package (independently provided) | Version advertised | Source ID (signed 64-bit string) | Code provenance / verified artifact scope |
| --- | --- | --- | --- | --- |
| Pica / 哔咔 | `eu.kanade.tachiyomi.extension.zh.picacomic` | 1.6.14 | `5768337869316468367` | [Keiyoushi Picacomic](https://github.com/keiyoushi/extensions-source/tree/main/src/zh/picacomic), listed as APK; not independently established to work in Suwayomi server |
| JM / 禁漫天堂 | `eu.kanade.tachiyomi.extension.zh.jinmantiantang` | 1.6.64 | `6286738698187452081` | [Keiyoushi Jinman Tiantang](https://github.com/keiyoushi/extensions-source/tree/main/src/zh/jinmantiantang), listed as APK; not independently established to work in Suwayomi server |
| E-Hentai | `eu.kanade.tachiyomi.extension.en.ehentai` | 1.6.36 | `57122881048805941` | [Hyperion E-extensions](https://github.com/HyperionHXH/E-extensions), explicit APK and `jar/tachiyomi-en.ehentai-v1.6.36.jar`; see the [checksum manifest](https://github.com/HyperionHXH/Mihon-Extensions/blob/main/repo/checksums.json) |

Metadata and repo updates are different from actually using a plugin: E-Hentai 1.6.16 has a *historical* independent Suwayomi smoke report dated 2026-08-26 in [repo/smoke-test-report.json](https://github.com/HyperionHXH/Mihon-Extensions/blob/main/repo/smoke-test-report.json). That result does **not** verify the currently indexed 1.6.36, real accounts, or another provider. No published JAR was identified for Pica or JM in the aggregate's current `repo/jar/` directory; only their APK entries are confirmed. The Keiyoushi source repository and Hyperion E-extensions declare Apache-2.0, but redistribution, upstream content access and source-specific requirements must be checked independently.

**Product integration remains unchanged:** default Reader has zero site SDKs; user installs and updates any lawful source separately in their own Host UI; the existing GraphQL source list returns the source name and signed-Long ID; the source-only companion forwards authorized chapters through the existing Binder to the one original Reader. Do **not** hardcode these site IDs, extension-store URLs, credentials or executable code into the clean core. The explicit first real G2 provider gate is: authenticated user's own Host → actual installed extension/package + signing/version evidence → source ID listed by Host → lawful test search → real chapter/image data → original Reader → explicit local save → revoke Host → offline reopen. Repeat with a second independent extension before generalizing a multi-provider claim. No real provider was contacted during this metadata audit.

### Completed original-product UX increment / pending verification

An online bookmark saved in the existing independent Android Host now offers **Connect to resume bookmarks** while disconnected. It collapses the bookmark list to expose existing consent and Host configuration without a long scroll, then restores the same list once the user has **manually** authorized the connection. The already built bounded source ID discovery can then resume the original Reader without searching for the comic again. Neither this UI shortcut nor the identity check automatically starts a Host session. The existing Android35 flow covers this specific action and must finish SUCCESS on its exact commit; G1–G4 remain OPEN.

### Authoritative Keiyoushi JAR discovery, replacing earlier APK-only assumption

On 2026-11-06, GitHub's actual release asset metadata for [Keiyoushi release 4591fbc-2](https://github.com/keiyoushi/extensions/releases/tag/4591fbc-2) confirmed that **both Picacomic and Jinman Tiantang ship native JAR artifacts as well as APKs**. The Hyperion aggregate's local `repo/jar/` inventory was therefore insufficient to infer those two projects had no JAR. The earlier APK matrix was correctly stopped by SHA-256 checks because `keiyoushi/extensions/release-assets.json` contains package-level signature-related values, **not the GitHub artifact digests**. Never disable verification to work around this discrepancy.

Exact GitHub-managed release asset evidence:

| Artifact | Bytes | GitHub asset SHA-256 |
| --- | ---: | --- |
| `tachiyomi-zh.picacomic-v1.6.14.jar` | 215702 | `c62a89ce82e67640ef6de0feff3c76030622066d185530fd576264e98f40cb0a` |
| `tachiyomi-zh.jinmantiantang-v1.6.64.jar` | 263387 | `5eebd0bae530be491fe1cae32d1940c3914b224c46e7b9d6dd596415ef2c8be7` |

The isolated three-case CI now uses these immutable-release JARs and exact byte digests. **JAR exists / SHA validates does not prove Suwayomi loads it, nor does loading prove real-site availability.** Each case still requires a terminal install + source-ID + revoke PASS. The verified E-Hentai 1.6.36 JAR lifecycle result is separate and remains valid.

### Windows saved-bookmark source restoration — 2026-11-08

Android's signed Host already located an installed source from a saved online work. Windows had a saved-work index, but hid it until manually selecting a source in every newly authorized session. The single user-managed Windows Host now shows the locally persisted, Host/principal-scoped selected-work metadata immediately after explicit session consent.

Clicking a saved work may locate its exact source ID among the first **200 installed Suwayomi sources** through the already existing 25-row GraphQL pagination. It then invokes the original `select` and Reader identity checks. The same path powers explicit per-chapter offline import, which still needs a separate chosen chapter and local-copy consent. If the source is missing, it stops; it never guesses alternatives, performs a title search, installs an extension, logs into another Host or automatically downloads content. The normal pure-local Windows executable remains without Host capability. No plugin runtime or manga source SDK was added.

Real-source third-party content, Windows native UI, physical G1, actual v0.5.0 profile migration G3 and signed G4 release decisions remain distinct, open gates. No stored manga-site credentials or copied website adapters.

### Windows saved online bookmark management parity (Draft #284; 2026-11-08)

- The optional original-Windows Host panel now offers a two-step, local-only removal for previously selected online works, matching the already available Android Host bookmark removal. It reuses the original host-reader-book-references-v1 index, state port, Web UI and Reader; no new source SDK, database, updater or Reader.
- The remove-saved action accepts only an explicitly authorized current Host/principal and appropriate selected-source scope, a valid saved work ID and distinct removal consent. No source RPC is made. Confirmed local chapter copies, reading progress, downloaded content and the Host source library are untouched. Its saved-work page is refreshed and preserved.
- This closes only the Windows bookmark-management implementation gap. G1 physical UI, G2 real multi-provider comic content, G3 actual v0.5.0 data migration/rollback and G4 publication remain OPEN. Independent exact-head CI and original Windows bundle verification are still mandatory.
