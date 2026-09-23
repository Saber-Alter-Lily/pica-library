# Linux x64 preview support boundary

Status: **experimental CI artifact only**. This document does not promote Linux to a formal release target.

## Runtime baseline

The current experimental archive bundles the official Node.js 24.15.0 `linux-x64` runtime. The package boundary is therefore:

- GNU/Linux on x86-64;
- glibc 2.28 or newer;
- tested support baseline: Linux kernel 4.18 or newer;
- libstdc++ providing `GLIBCXX_3.4.25` or newer;
- the current tarball is a glibc package, not an Alpine/musl package.

Reference: Node.js `BUILDING.md` platform list and official binary toolchain notes.

The launcher rejects the wrong CPU architecture and glibc versions below 2.28 before starting Node.js. A kernel below 4.18 is reported as outside the tested support baseline rather than being silently described as supported.

## Automated evidence already required

The Linux experimental workflow must:

1. download the pinned official Node runtime and verify its upstream SHA-256;
2. inspect the bundled ELF and fail if its observed GLIBC/GLIBCXX symbol requirements exceed the declared package baseline;
3. run the package launcher, which performs the runtime preflight;
4. run the exact packaged runtime inside a Rocky Linux 8.9 x86-64 userspace and require the live `glibc 2.28` environment to start the CLI, headless engine, local HTTP API and graceful shutdown successfully;
5. keep user data outside the application package;
6. smoke the packaged Desktop/headless runtime;
7. run the packaged vertical acceptance for library query/detail, shelves, Reader pages/progress, download pause/resume, graceful shutdown and restart persistence;
8. build the first accepted W4A Linux preview baseline and replace that application tree with the candidate while reusing one external data root; verify library/shelf/download state survives, then restore the pre-upgrade data snapshot and the old application tree and verify rollback;
9. if a candidate raises the database schema above that baseline, require the normal pre-migration database backup before the replacement gate can pass;
10. keep self-update and formal-distribution capabilities disabled;
11. report credential persistence from the live OS session, falling back to session-only memory when Secret Service is unavailable.

The Rocky container gate closes the runtime-ABI portion of the lower-bound check. It does not test a graphical desktop session, system tray behavior, desktop launchers, Secret Service integration, or native pickers.

## Gates still open before Linux can be called a user preview

Automated CI does not replace real Linux desktop validation. Before promotion beyond internal experimental status, retain separate evidence for:

- an authorized real Provider login and ordinary browse/detail/read flow on Linux;
- Secret Service persistence in a real graphical session;
- native folder/save picker behavior in at least one GNOME/Zenity and one KDE/KDialog environment, or an explicit narrower support statement;
- a schema-changing Linux preview must still exercise the migration-specific rollback path on real preview packages; the current replacement gate covers distinct source builds and data-snapshot rollback, but both packages currently use the same database schema;
- at least one real graphical Linux desktop session on a distribution close to the declared glibc baseline; the Rocky Linux 8.9 container covers runtime ABI only and does not substitute for desktop integration;
- cold start, long-reader and task-concurrency measurements on reference hardware.

Until those gates are recorded, `distributionReady` and `selfUpdate` remain false for Linux.
