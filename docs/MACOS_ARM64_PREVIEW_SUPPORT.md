# macOS arm64 preview support boundary

Status: **experimental CI artifact only**. The current archive is not a signed
or notarized macOS application release.

## Runtime baseline

The experimental package bundles the official Node.js 24.15.0
`darwin-arm64` runtime.

The declared runtime boundary is:

- Apple Silicon / arm64;
- macOS 13.5 or newer;
- official Node.js darwin-arm64 runtime;
- external user-data root under the native Pica Library macOS data location.

The build reads the bundled Node Mach-O `LC_BUILD_VERSION` minimum OS version
and fails if that runtime requires a newer macOS version than the package
declares. `PLATFORM_REQUIREMENTS.json` records both the declared and observed
runtime values.

Node.js currently lists macOS arm64 >= 13.5 as a Tier 1 platform and builds its
official darwin-arm64 binaries with a 13.5 deployment target.

## Automated evidence already required

The macOS experimental workflow runs on a native Apple Silicon
`macos-15` runner and must:

1. download the pinned official Node darwin-arm64 runtime and verify its
   upstream SHA-256;
2. verify arm64 platform identity and the declared/observed minimum macOS
   runtime boundary;
3. start the packaged Desktop engine without a GUI in headless mode;
4. report macOS Keychain as the secure persistent credential backend;
5. report the native AppleScript folder/save picker capability without claiming
   that the CI job has completed an interactive picker session;
6. keep all SQLite/user data outside the application archive;
7. import and reopen a synthetic library using the packaged CLI;
8. run the packaged local Web/API flow for library query, comic detail, shelf
   membership, downloaded Reader pages/progress, download pause/resume,
   graceful shutdown and restart persistence;
9. save synthetic credentials through the real Desktop settings API into an
   isolated temporary macOS Keychain, prove the secret does not appear under
   the Pica data root, restart the process, and prove the credentials reload
   from Keychain;
10. build the first accepted W4A macOS preview and the current candidate as distinct archives, replace the application tree at the same install path while retaining one external data root, verify library/shelf/task state survives, then restore the pre-upgrade data snapshot and baseline application tree to prove rollback removes candidate-only state;
11. build a self-contained `Pica Library.app` with bundle identifier `org.picalibrary.desktop`, a native `.icns` icon, embedded runtime/application/Web resources, and a standard `Info.plist`; copy the app away from the archive wrapper tree and launch it through macOS LaunchServices to prove the bundle is independently runnable;
12. keep `distributionReady=false`, `selfUpdate=false`,
    `signed=false` and `notarized=false`.

No real Provider credentials or manga assets are used in this automated flow.

## Gates still open before macOS can be called a user preview

The current tarball is useful for architecture validation, not ordinary-user
distribution. Promotion requires separate evidence for:

- an authorized real Provider login plus ordinary browse/detail/read/download
  flow on macOS;
- a real interactive native folder picker and save picker session;
- normal browser launch and `.command`/application launch behavior in a
  graphical user session;
- ordinary-user graphical launcher UX validation on a real Mac; the automated gate now proves a self-contained `.app`, Bundle ID, icon resources and LaunchServices startup, but does not substitute for Finder/Dock usability review;
- Developer ID signing, hardened runtime where appropriate, notarization and
  Gatekeeper acceptance;
- a schema-changing macOS preview migration/rollback when a future candidate raises the database schema; the current automated replacement gate already covers same-schema application replacement and external-data snapshot rollback;
- at least one runtime test near macOS 13.5 instead of relying only on the
  current macOS 15 hosted runner;
- cold start, long-reader and task-concurrency measurements on reference Apple
  Silicon hardware.

Until those gates are recorded, macOS remains experimental and does not
participate in the formal self-update channel.

## Distribution implementation references

The formal signing/notarization phase should reuse the platform's standard
`codesign`, `notarytool`, `stapler` and Gatekeeper verification flow
instead of inventing a custom trust scheme.

Open-source release tooling such as NotarizeMacApp and Anchore Quill is useful
as a reference for signing/notarization/stapling automation. Any eventual
dependency choice must still preserve Pica Library's small Node-backed runtime,
external data directory and existing release provenance checks.
