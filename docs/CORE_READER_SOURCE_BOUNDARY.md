# Reader core versus user-selected sources

## User authority — 2026-10-24

The product is a manga reader and personal local library, **not a manga/content platform**. It does not supply or operate manga sources. Users may choose/configure external sources, but connecting one must not make it an application-operated content service or a mandatory dependency. This is a product/engineering boundary, not a blanket legal-exemption claim.

## Required ownership

| Layer | Owns | Must not do |
| --- | --- | --- |
| Reader/library core | User-local media, catalogue organization, progress, shelves and local search | Require a source account, start a source host, ship user bodies or an official manga catalogue |
| Personal tags/recommendations/visual tools | User-controlled optional rules and derivations from available user evidence | Present a remote platform's catalogue/feed as app-owned content or turn inferred style into raw source facts |
| Source adapter | Protocol translation, source-scoped authentication and bounded retrieval requested by the user | Control unrelated credentials, private preferences, local-file deletion or update authority |
| User connection | Explicit endpoint/source/repository selection and local permission state | Become enabled by browsing Settings, by importing a descriptor, or because another source is configured |
| Application updater | One verified application update action, compatibility/rollback and protected user data | Install/enable arbitrary third-party sources, deploy/update an external host or silently change connection trust |

The source/host ecosystem may use maintained upstream software, but a selected host is **the user's external service**, not ours. Suwayomi is an optional adapter target, not the reader's required runtime, official backend or exclusive source ecosystem. This phase has no extension installer, source marketplace, default external endpoint or automatic host deployment.

## Current truth and unfinished separation

The candidate already offers local-only setup/import/reading and independent source controls. New local installs have external sources off. Existing source choices and accounts are preserved for compatibility; this instruction is not permission to delete user data, forcibly log out users or silently migrate working libraries.

The code still contains historical compiled Pica/EH/JM adapters, fixed namespaces and source-specific UI/orchestration. Those are compatibility implementation, **not proof of a fully neutral core or a finished user-installed-source system**. Continue extracting source-specific behavior behind explicit adapter contracts and auditing remaining source assumptions in catalogue, tags, Reader and phone sync. A new host source ID must not be cast into a legacy Pica ID to bypass that work.

Persistent external-host/comic identities, source repositories and code trust, installation/permission/removal/rollback, native parity and real interoperability remain required work. Audit packaged registries/default discovery for source-specific catalogue content before claiming a fully content-free distribution; existing path/extension guards are not a semantic audit of every data/image/binary asset. Do not advertise arbitrary source compatibility or a source market merely because routing manifests exist.

## Immediate NEXT-64 consequence

Only an explicitly approved, bounded inspection of an already-running host is wired now. It does not register/enable a source, import a catalogue, change a favorite or expose Reader/extension-install capability. No host connection or other provider's credentials are persisted/shared. Its result must continue to say Reader/import/install are unsupported until those independent boundaries are actually implemented and verified.

The next reader integration must use explicit source-owned ports and reviewed identities without coupling ordinary local reading to Suwayomi, Pica or any other provider. No official Release/OTA, production data, automatic install or source activation is authorized by this document.

## NEXT-65 distribution consequence

The tracked Registry audit confirmed historical example title/author/count/review columns were being copied twice. [Minimal tag runtime](MINIMAL_TAG_RUNTIME.md) now separates exact consumed rule files and their stable semantic authority from that evidence. All current platform packagers share an exact allowlist; old-layout upgrades must use the existing full one-click replacement, not unsafe incremental deletions or a stale directory fallback. This does not establish complete neutrality, vocabulary provenance, every binary/image's semantics or finished external-source support. User records/preferences and the frozen resolution/ranking behavior remain protected.

## NEXT-66 user-selected configuration consequence

The user's repeated “reader, not manga platform” requirement is a hard product constraint, not a disclaimer-only patch. [User-owned host settings](USER_OWNED_SOURCE_HOST_SETTINGS.md) now persist an explicitly chosen endpoint as a separate local permission record, disabled by default. Saving/enabling/listing/restarting never contacts a host; only a manual inspection does. Endpoint identity cannot be rebound in-place. Credentials stay per request, and disable/removal cancels late responses without deleting content or personal state. Corrupt optional-host settings cannot block ordinary local reading.

This advances connection identity/lifecycle only: external comic identity, reading/search/install authority, unified Reader/library/native and trust remain open. `reader/import/install=false` is still the truthful advertised contract. The application remains responsible for its own adapter safety and accurate scope; “user-chosen” does not imply blanket legal immunity or remove that responsibility. No source market/content service/default repository/required backend or extra content is introduced.

## NEXT-67 actual user-host reading consequence

[Existing user-host library reading](USER_HOST_LIBRARY_READER.md) now uses a distinct explicit15-minute scope and the actual shared Reader engine. Saved inspection remains inspection-only. Stable source-owned comic/principal/URL identity and fresh row-reuse checks prevent Pica fallback or wrong-work progress. Only explicit book selection/private progress creates owned app_state records; no global content catalogue, default source, library import, recommendation evidence or unsupported phone sync is created. Fetch-side effects of the user's host are disclosed. Fully unified source search/catalogue/history/tag/native/session/trust and neutrality acceptance remain unfinished.
