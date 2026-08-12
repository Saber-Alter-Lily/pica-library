# Test Report

Environment: Windows local validation and GitHub-hosted Ubuntu runners, pnpm
`11.16.0`, 2026-08-13. Final tested code SHA:
`718149f85491b1b205911cb804a0d490e5022e0f`.

| Gate | Result |
| --- | --- |
| frozen install | PASS |
| TypeScript | PASS |
| full Vitest suite | PASS, 21 files, 78 tests |
| unit tests | PASS |
| integration/migration tests | PASS |
| ESLint | PASS, zero warnings |
| Prettier | PASS |
| Web JavaScript syntax | PASS |
| Rollup build | PASS |
| built CLI smoke | PASS |
| `git diff --check` | PASS |
| tracked source credential-pattern scan | PASS |
| Node 22 GitHub CI | PASS |
| Node 24 GitHub CI | PASS |

Coverage includes download scheduling and state transitions, retry quiescence,
cumulative byte accounting, pause/resume/cancel, maintenance/repair, SQLite
migrations, Bundle validation, Browser Lite state and 1770-record rendering,
Recommendation V2 ranking/recall bounds, cover API/cache, media authentication
separation, and private-caller workflow privacy contracts.

Actual browser QA used only synthetic/previously sanitized Browser Lite state.
Actual provider validation is summarized without titles or credentials in the
live validation reports.
