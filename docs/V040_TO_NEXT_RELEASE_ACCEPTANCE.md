# v0.4.0 → Next Stable Release Acceptance Contract

Status: development release gate. This document defines what must be proven before a stable release can accept users upgrading directly from public v0.4.0.

## Scope

Public v0.4.0 is the compatibility baseline for the next stable release.

Known baseline:

- Windows public version: `0.4.0`.
- Desktop database schema: `9`.
- Android package: `com.picalibrary.android`.
- Android public versionCode: `42`.
- Mutable Windows data lives outside the application directory under `%LOCALAPPDATA%\Pica Library`.

The current development database schema is newer than v0.4.0. Therefore a direct upgrade must be treated as a data-preserving full-application replacement, not as an ordinary single-schema incremental patch.

## Product requirement

### Shipped-v0.4 constraint

Public v0.4.0 can detect that a newer release requires a full install, but its already-shipped updater cannot automatically replace a complete application package. That limitation cannot be retrofitted into an installed v0.4.0 binary after publication.

Therefore there are only two honest compatibility paths:

1. **Direct full-package path** — v0.4.0 opens the official next-stable Release/full ZIP; the user extracts/replaces application files once while the external data home remains untouched.
2. **Optional bridge path** — only if a separately published bridge release is designed and validated before the next stable rollout. The bridge must itself be acceptable to the v0.4.0 incremental updater (including Schema 9 → at most 10), must not replace the legacy updater helper, and may then add future full-package update capability.

Do not claim that public v0.4.0 already supports a one-click full-package replacement. Future clients may implement that capability using an updater kept outside/reliably independent from the application tree, following the same general separation used by mature open-source Windows updaters.

Regardless of UI, the implementation must preserve this separation:

```text
old application files
        ↓ replace
new application files

%LOCALAPPDATA%\Pica Library
        ↓ preserve
config / credentials / database / downloads / cache / logs
```

A release must never instruct ordinary users to uninstall first, delete the data directory, re-import their library, or manually replay intermediate releases.

## Windows acceptance

### W1. Full application replacement

For v0.4.0 → next stable, the updater/release channel must select a full application package whenever the manifest/API/schema compatibility rules do not permit a safe incremental package.

A generic incremental ZIP must not bypass the compatibility rule merely because each database migration is individually additive.

### W2. Database migration

The public v0.4.0 schema 9 database must migrate in order through every current migration.

The automated fixture must preserve representative durable state including:

- favorites and catalog metadata;
- author identity;
- provider metadata;
- local downloaded picture paths;
- download job state;
- shelves;
- reading progress;
- application state;
- Recommendation V3 user events;
- recommendation profile/pool/batch history.

The migration must also:

- create a pre-migration backup before changing the database;
- leave that backup readable at schema 9;
- create newer Visual/Canonical tables without inventing Visual embeddings or Canonical Work bindings;
- roll back an individual failed migration without recording it as applied.

The dedicated automated regression is:

`test/integration/v040-upgrade-preservation.test.ts`.

### W3. Non-database state

Before release, one real public-v0.4.0 installation must be upgraded in place and verify preservation of:

- DPAPI-protected provider credentials;
- Pica/E-H account configuration;
- WebDAV targets;
- theme selection and theme packs;
- library root paths;
- downloads;
- shelves;
- reading history;
- recommendation history and user events;
- existing logs/caches where compatible.

These files are outside the application replacement set and must not be included in update payloads.

### W4. Failure recovery

If the new application fails its post-upgrade health check:

1. restore the previous application files;
2. preserve the migration backup;
3. do not delete user data;
4. surface a recovery message with the failed target version and diagnostic location.

## Android acceptance

The current Recommendation V5 Dev APK is intentionally side-by-side and is **not** evidence of production OTA compatibility.

A production upgrade test must use:

```text
FROM:
packageName = com.picalibrary.android
versionCode = 42
official v0.4.0 signing certificate

TO:
packageName = com.picalibrary.android
versionCode > 42
same signing certificate
```

The next stable Android build must be installed with an in-place upgrade operation. Uninstall/reinstall is not an acceptable release test.

After upgrade, verify preservation of:

- local provider/account state;
- reading history;
- local library state;
- pairing/device identity;
- portable recommendation state;
- queued recommendation mutations;
- theme/settings state;
- any Android-local provider session explicitly configured by the user.

The Dev package `com.picalibrary.android.dev` remains a QA-only identity.

## First-run behavior after upgrade

### Visual

A public v0.4.0 user may have no Visual V1 assets.

Missing Visual data must never block the recommendation system.

Expected behavior:

1. normal semantic/behavior recommendation remains available;
2. Visual starts unavailable or SHADOW with zero coverage;
3. Desktop may progressively prepare embeddings when explicitly allowed;
4. LIVE Visual influence requires its own review gate.

### Canonical Work Identity

A public v0.4.0 user may have no Canonical Work bindings.

Expected behavior:

1. existing `comic_id` values remain valid;
2. evidence-only candidate backfill may run;
3. no automatic physical merge or destructive ID rewrite occurs;
4. materialization stays behind its independent controlled gate.

## Release blockers

The next stable release is blocked if any of the following is true:

- schema 9 → current migration regression fails;
- a public v0.4.0 data fixture loses durable state;
- Windows upgrade requires deleting the data directory;
- Android production package name changes;
- Android target versionCode is not greater than 42;
- Android production signing identity differs from public v0.4.0;
- the release requires users to uninstall Android first;
- missing Visual/Canonical assets prevent normal recommendation;
- rollback would delete or overwrite user data.

## Release strategy

### Public v0.4.0 direct path

If no validated bridge release is deliberately shipped, the supported direct path is:

```text
v0.4.0
  ↓ check update
next stable requires full package
  ↓ official Release/full ZIP
close old application
  ↓ replace application directory only
preserve %LOCALAPPDATA%\Pica Library
  ↓ launch new version
schema 9 → current migrations
  ↓ health/data verification
```

This is a one-time application replacement, not a data migration/re-import and not an uninstall.

### Future-client preferred behavior

Once a client ships a separately testable full-package updater helper, later releases may provide:

```text
v0.4.0
  ↓ check update
next stable available
  ↓ compatibility decision
full application upgrade required
  ↓ download + verify official package
preserve local data home
  ↓ replace application
launch new version
  ↓ schema 9 → current migrations
health check
  ↓
success / automatic application rollback
```

This is intentionally different from chaining users through multiple intermediate releases.

## Relationship to the current Dev acceptance builds

The `664b4bad` Windows/Android acceptance builds remain for Recommendation V5 product testing. They do not authorize a stable release and do not replace the production-upgrade acceptance described here.
