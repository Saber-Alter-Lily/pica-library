# Pica Library v0.3.0 runtime asset audit

## Reproduction

The public `Pica-Library-v0.3.0-windows-x64.zip` was downloaded from the
GitHub Release and verified as
`8c22b2d869a4873d7f79fd1352a9dec311c404b6aaeb8c71ba7de57e14d6a45a`.
In an isolated directory with no source checkout, the package did not contain
`src/data/registry-v3-final/`. Calling the packaged Atlas rebuild endpoint
failed with `ENOENT` for `PICA_REGISTRY_V3_FINAL_MANIFEST.json`.

## Production runtime asset inventory

| SOURCE_PATH | RUNTIME_CONSUMER | EXPECTED_PACKAGE_PATH | CURRENTLY_PACKAGED_IN_V0.3.0 | REQUIRED |
| --- | --- | --- | --- | --- |
| `src/data/registry-v3-final/PICA_REGISTRY_V3_FINAL_MANIFEST.json` | `loadTagRegistryV3()` | same path | No | Yes |
| `src/data/registry-v3-final/PICA_TAG_REGISTRY_V3_RUNTIME.csv` | manifest-selected semantic registry | same path | No | Yes |
| `src/data/registry-v3-final/PICA_ENTITY_REGISTRY_V3_FINAL.csv` | `loadTagRegistryV3()` | same path | No | Yes |
| `src/data/registry-v3-final/PICA_TAG_ALIAS_MAP_V3_FINAL.json` | `loadTagRegistryV3()` | same path | No | Yes |
| `src/data/registry-v3-final/PICA_TAG_UNRESOLVED_V3_FINAL_WATCHLIST.csv` | `loadTagRegistryV3()` | same path | No | Yes |
| `src/data/registry-v3-final/PICA_TAG_LIBRARY_V2_REVIEWED.csv` | V2 semantic compatibility layer | same path | No | Yes |
| `src/data/registry-v3-final/PICA_TAG_ALIAS_MAP_V2.json` | V2 alias compatibility layer | same path | No | Yes |
| `src/data/registry-v3-final/PICA_TAG_REGISTRY_V3_FINAL.csv` | immutable authority/audit companion | same path | No | Yes (complete frozen directory) |
| `src/data/headers.json` | static JSON import in `src/sdk.ts` | bundled inside `app/*.js` | Yes (bundled) | Yes |
| `src/recommendation-v3/tag-aliases.v1.json` | static JSON import in semantic core | bundled inside `app/*.js` | Yes (bundled) | Yes |
| `web/**` | local HTTP static server | `web/**` | Yes | Yes |
| `dist/licenses/THIRD_PARTY_LICENSES.txt` | redistribution notice | `licenses/THIRD_PARTY_LICENSES.txt` | Yes | Yes |
| `SOURCE_SHA.txt` | desktop provenance | `SOURCE_SHA.txt` | Yes | Yes |

All other production filesystem reads identified by the audit target the
separate user data/config/cache/download/runtime-state directories, local
comic files, or package files already covered by the existing packaging gate.
They are not source-tree runtime assets and must not be included in releases.

## Fix boundary

- Copy the complete, byte-identical frozen Registry V3 directory into the
  Windows package at the same relative path.
- Keep the full package source-compatible path and add a byte-identical
  `app/runtime-assets/registry-v3-final/` mirror. Existing v0.3.0 updater
  helpers can install only the mirror through the already-frozen `app/`
  allowlist; v0.3.1 falls back to it only when the primary path is absent.
- Keep DB, cache, downloads, logs, `.env`, credentials, generic `src/**`, the
  updater helper, Ranker code, and Registry contents outside the change.
- Do not broaden the updater allowlist or replace `app/updater.js`.
- Validate the full runtime directory during packaging and validate every
  loader-required file again after extracting the final ZIP.
