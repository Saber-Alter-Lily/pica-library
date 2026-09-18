# Web UX Audit — V5 Development

Status: implementation pass complete; awaiting manual QA on the current beta build. This document tracks product UX, not scientific/recommendation promotion.

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
| Global header/navigation | IMPLEMENTED_NEEDS_QA | Sticky navigation, focus-visible and disabled states normalized |
| Home | IMPLEMENTED_NEEDS_QA | Browser Lite destructive reset hidden in connected Desktop mode; normal quick actions remain primary |
| Library | IMPLEMENTED_NEEDS_QA | Primary view/search/scope, collapsible advanced filters, contextual batch/selection actions |
| Shelves | IMPLEMENTED_NEEDS_QA | Active shelf state and unified view toolbar added; responsive split preserved |
| Discover / recommendation | IMPLEMENTED_NEEDS_QA | Generate/restart, batch paging and selection actions separated into distinct layers |
| Online search | IMPLEMENTED_NEEDS_QA | Keyword-first flow retained; source/tags/sort moved into collapsible filters |
| Reader | IMPLEMENTED_NEEDS_QA | Fixed compact header, persistent exit, Esc, single keyboard handler, fullscreen exit and origin scroll restoration |
| Downloads | IMPLEMENTED_NEEDS_QA | Run/refresh stay primary; performance and Browser Lite export moved to advanced controls |
| Downloaded | IMPLEMENTED_NEEDS_QA | View controls normalized with Library; underlying data flow unchanged |
| Collection Chronicle | PASS_NO_BEHAVIOR_CHANGE | Existing visual language retained; global focus/navigation polish applies |
| Settings hub | IMPLEMENTED_NEEDS_QA | Normal settings separated from collapsed Experiment & Diagnostics area |
| Pica account/proxy | IMPLEMENTED_NEEDS_QA | File/log/exit utilities demoted; existing save/test behavior preserved |
| E-H / ExH | PASS_EXISTING_COMPACT_FLOW | Web login remains primary; manual cookie/actions remain advanced disclosure |
| Mobile bridge | MANUAL_QA + PLANNED_QR | Current address/code fallback retained; QR-first pairing remains a separate planned feature |
| Remote storage | IMPLEMENTED_NEEDS_QA | Explicit Test → Save → Scan → Sync sequence hint added |
| Software update | IMPLEMENTED_NEEDS_QA | One-click update remains primary; local ZIP path moved to advanced disclosure |
| Maintenance | IMPLEMENTED_NEEDS_QA | Existing task tabs retained; empty outputs no longer occupy large black panels |
| Recommendation V5 controls | IMPLEMENTED_NEEDS_QA | User adjustments first, 1–10 semantics simplified, unknown preference shown as unknown with neutral 5/10 start |
| Visual V1 QC | IMPLEMENTED_NEEDS_QA | Moved under Experiment & Diagnostics; heavy work remains manual-only |
| Work identity P2A | IMPLEMENTED_NEEDS_QA | Moved under Experiment & Diagnostics; covers/details/reader links and undecided-first ordering retained |
| V5 Evaluation | IMPLEMENTED_NEEDS_QA | Human-readable progress first; immature outcomes excluded; gates/version/LTR collapsed under advanced details |
| Dialogs/toasts | IMPLEMENTED_NEEDS_QA | Backdrop close where safe, visible focus and modal sizing normalized |
| Responsive | IMPLEMENTED_NEEDS_QA | Compact toolbar/Reader/settings breakpoints added; requires real-browser QA |

## Manual QA gates for this pass

- Opening any normal page must not run V5 evaluation, Visual QC or provider shadow work.
- Reader exit must remain available after long vertical scrolling.
- Leaving Reader must return to the prior page and prior scroll position.
- Library primary workflow must fit without exposing every advanced filter/action at once.
- Recommendation controls must show understandable 1–10 semantics without requiring algorithm knowledge.
- V5 Evaluation must not show 0% accuracy as if it were a measured failure when there are no future-outcome runs.
- Experimental tools remain available but visually separated from normal settings.
