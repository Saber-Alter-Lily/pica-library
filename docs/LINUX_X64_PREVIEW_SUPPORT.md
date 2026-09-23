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
4. keep user data outside the application package;
5. smoke the packaged Desktop/headless runtime;
6. run the packaged vertical acceptance for library query/detail, shelves, Reader pages/progress, download pause/resume, graceful shutdown and restart persistence;
7. keep self-update and formal-distribution capabilities disabled;
8. report credential persistence from the live OS session, falling back to session-only memory when Secret Service is unavailable.

## Gates still open before Linux can be called a user preview

Automated CI does not replace real Linux desktop validation. Before promotion beyond internal experimental status, retain separate evidence for:

- an authorized real Provider login and ordinary browse/detail/read flow on Linux;
- Secret Service persistence in a real graphical session;
- native folder/save picker behavior in at least one GNOME/Zenity and one KDE/KDialog environment, or an explicit narrower support statement;
- application-package replacement using the same external data root, followed by migration/rollback checks when a newer preview build exists;
- at least one environment close to the declared glibc baseline, not only the current GitHub-hosted runner;
- cold start, long-reader and task-concurrency measurements on reference hardware.

Until those gates are recorded, `distributionReady` and `selfUpdate` remain false for Linux.
