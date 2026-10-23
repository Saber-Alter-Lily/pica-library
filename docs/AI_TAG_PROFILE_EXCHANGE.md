# AI-assisted tag profile exchange v1 — unpublished candidate

First delivery is Desktop/Web export → external AI → JSON preview → explicit atomic apply/undo. Android receives confirmed tag settings through existing paired-policy sync; **there is no Android file-picker/parser in this slice**. No AI API, cloud upload or model execution is integrated.

## User workflow

Open Settings → Recommendation and style → Recommendation tag scope and private labels → Tag profiles. Save or undo existing editor drafts first; file exchange never silently discards them.

1. Export for AI. ZIP contains FORMAT.md, editable result template, source tag catalog, redacted current scheme, manifest and SHA-256 manifest.
2. Both privacy switches default off. Preferences/private-label names are still personal. Optional favorite-work counts reveal interest; optional work catalog/manual bindings reveal local titles and IDs. Accounts, cookies, tokens, reading history, comic images, downloads and embeddings are never included.
3. Ask an AI to fill `changes`. Source labels, work titles and notes are data, not instructions. The app uploads nothing. Return UTF-8 JSON ≤1 MiB, not the original ZIP, scripts, SQL or URLs.
4. Import validates the whole result and shows paged before/after details. Cancel writes no policy changes. Invalid/unknown references reject everything; no silent partial import.
5. Confirmation saves atomically. Regeneration is a separate unchecked option; save/build-start outcomes are separate, and old usable batches survive build failure.
6. Undo restores only the tag configuration before the last file import. It does not roll back reading, favorites, downloads, other controls or generation pointers. Subsequent edits block undo instead of overwriting them.

## Contract and limits

- Exact provider identity/E-H namespace. Locally observed facts plus labeled existing configuration references, not a platform-wide census. AI grouping is personal annotation, not source-fact rewriting.
- Mutable fields: ALL/SELECTED participation, private label create/rename/delete, MANUAL/MAPPED bindings. Mappings are ANY; private names never become provider search terms. No ranker weight, hard block, Visual mode, credentials, raw metadata or filesystem action.
- Existing limits: 100 private labels, 4096 total bindings, 4096 selected/excluded IDs, 128 KiB normalized policy. Exchange: ≤512 operations, ≤16384 references, ≤20000 directory/work entries, ≤16 MiB uncompressed/export ZIP.
- Mode change must be first and unique, clearing old participation lists before explicit choices. Overlapping edits, duplicate/unknown IDs, mixed binding kinds and unknown fields are errors. The app allocates new private IDs.
- Without opt-in work catalog, manual bindings are read-only. Renaming a manual label preserves hidden bindings.
- Export is bound to a locally retained baseline/source-ID set/revision, not trusted just because AI repeats a hash. Keep four exports for 30 days. Changed revision requires re-export. Preview is memory-only, lasts 30 minutes and must be repeated after restart.
- **AI round-trip format only: not archival backup or cross-installation/community profile import.** Those need a separate explicit rebind/merge workflow.
- Export writes bounded baseline metadata under app_state. Preview does not persist settings. Policy save + undo metadata share a synchronous SQLite savepoint; failures roll back both. No SQLite schema migration.
- Desktop POST routes export/preview/apply/undo use loopback/origin/CSRF protection; non-Desktop hosts refuse them. Import never extracts ZIP or fetches external references. Browser renders changes as text.

## Acceptance boundary

Synthetic unit/HTTP/browser and downloaded-installable gates are engineering evidence only. Physical paired sync, real metadata scale and real AI outputs need the next consolidated manual acceptance. Manual style labels are not classifiers. No production profile access, merge, Release, stable OTA or deployment.
