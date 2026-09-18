# Web UX Audit — V5 Development

Status: active manual-QA audit. This document tracks product UX, not scientific/recommendation promotion.

## Audit rules

Every surface is reviewed for:
1. information hierarchy and understandable copy;
2. primary vs secondary vs destructive actions;
3. loading, success, empty and failure feedback;
4. keyboard, scroll and dialog behavior;
5. responsive layout;
6. no hidden heavy work on page open;
7. no change to recommendation serving authority unless separately approved.

## Surface matrix

| Surface | Current finding | Action |
| --- | --- | --- |
| Global header/navigation | Functional; mixed legacy/new spacing and weak focus/disabled states | Normalize hierarchy, focus-visible, disabled/busy states, sticky navigation |
| Home | Connected and Browser Lite concepts compete for attention | Keep connected quick actions primary; demote destructive/local-reset action |
| Library | Filter, view and batch actions are one long toolbar | Split view controls, collapsible filters and contextual selection actions |
| Shelves | Two-column layout works but selection/empty states are weak | Improve active shelf, empty state and responsive split |
| Discover / recommendation | Primary action, restart, view controls and batch actions have equal weight | Separate generation, browsing and selection actions; clearer batch status |
| Online search | Provider/sort/filter controls are dense | Group source/filter options and preserve simple keyword-first flow |
| Reader | Exit can scroll out of reach; origin scroll is not restored | Fixed compact header, persistent exit, Esc key, page/view scroll restoration |
| Downloads | Dense controls; history and active jobs compete | Keep active work prominent; collapse advanced performance/history controls |
| Downloaded | Mostly stable; view controls should match Library | Normalize toolbar and empty state |
| Collection Chronicle | Visually distinct and stable | Preserve; only normalize outer actions/focus |
| Settings hub | Good category split, but recommendation page exposes development tools directly | Separate normal controls from collapsed Experiment & Diagnostics area |
| Pica account/proxy | Functional but mixed English/Chinese and too many peer actions | Clarify primary save/test and demote utilities |
| E-H / ExH | Functional; account actions still dense | Keep web login primary; advanced cookie/actions collapsed |
| Mobile bridge | Functional; manual code flow is verbose | Keep current fallback; QR-first pairing planned separately |
| Remote storage | Functional; scan/save/sync need clearer sequence | Present as Test → Save → Scan → Sync with explicit status |
| Software update | Functional | Keep; normalize status, disabled/busy and destructive/restart feedback |
| Maintenance | Many developer-like utilities | Group by task and keep destructive actions explicit |
| Recommendation V5 controls | Algorithm exists but control discoverability is weak | Make 1–10 controls the primary content; move algorithm explanation to advanced help |
| Visual V1 QC | Useful for QA but not normal-user settings | Move under Experiment & Diagnostics; keep manual-only heavy work |
| Work identity P2A | Useful for QA; now visual/detail-capable | Move under Experiment & Diagnostics; undecided-first |
| V5 Evaluation | Correct but too engineering-heavy | Show human-readable progress first; technical gates/version/LTR collapsed |
| Dialogs/toasts | Inconsistent close/backdrop/busy feedback | Normalize modal sizing, backdrop close where safe, visible focus |
| Responsive | Basic breakpoints exist; toolbars still stack awkwardly | Add compact mobile/tablet rules and avoid horizontal overflow |

## Manual QA gates for this pass

- Opening any normal page must not run V5 evaluation, Visual QC or provider shadow work.
- Reader exit must remain available after long vertical scrolling.
- Leaving Reader must return to the prior page and prior scroll position.
- Library primary workflow must fit without exposing every advanced filter/action at once.
- Recommendation controls must show understandable 1–10 semantics without requiring algorithm knowledge.
- V5 Evaluation must not show 0% accuracy as if it were a measured failure when there are no future-outcome runs.
- Experimental tools remain available but visually separated from normal settings.
