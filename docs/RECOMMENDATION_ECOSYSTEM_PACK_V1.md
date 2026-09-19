# Recommendation Ecosystem Pack V1

Status: architecture contract only. No runtime pack activation is authorized by this document.

## Goal

Pica Library should remain open-source and local-first while making its recommendation quality depend on a maintained ecosystem rather than on a single easy-to-copy scoring formula.

The design goal is **not** code obfuscation or DRM.

The design goal is:

> Copying the ranker should not reproduce the maintained cross-provider knowledge, user state, Visual interpretation, compatibility history, and evaluation evidence that make the official ecosystem useful.

## Design references

This architecture deliberately borrows established open-source patterns instead of inventing a proprietary plugin system.

- **Home Assistant**: integrations have explicit domains, manifests, dependencies, versions and quality metadata. Pica Library adopts the same principle of small, typed, independently versioned capability packs rather than one monolithic recommendation blob.
- **MusicBrainz**: durable entity identity is separated from individual releases/variants. Pica Library's Series → Work → Edition → Upload model follows the same general identity principle.
- **Syncthing**: device trust is derived from explicit device identity and authenticated peer relationships. Future pack/device trust should use standard public-key identities and authenticated transport rather than custom secret-transfer schemes.

These projects are architectural references, not code dependencies.

## What is actually defensible

The following are weak moats and should not be treated as protection:

- hiding linear weights;
- minifying JavaScript;
- adding artificial algorithmic complexity;
- renaming features;
- keeping an undocumented magic constant;
- moving the same ranker into a binary.

The durable advantage should instead come from five cooperating layers.

## Layer 1 — Private Personal State

Private Personal State is user-owned and never an official downloadable Pack.

Examples:

- Lifetime / Recent / Session evidence;
- explicit 1–10 corrections;
- MORE / LESS / BLOCK;
- Like / Dislike;
- already seen / already owned / duplicate reports;
- temporary suppression;
- taste-profile exclusion;
- shelves / favorites / reading completion;
- device-local session intent.

Properties:

- local-first;
- portable between the user's paired devices where the sync contract allows;
- never published as ecosystem data;
- never required to leave the user's devices.

A fork can copy the recommendation code, but it cannot copy another user's accumulated private state.

## Layer 2 — Canonical Knowledge Pack

Purpose:

- Series / Work / Edition / Upload identity;
- author concepts and aliases;
- cross-provider author bindings;
- high-confidence duplicate relations;
- canonical tag/character/IP relationships where redistribution is allowed.

Example Pack ID:

`org.picalibrary.canonical.default`

Important rule:

**A Pack may propose canonical knowledge; it must not silently overwrite a user's explicit identity adjudication.**

Precedence for identity conflicts:

1. explicit local user decision;
2. accepted local materialized binding;
3. official Pack proposal;
4. community Pack proposal;
5. heuristic/evidence-only inference.

A local `KEEP_SEPARATE` decision is a hard protection against a Pack collapsing two works.

## Layer 3 — Provider Intelligence Pack

Purpose:

- provider query capabilities;
- provider-native canonical tag bindings;
- query compiler rules;
- supported browse modes;
- provider request-budget defaults;
- capability/fallback declarations;
- safe field normalization;
- source-specific semantic aliases.

Example Pack IDs:

- `org.picalibrary.provider.pica`
- `org.picalibrary.provider.eh`

Provider Packs do not contain provider credentials.

They describe how Pica Library should interpret and query a source. Runtime authentication remains in the existing account/relay subsystem.

## Layer 4 — Visual Intelligence Pack

Purpose:

- Visual model identity;
- sampling-policy identity;
- non-private author prototype metadata where redistribution is lawful;
- provisional style-family graph metadata;
- coverage/QC summaries;
- compatibility metadata for locally computed embeddings.

Example Pack ID:

`org.picalibrary.visual.dinov2-small-v1`

The Pack must not contain:

- downloaded manga pages;
- private local file paths;
- another user's favorite-derived private prototype;
- credentials;
- copyrighted image caches unless separately permitted.

User-specific comic embeddings and preference prototypes remain local.

A Visual Pack describes interpretation and compatibility; it does not make the official client dependent on shipping users' source images.

## Layer 5 — Recommendation Policy Pack

Purpose:

- versioned channel priorities;
- bounded feature semantics;
- session-mode policy;
- diversity policy;
- safety constraints;
- supported feature/version requirements.

Example Pack ID:

`org.picalibrary.recommendation.default-v5`

A Policy Pack should remain readable and auditable.

It may change which maintained ecosystem capabilities are combined, but it must not be used to hide credentials or executable arbitrary code.

V1 Policy Packs are declarative data, not dynamically loaded JavaScript/native plugins.

## Evaluation Ledger — not a public Pack

The Evaluation Ledger records evidence used to decide whether a Policy/Visual/Provider change deserves promotion.

Examples:

- shadow modelVersion runs;
- candidate provenance;
- serving composition;
- correctness leakage;
- steerability;
- future-outcome benchmark maturity;
- Visual QC;
- Canonical identity audit outcomes;
- release/compatibility incidents.

The ledger is partly user-local and partly maintainership evidence.

It is a major ecosystem advantage because it encodes **what has actually been tested**, not just what algorithms exist.

## Pack manifest V1

Every Pack uses a small declarative manifest.

Conceptual shape:

