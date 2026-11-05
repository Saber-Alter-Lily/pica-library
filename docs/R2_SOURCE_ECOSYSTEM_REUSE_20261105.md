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
