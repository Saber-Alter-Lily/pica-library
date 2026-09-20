# Windows Updater Framework Review — 2026-09-19

Status: architecture decision record; no updater migration is authorized by this document.

## Context

Public v0.4.0 already ships a custom incremental updater. The next development schema is no longer incrementally compatible with that public baseline, while mutable user state is intentionally stored outside the application directory.

The immediate release problem and the long-term updater problem are different:

1. **Immediate:** preserve v0.4.0 user data while moving to the next stable application.
2. **Long-term:** provide reliable full-package and delta updates without maintaining increasingly complex self-replacement logic ourselves.

## Open-source references reviewed

### Velopack

Fit: strongest long-term candidate.

Relevant properties:

- MIT licensed;
- installer + automatic update framework;
- language-agnostic;
- supports full packages and delta updates;
- supports self-updating portable/application packaging;
- current active development;
- designed as a successor/migration path for Squirrel-style applications.

Why it fits Pica Library:

- our Windows package already separates mutable `%LOCALAPPDATA%\Pica Library` state from application files;
- Node/runtime assets can remain self-contained application payload;
- the updater lifecycle can be delegated to a maintained external framework instead of extending custom replacement code indefinitely.

### WinSparkle

Fit: viable but weaker for our target architecture.

Relevant properties:

- mature open-source Windows update framework;
- C API / C# bindings;
- appcast-based update discovery;
- downloads and launches an installer.

Trade-off:

- it is primarily an update-discovery/installer-launch model;
- it does not directly map as naturally to our current portable/full-package + delta ambitions as Velopack.

### Squirrel.Windows

Fit: proven architecture reference, but not the preferred new dependency.

Relevant properties:

- established per-user Windows installation/update model;
- delta packages and update channels;
- long history and broad adoption.

Trade-off:

- older architecture and larger migration/history burden;
- Velopack explicitly covers the modern successor use case more directly.

## Decision

### For the next stable release

**Do not migrate the production package to Velopack yet.**

Reasons:

- the current Windows + Android acceptance build is under real-user testing;
- changing installer/update framework now would invalidate a large part of that acceptance surface;
- public v0.4.0 cannot retroactively gain a new full-package updater;
- the existing data-separation and migration gates already provide a safe direct full-package path.

For the next stable release, keep:

- current Windows application layout;
- external mutable data home;
- schema migration backup;
- official checksum verification;
- explicit full-package path for incompatible v0.4.0 upgrades;
- source-scoped incremental asset naming for future-compatible releases.

### After the next stable baseline exists

Run an isolated **Velopack PoC**.

PoC acceptance must prove:

1. `%LOCALAPPDATA%\Pica Library` remains the same authoritative mutable data home.
2. Existing DPAPI credentials remain readable.
3. Library DB/downloads/shelves/history are never packaged as application payload.
4. install/update works without administrator privileges for the normal per-user case.
5. rollback does not delete user data.
6. GitHub Release publication can carry all required Velopack metadata/assets.
7. app startup/CLI/local-server behavior remains unchanged.
8. current custom updater can be retired only after at least one stable migration path is proven.
9. unsigned/reputation behavior is documented separately from updater correctness.

## v0.4.0 constraint

No framework choice can make the already-published v0.4.0 binary acquire new code before it updates.

Therefore public v0.4.0 has two honest paths:

- direct full-package replacement using the existing Release link while preserving the external data home; or
- an explicitly published compatible bridge release before a later major rollout.

Do not construct a partially-installed "fake target version" bootstrap merely to claim one-click migration.

## Relationship to source-scoped update assets

Newer Pica Library clients prefer:

`Pica-Library-v<target>-update-from-v<source>.zip`

before the legacy generic:

`Pica-Library-v<target>-update.zip`

For a release that is not incrementally compatible with public v0.4.0, the legacy generic asset must be absent. This lets the shipped v0.4.0 updater fall into its existing full-install path instead of downloading a package that it cannot safely apply.

## Revisit gate

Re-evaluate Velopack only after:

- current two-client acceptance is closed;
- next stable release packaging requirements are frozen;
- Android production OTA path is independently proven;
- Recommendation V5 serving/promotion decisions are not being changed in the same release-engineering pass.
