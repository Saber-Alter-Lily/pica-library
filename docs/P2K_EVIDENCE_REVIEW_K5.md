# P2-K Evidence Review / Completeness Audit — K5

Status: **candidate / source-contract validation pending / no budgets selected**

Parent:
- P2-K real benchmark matrix;
- K1 Windows x64 reference evidence;
- K2 Android G18/G19 physical evidence;
- K3 Android real download/Reader evidence;
- K4 Windows/Android manual task-control acceptance;
- P2-F low-end Windows/browser trace;
- J7B real Provider and J10 real Visual evidence.

## Purpose

K5 is a **read-only evidence review layer**. It does not introduce another
benchmark framework and it does not rerun workloads.

The existing collectors already produce the authoritative raw evidence. K5
answers a narrower question before any P2-C3 or release-budget decision:

> Do we actually have the required evidence categories, from authoritative
> platforms, on a coherent commit, with intact files?

K5 reuses the repository's existing JSON + SHA-256 evidence conventions rather
than introducing a new dependency or report format.

## Required evidence categories

A structurally complete K5 review requires at least one valid source for each:

1. `WINDOWS_K1_REFERENCE`
2. `ANDROID_K2_G18_G19`
3. `ANDROID_K3_DOWNLOAD`
4. `ANDROID_K3_READER`
5. `WINDOWS_K4_MANUAL`
6. `ANDROID_K4_MANUAL`
7. `J7B_REAL_PROVIDER`
8. `J10_REAL_VISUAL`
9. `WINDOWS_LOW_END_TRACE`

This is **structural completeness only**. It does not decide that one run is
enough, does not choose an acceptable variance, and does not set a latency,
frame, memory or concurrency threshold.

## Inputs

### K1 / K2 / K4 manifest roots

Pass the evidence root containing:

- `p2k-evidence-manifest.json`;
- `environment.json`;
- `run-status.json`;
- the manifest-indexed raw evidence files.

K5 independently rechecks:

- every indexed file exists;
- byte count and SHA-256 match;
- exact commit is valid and agrees with embedded environment/run-status;
- `complete=true`;
- dirty evidence is rejected for promotion;
- no budget/capacity was preselected;
- required run IDs are actually present and successful;
- K1 declares native Windows x64;
- K2/K4 Android declares a physical non-emulator device with hashed identity;
- K4 declares human-judgment authority;
- Windows K4 declares native-Windows authority.

This prevents a hand-edited `complete=true` manifest from bypassing the earlier
collector contracts.

### K3 real-load roots

K3 remains an approved standalone physical-evidence format. K5 accepts a root
containing `session.json` plus the current run's `*benchmarkData.json`.

K5 rechecks:

- exact commit;
- clean promotion authority;
- physical non-emulator Android;
- hashed device identity;
- `syntheticMediaAccepted=false`;
- `rawIdsPersisted=false`;
- successful benchmark exit;
- Reader evidence contains only hashed comic/chapter identities;
- no budget/capacity was preselected.

K3 now writes every physical run to a separate timestamped directory by default.
An explicit `--result-dir=PATH` may be used, but a non-empty target is refused.
Benchmark artifacts are selected only if they were generated after the current
run marker; the old 90-minute artifact window is no longer used.

### Standalone external evidence sidecars

J7B real Provider evidence and the low-end Windows/browser trace are not generic
K1/K2/K4 manifests. K5 accepts a small sidecar JSON via `--external=...`.

Supported `evidenceType` values:

- `p2-k-j7b-real-provider`
- `p2-k-j10-real-visual`
- `p2-k-windows-low-end-trace`

J10 normally comes from a K1 run with `-IncludeVisual`; the standalone J10 type
exists only for a separately archived approved real-model run.

Sidecar example:

```json
{
  "schemaVersion": 1,
  "evidenceType": "p2-k-j7b-real-provider",
  "commit": "40-character-git-sha",
  "dirty": false,
  "complete": true,
  "budgetSelected": false,
  "concurrencyCapacitySelected": false,
  "environment": {
    "platform": "win32",
    "architecture": "AMD64"
  },
  "artifacts": [
    {
      "path": "j7b-result.json",
      "bytes": 12345,
      "sha256": "64-character-sha256"
    }
  ]
}
```

Artifact paths are relative to the sidecar directory. K5 verifies each hash.
Do not put Provider credentials, cookies, bearer tokens, raw Android serials or
other secrets in the sidecar or its artifacts.

## Review command

```bash
node scripts/benchmark/review-p2k-evidence.mjs \
  --root=<K1_ROOT> \
  --root=<K2_ROOT> \
  --root=<K3_DOWNLOAD_ROOT> \
  --root=<K3_READER_ROOT> \
  --root=<WINDOWS_K4_ROOT> \
  --root=<ANDROID_K4_ROOT> \
  --external=<J7B_SIDECAR_JSON> \
  --external=<LOW_END_WINDOWS_TRACE_SIDECAR_JSON> \
  --target-commit=<EXACT_RC_COMMIT> \
  --output=test-results/p2k/review/p2k-evidence-review.json
```

Use `--require-complete` when the caller wants missing/invalid evidence to
produce a non-zero exit code.

## Output semantics

K5 emits one machine-readable review.

Possible high-level states:

- `EVIDENCE_INCOMPLETE`
- `READY_FOR_HUMAN_VARIANCE_AND_BUDGET_REVIEW`

The second state means only:

- all nine structural categories are present;
- each supplied authority/integrity check passed;
- valid evidence is commit-coherent.

It **does not** mean:

- P2 is complete;
- performance is acceptable;
- a sufficient repetition count has been selected;
- a release budget exists;
- P2-C3 concurrency enforcement is authorized.

The report therefore always retains:

- `humanVarianceReviewRequired=true`;
- `minimumRepetitionCountSelected=false`;
- `budgetSelected=false`;
- `concurrencyCapacitySelected=false`.

## What remains external after K5 source acceptance

The repository still cannot manufacture representative hardware evidence in CI.
Actual execution remains required for:

- K1 on representative Windows x64 hardware;
- K2 G18/G19 on representative physical Android;
- K3 real download + Reader on the same release-candidate commit;
- K4 native-Windows and physical-Android human acceptance;
- J7B with an approved real Provider/network context;
- J10 real DINOv2 cold/warm evidence;
- low-end Windows/browser CPU + jank trace.

After those results are collected, use K5 to verify the matrix first. Only then
perform the human variance review and decide whether P2-C3 capacities or formal
release thresholds are justified.
