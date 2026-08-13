# Test Report

Environment: Windows local validation and GitHub-hosted Ubuntu runners, pnpm
`11.16.0`, 2026-08-13. The exact RC2 SHA is bound after the one-commit freeze
by the final review package; this report is included in that commit.

| Gate | Result |
| --- | --- |
| frozen install | PASS |
| TypeScript | PASS |
| full Vitest suite | PASS, 21 files, 84 tests |
| unit tests | PASS |
| integration/migration tests | PASS |
| ESLint | PASS, zero warnings |
| Prettier | PASS |
| Web JavaScript syntax | PASS |
| Rollup build | PASS |
| built CLI smoke | PASS |
| `git diff --check` | PASS |
| tracked source credential-pattern scan | PASS |
| Node 22 GitHub CI | Pending exact-SHA freeze |
| Node 24 GitHub CI | Pending exact-SHA freeze |

Coverage includes download scheduling and state transitions, retry quiescence,
cumulative byte accounting, pause/resume/cancel, maintenance/repair, SQLite
migrations, Bundle validation, Browser Lite state and 1770-record rendering,
Recommendation V2 ranking/recall bounds, cover API/cache, media authentication
separation, and private-caller workflow privacy contracts.

Actual browser QA used only synthetic/previously sanitized Browser Lite state.
Actual provider validation is summarized without titles or credentials in the
live validation reports.
