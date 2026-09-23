# Windows ARM64 preview support boundary

Status: **experimental CI artifact only**. This is not a formal Windows ARM64 release channel.

## Runtime baseline

The experimental package is built and tested on GitHub's native `windows-11-arm` hosted runner and bundles the official Node.js 24.15.0 `win-arm64` runtime.

The current boundary is:

- Windows 11 on ARM64;
- native ARM64 Node.js runtime;
- managed AnyCPU launcher that starts the bundled ARM64 Node process;
- the same external Pica Library user-data root used by Windows x64;
- Windows DPAPI for persistent credentials.

The existing formal Windows x64 package and release/update chain remain unchanged.

## Automated evidence required

The Windows ARM64 experimental workflow must:

1. run on a native ARM64 Windows hosted runner;
2. download the pinned official Node.js `win-arm64` ZIP and verify its upstream SHA-256;
3. require the packaged runtime itself to report `win32/arm64`;
4. build a managed AnyCPU `Pica Library.exe` launcher from the same launcher source used by Windows x64;
5. import and reopen a synthetic library through the packaged CLI;
6. launch the packaged Desktop engine through `Pica Library.exe`;
7. report `platform=windows`, `arch=arm64`, `distributionReady=false` and `selfUpdate=false`;
8. report Windows DPAPI and WinForms picker capability from the actual ARM64 runtime;
9. save synthetic credentials through the real Desktop settings API, verify the DPAPI file is created without plaintext secret material, restart the process, and verify credentials reload;
10. exercise library query/detail, shelf membership, downloaded Reader content/progress, download pause/resume, graceful shutdown and restart persistence;
11. keep SQLite/user state outside the application package;
12. build the first accepted Windows ARM64 preview and the current candidate as distinct packages, replace the application tree while reusing one external data root, verify library/shelf/download state survives, then restore the pre-upgrade data snapshot and baseline package and verify candidate-only state disappears;
13. require the normal pre-migration database backup if a future ARM64 candidate raises the database schema;
14. keep formal distribution and self-update disabled.

No real Provider credentials or manga assets are used by this gate.

## Gates still open before Windows ARM64 can be called a user preview

Before promotion beyond internal experimental status, retain separate evidence for:

- an authorized real Provider login plus ordinary browse/detail/read/download flow on a physical Windows ARM64 device;
- real browser launch, folder/save picker and managed E-H browser behavior in an interactive ARM64 desktop session;
- installer/shortcut/uninstall UX appropriate for ordinary Windows ARM users rather than only an extracted ZIP;
- a schema-changing ARM64 preview migration/rollback when a future candidate raises the database schema; the current automated gate already covers same-schema full-package replacement and external-data snapshot rollback;
- cold start, long-reader, visual-task and concurrent-download measurements on reference ARM64 hardware;
- release provenance, signing/reputation policy and support messaging appropriate to a public ARM64 channel.

Until those gates are recorded, Windows ARM64 remains experimental and does not participate in the formal self-update channel.
