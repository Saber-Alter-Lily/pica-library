# Windows Packaging Decision

## Decision

Pica Library v0.1.1 uses a bundled official Node.js 24 Windows x64 runtime,
Rollup application output, static Web assets, and one small .NET Framework
launcher named `Pica Library.exe`.

The launcher locates only files beside itself and starts the packaged runtime
without a console window. Mutable data is stored per user under Local AppData,
outside the extracted application directory. Users do not need Node.js, npm,
pnpm, Git, PowerShell commands, or administrator access.

## Why This Architecture

The application uses the stable built-in `node:sqlite` implementation and has
no third-party native `.node` addon. It does, however, intentionally use
dynamic static assets, filesystem storage, child processes for Windows-native
integration, and a long-running loopback server. A bundled runtime preserves
normal Node resolution and makes those behaviors easy to inspect and test.

## Rejected Alternatives

- Node SEA: technically possible, but embedding and locating dynamic Web
  assets while retaining predictable `node:sqlite` and ESM behavior adds
  fragility without improving the one-click user contract.
- Electron: unnecessary because the existing browser UI is the product UI;
  it would add a second browser runtime and a much larger maintenance surface.
- Tauri: would require a new Rust/native application layer and broader rewrite.
- pkg/nexe: third-party runtime patching is less maintainable than shipping the
  official runtime directly.

Single-file purity is not a goal. Reliability and one obvious executable are.