```json
{
  "schemaVersion": 1,
  "packId": "org.picalibrary.canonical.default",
  "packType": "CANONICAL_KNOWLEDGE",
  "generation": "2026.09.19.1",
  "createdAt": "2026-09-19T00:00:00Z",
  "minimumAppVersion": "0.5.0",
  "contentLicense": "CC0-1.0",
  "publisher": {
    "id": "org.picalibrary",
    "keyId": "official-2026-01"
  },
  "dependencies": [],
  "files": [
    {
      "path": "payload/works.ndjson",
      "sha256": "<64 hex>",
      "size": 12345
    }
  ],
  "contentRootSha256": "<64 hex>"
}
```

V1 recognized `packType` values:

- `CANONICAL_KNOWLEDGE`
- `PROVIDER_INTELLIGENCE`
- `TAG_ALIAS`
- `VISUAL_INTELLIGENCE`
- `RECOMMENDATION_POLICY`

Future types require a schema revision or explicit backward-compatible extension.

## Trust model

Trust and compatibility are separate.

Possible trust levels:

- `OFFICIAL_SIGNED`
- `COMMUNITY_SIGNED`
- `LOCAL_UNSIGNED`

An official signature means:

- the Pack bytes match the publisher's signed digest;
- the Pack came from the expected publisher identity.

It does **not** mean:

- the Pack is scientifically correct;
- the Pack is safe to override user decisions;
- the Pack automatically deserves activation.

Activation still requires compatibility and policy checks.

## Signature direction

Do not invent proprietary cryptography.

Preferred future direction:

- Ed25519 publisher key;
- deterministic/canonical manifest serialization;
- SHA-256 content root over sorted Pack file records;
- detached signature over the canonical manifest/content root;
- explicit key ID and key rotation metadata.

Signature implementation is deferred until the manifest/runtime loader is ready for review.

## Dependency model

A Pack may depend on another Pack by ID and generation/version constraint.

Examples:

```text
Recommendation Policy V5
    ↓ requires
Tag/Alias Registry generation X
    ↓ optional
Visual Intelligence generation Y
```

A missing optional dependency must degrade gracefully.

Visual absence must never disable semantic/behavior recommendation.

## Runtime precedence

The runtime must preserve these principles.

### User intent wins

Explicit user controls and hard constraints are never silently weakened by a Pack.

### Raw provider identity is retained

A translated/canonical tag may improve retrieval, but the original provider-native identity remains available for audit.

### Pack replacement is reversible

A new Pack generation is additive/versioned. The previous accepted generation remains addressable until the replacement has passed its gate or has been safely garbage-collected.

### Heavy compute remains Desktop-first

Android consumes bounded portable artifacts. It does not rebuild the full Canonical graph or Visual corpus because a Pack changed.

## Security and privacy

A Pack must never contain:

- Pica email/password/token;
- E-H/ExH cookies;
- GitHub credentials;
- WebDAV credentials;
- paired-device bearer tokens;
- local absolute paths;
- private recommendation event logs;
- another user's profile;
- downloaded manga images unless the Pack has an explicit lawful content purpose and separate review.

Pack ingestion must reject:

- absolute paths;
- `..` traversal;
- duplicate file declarations;
- digest/size mismatches;
- unknown executable payloads in V1;
- incompatible schema/app versions.

## Licensing

Code and Pack content are separate licensing surfaces.

The application can remain MIT while each Pack declares its own content license.

The manifest must carry `contentLicense`.

This is not intended to revoke rights already granted under MIT.

## Why this makes copying harder without making the project closed

The official recommendation experience becomes the composition of:

```text
Private Personal State
        +
Canonical Knowledge
        +
Provider Intelligence
        +
Visual Intelligence
        +
Recommendation Policy
        +
Evaluation History
```

A third party can legally copy the open ranker.

To reproduce the same behavior they would still need to maintain:

- multi-provider semantic bindings;
- cross-provider canonical identity;
- quality-controlled Pack generations;
- Visual compatibility/QC;
- device portability semantics;
- migration compatibility;
- real evaluation history.

The moat is maintained knowledge and product integration, not obscurity.

## V1 implementation phases

### E1 — Contract

- freeze manifest fields;
- freeze Pack types;
- freeze trust levels;
- define path/digest safety rules;
- add parser/validator tests.

No runtime activation.

### E2 — Read-only loader

- discover local Packs;
- validate manifest/digests;
- display Pack inventory and compatibility;
- no recommendation mutation.

### E3 — Canonical/Provider shadow consumption

- allow selected Pack data into shadow pipelines;
- compare against current built-in registries;
- retain raw source evidence;
- no automatic serving promotion.

### E4 — Official signed distribution

- implement standard signature verification;
- add key rotation;
- add official Pack update channel;
- keep user override precedence.

### E5 — Portable foundation integration

- Desktop compiles accepted Pack knowledge into the existing Portable Foundation;
- Android receives only bounded derived artifacts relevant to the paired user;
- Android does not need the entire official knowledge corpus.

## Non-goals

V1 explicitly does not:

- create DRM;
- hide MIT source;
- run arbitrary executable plugins;
- centralize user recommendation history;
- require cloud accounts;
- upload private libraries;
- auto-promote a Pack merely because it is officially signed;
- allow Pack data to override explicit user decisions.

## Release relationship

Recommendation Ecosystem Pack V1 can be developed independently from V5 serving promotion.

The current user test cycle should not be blocked by Pack work.

Any first runtime Pack loader must ship behind a read-only or shadow-only gate until its compatibility and rollback behavior are tested.
