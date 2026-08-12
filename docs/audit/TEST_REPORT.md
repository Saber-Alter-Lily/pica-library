# Test Report

Environment: Windows local validation, pnpm `11.16.0`, 2026-08-12.
Tested code SHA: `e05618ccfef17fce19da19c73cec4a626b8122e0`.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS, lockfile already up to date |
| `pnpm type:check` | PASS |
| `pnpm test` | PASS, 19 files, 57 tests |
| `pnpm test:unit` | PASS, 18 files, 54 tests |
| `pnpm test:integration` | PASS, 1 file, 3 tests |
| `pnpm lint` | PASS, 0 errors, 0 warnings (`--max-warnings=0`) |
| `pnpm format:check` | PASS, 0 formatting warnings |
| `pnpm web:check` | PASS for `app.js` and `lite-state.js` |
| `pnpm build` | PASS, Rollup output generated |
| `git diff --check` | PASS; Windows displayed informational LF/CRLF conversion notices only |
| tracked/history secret scan | PASS, no GitHub token, AWS key, private key or non-empty account/password assignment detected |

GitHub Actions actual results for the tested SHA:

| Runtime | Result | Jobs |
| --- | --- | --- |
| Node 22 | PASS | push and pull-request jobs, 42s and 38s |
| Node 24 | PASS | push and pull-request jobs, 39s and 34s |

An earlier run on `589b4092d9a0750bade97db95550810ac1a2ad43` failed at
type-check because `.gitignore` accidentally excluded `src/core/downloads/media-gate.ts`.
The ignore rule was anchored to `/downloads/`, the source file was committed, and all
four jobs passed on the tested SHA. This failure is retained here as audit history.

Browser QA loaded the real static site at `http://127.0.0.1:4173` and confirmed a
nonblank Browser Lite first screen with correct Chinese text, navigation, mode and
zero-state metrics. Bundle/state behaviors are covered by automated pure-model tests;
the in-app file chooser could not complete the local upload interaction, so that
specific UI gesture is not claimed as browser-automated. No real Pica credentials or
downloaded comics were used.
