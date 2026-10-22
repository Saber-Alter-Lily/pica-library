# JM source adapter: provenance and acceptance boundary

This is an isolated integration candidate, not a released source guarantee or a third-party extension store.

## Public upstreams checked on 2026-10-21

| Upstream | Current evidence | Decision for this candidate |
| --- | --- | --- |
| [JUKOMU/JMComic-Api-Java](https://github.com/JUKOMU/JMComic-Api-Java) | MIT, not archived, repository pushed 2026-10-01; selected [v1.1.12](https://github.com/JUKOMU/JMComic-Api-Java/releases/tag/v1.1.12) and Maven `io.github.jukomu` API/core/Android support | Thin shared adapter; reuse account/favorites, chapter/page and native image implementation. No provider protocol rewrite |
| [Keiyoushi extensions-source](https://github.com/keiyoushi/extensions-source) | Apache-2.0, not archived, pushed 2026-10-20; maintained source-extension ecosystem including JM | Useful mature source contracts; not embedded wholesale, avoiding a second compatibility/runtime stack in this slice |
| [Mihon](https://github.com/mihonapp/mihon) | Apache-2.0, not archived, pushed 2026-10-20 | Reader/source UX and extension model reference; no app fork or copied implementation/assets |
| [Suwayomi Server](https://github.com/Suwayomi/Suwayomi-Server) | MPL-2.0, not archived, pushed 2026-10-21 | Alternative compatibility server; not bundled with another JVM server or substituted for Pica Library |

Push dates show current activity, not a guarantee of provider uptime, account safety, security review or future maintenance. The pinned Java SDK was chosen because one bounded native adapter can serve both clients and its private favorites API exposes an actual account identity. This is a technical choice, not a legal-acceptance conclusion.

Direct Maven JAR hashes verified against upstream `.sha256` files:

- `jmcomic-api-v1.1.12.jar`: `77df9b484fd2e1c96f8360f053d43e13318aa7c04f49ca283b2bd4c1d3ab27c6`
- `jmcomic-core-v1.1.12.jar`: `8052f3f799bf80c884fdd496a29e1102353d4e0891a88556d741b01b270d68b5`
- `jmcomic-android-support-v1.1.12.jar`: `592f9b7d696a6758426ac28ef9bbb0c011b584e49ae6f9f448c1af099a5a46d0`

Transitive redistributed JVM dependencies receive per-JAR SHA-256 and license/notice material through `dependencyNotices`; the Java runtime keeps its `legal/` notices. Android includes the SDK MIT notice and pinned search-folding notices. Private credentials, APK decompilation materials and research data are not dependencies or deliverables.

## Boundaries

- Pica keeps legacy unprefixed IDs; EH keeps `eh:...`; JM uses `jm:<remoteId>`. Unknown explicit source prefixes cannot fall through to Pica/Desktop.
- The TypeScript registry is the Desktop routing/capability authority. Android reuses the Java source implementation and common catalog/Reader, with a fail-closed Reader factory. Dynamic untrusted extension installation, signed source-repository manifests, update trust and unloading are not implemented.
- Desktop secrets use its existing OS-protected credential backend only on explicit Remember; Android uses a distinct Android Keystore AES-GCM key. No account-secret handoff is added. SDK process messages travel via stdin, never arguments or app logs.
- Favorites require verified UID+username, complete bounded pagination, stable account identity and explicit confirmation. Import is additive and creates zero explicit Likes or remote favorite mutations. Cancellation/partial failure cannot authorize an incomplete import.
- A full favorite summary is not full metadata: upstream summary tags are empty. Explicit detail enrichment is bounded to 20 records per batch; completion status stays UNKNOWN when unavailable.
- Web Reader validates both comic/chapter identities, checks chapter membership and accounts for worker-session cache changes. Images use SDK-issued locators, bounded bytes and existing local Reader caching. No automatic full-comic download is triggered by opening a detail page.
- Existing recommendation models/weights, Visual modes, embedding/sampling policies and schema are not changed. JM seeds must never enter Pica's related-comic endpoint.
- The 2026-10-22 NEXT-40 continuation adds explicit native JM downloads via the same SDK, existing task center and complete-chapter phone Reader. This is an unpublished slice with separate exact-source build/device gates; see [JM_NATIVE_DOWNLOAD_ACCEPTANCE.md](JM_NATIVE_DOWNLOAD_ACCEPTANCE.md). JM progress/proxy parity and dynamic source installation remain open.

## Next consolidated human acceptance, not requested now

1. Use only the isolated Windows RC/Android Dev identities. Never copy the formal database into RC. Do not uninstall an existing Dev app to bypass signing/version errors.
2. Verify #199 objective/filter round trip; #200 rare-label search and two staged edits across searches; save once and verify only intended keys change.
3. Verify Reader single/double tap, 1.5×/2×/3×, pinch/pan, page recycling, rotation and retained progress.
4. Log in to the user's own JM account on each device; verify Remember off/on, failed account switch and logout without deleting local collection.
5. Preview/confirm favorites, repeat idempotently, cancel/intercept an incomplete scan, enrich one bounded batch and verify local metadata/profile evidence without fake Likes.
6. Search and read a real JM chapter on Windows and Android, then verify Pica/EH/LAN/local/WebDAV regressions. Test network/proxy/folder edge cases separately.
7. Keep device/provider/performance acceptance PENDING until actual evidence exists. No issue closure, main merge, version/tag/Release/OTA change follows automatically.
