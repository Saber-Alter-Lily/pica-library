# Test Report

Environment: Windows, Node `v24.0.0` compatible runtime, pnpm `11.16.0`, 2026-08-12.
Tested code SHA: `a950902be1fda0dbd50146da024f7fbc34216903`.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS, lockfile already up to date |
| `pnpm type:check` | PASS |
| `pnpm test` | PASS, 14 files, 39 tests |
| `pnpm test:integration` | PASS, 3 migration tests (included above) |
| `pnpm lint` | PASS exit code, 0 errors, 4101 Prettier warnings (mostly imported CRLF formatting) |
| `pnpm web:check` | PASS |
| `pnpm build` | PASS, `dist/pica-library.js` generated |
| `pnpm benchmark small` | PASS synthetic harness smoke; not a speed claim |
| `git diff --check` | PASS |
| tracked/history secret scan | PASS, no secrets detected |

Browser QA used the real local server at desktop 1280x720 and mobile 390x844.
Home, Downloads, Maintenance and author subview navigation were exercised; there was
no document-level horizontal overflow and no console error. No real Pica credentials
or downloaded comics were used in automated tests.
