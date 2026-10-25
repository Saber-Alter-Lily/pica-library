# Source-idle boundary: independent unpublished cloud candidate

This candidate is based on frozen PR207 `1b7a9184eca11f73b295a55827d2cddee34dc69c`. The local product/test changes are sealed at `a723fbe29bc4323dddeb7370c37721dd6a4789bd`; the following cloud-preparation commit changes only the candidate workflow/version regression and progress/acceptance documentation. Exact final head and artifact hashes must be recorded after building. PR206/207 and their prior installables remain immutable.

## Product behavior being validated

- Default core and CLI contexts enable no external source. The CLI explicitly accepts `--sources pica,eh,jm` or `--sources none`; existing intentional online automation must opt in. Desktop still honors saved source policy and documented legacy config compatibility rather than logging users out or deleting data.
- Opening the JM account section reads a local allowlisted snapshot only. Cached identity/remembered state is not a new verification. **Connect / restore sign-in** explicitly invokes the existing account/worker path and cannot enable a disabled source.
- The connect command retains the existing Desktop host/origin/CSRF boundary, accepts only an empty JSON object, bounds it to4096bytes, and gives constant media/parse/size errors. Its opt-in Node input iterator avoids premature stream destruction; other body-reader callers retain their old default.
- Fifty historical fixture/harness files explicitly request their original enabled-source test context instead of depending on the former implicit default. Product code never imports the test helper; source-free tests do not use it.

[Source/CLI compatibility](SOURCE_IDLE_BOUNDARY.md) and [actual callback/Node-stream tests](JM_VIRTUAL_ROUTING_VALIDATION.md) describe the source-level evidence and retained counterexamples.

## Evidence and update boundary

At a723,135 selected assertions/18suites, strict TypeScript and Web51 syntax passed. A separate23-case/4suite check used actual update-planner/builder code with owned non-executable synthetic archives;22 dependency/schema/module/updater source inputs matched frozen PR207. The selections overlap and are not158 unique assertions.

These checks do not execute an application, socket, updater or real provider and are not compiled-package or user-data-retention proof. Same module/schema metadata permits incremental planning only when the actual generated package also qualifies. Changed updater/helper bytes must use the existing **one application update action → full application replacement** path, not per-module installers or manual data deletion.

The current cloud build must run full Linux/Windows tests, source-JVM, Chromium and signed Android checks, plus actual isolated Windows runtime, HTTP/media/local ingestion/recommendation/audit, incremental/full replacement and forced rollback gates. Failures must be kept and explained; no old-green substitution, hidden skip, test timeout relaxation or rerun-as-fix claim.

## Candidate and safety contract

- New branch/Draft only: `codex/source-idle-boundary-20261025`, stacked on the frozen PR207 branch. Never alter PR207 head/base/body/state as part of this preparation.
- Reuse `next-consolidated-acceptance.yml`; the explicit allowed branch is added without changing public-repository, owner or non-PR signing gates. Read-only repository permissions stay unchanged.
- Dev versionCode84 uses the same `com.picalibrary.android.dev` identity and fixed certificate `64fb87dc7d8bd6bc7b2cec92cc8c83fad3afe8cfb07591a2e53d53cbd3ab2f9d`. Only existing Actions Secrets may be used; the private key never comes to this PC.
- Windows remains isolated under `%LOCALAPPDATA%\Pica Library Post Stable RC`. Do not install/deploy automatically or copy official databases. No production credentials, account sessions, comics, embeddings or feedback are part of this build.
- No local Java/Gradle/apksig/JM worker, app/browser/listener or full/incremental update execution. Permission-sensitive verification is confined to disposable authorized CI fixtures.
- No main merge, tag/Release, stable OTA, production data, automatic installation, uninstall or deployment.

## Still not complete

Real Provider/login behavior, physical Android/Windows/OEM/gestures, AI-returned file UX, account/sync parity, generic source identities/trust/native host integration and the full modular local-reader objective remain open. Automated source and package success is not human acceptance or legal clearance. This project remains a reader/library: users choose their sources, and no source catalogue or comic body is bundled by this change.
