# Web UX Audit — V5 Development

Status: second implementation pass complete; awaiting manual QA on the current beta build. This document tracks product UX, not scientific/recommendation promotion.

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
| Library | IMPLEMENTED_NEEDS_QA | Sync is primary; import/full verification, advanced filters and batch tools are secondary; explicit empty/no-match states and Enter-to-filter added |
| Shelves | IMPLEMENTED_NEEDS_QA | Active shelf state and unified view toolbar added; responsive split preserved |
| Discover / recommendation | IMPLEMENTED_NEEDS_QA | Generate/restart, batch paging and selection actions separated into distinct layers |
| Online search | IMPLEMENTED_NEEDS_QA | Keyword-first flow retained; source/tags/sort collapsed; Enter-to-search, busy lock and explicit zero-result state added |
| Reader | IMPLEMENTED_NEEDS_QA | Fixed header with Exit/Prev/Next, active chapter, Esc, one keyboard handler, fullscreen exit, chapter edge disabling and origin scroll restoration |
| Downloads | IMPLEMENTED_NEEDS_QA | Run/refresh stay primary; performance/export moved to advanced; run action now has busy lock and visible starting state |
| Downloaded | IMPLEMENTED_NEEDS_QA | View controls normalized with Library; underlying data flow unchanged |
| Collection Chronicle | IMPLEMENTED_NEEDS_QA | Visual language retained; hard-coded English metrics/footer/ETA removed and print labels localized |
| Settings hub | IMPLEMENTED_NEEDS_QA | Normal settings separated from collapsed Experiment & Diagnostics area; sidebar now uses keyboard-accessible tab semantics |
| Pica account/proxy | IMPLEMENTED_NEEDS_QA | File/log/exit utilities demoted; dangerous actions retain warning styling across light/dark themes |
| E-H / ExH | IMPLEMENTED_NEEDS_QA | Web login + cloud favorites remain primary; manual Cookie, re-verify, ExH probe and destructive session clear are secondary; duplicate submission guarded |
| Mobile bridge | MANUAL_QA + PLANNED_QR | Current fallback adds Copy address/code with localized feedback; QR-first remains the next separate pairing feature |
| Remote storage | IMPLEMENTED_NEEDS_QA | User-facing copy simplified; Test → Save → Scan → Sync sequence shown; test/save/plan/sync all protected against duplicate submission |
| Software update | IMPLEMENTED_NEEDS_QA | One-click update remains primary; local ZIP advanced; duplicate legacy update poller removed so alpha8-update-ui is sole status authority |
| Maintenance | IMPLEMENTED_NEEDS_QA | Existing task tabs retained; empty outputs hidden and long actions disabled while running |
| Recommendation V5 controls | IMPLEMENTED_NEEDS_QA | Renamed to user-facing Recommendation Preferences; user adjustments first; policy internals collapsed; unknown preference shown as unknown with neutral 5/10 start |
| Visual V1 QC | IMPLEMENTED_NEEDS_QA | Moved under Experiment & Diagnostics; heavy work remains manual-only |
| Work identity P2A | IMPLEMENTED_NEEDS_QA | Moved under Experiment & Diagnostics; covers/details/reader links and undecided-first ordering retained |
| V5 Evaluation | IMPLEMENTED_NEEDS_QA | Human-readable progress first; immature outcomes excluded; gates/version/LTR collapsed under advanced details |
| Dialogs/toasts | IMPLEMENTED_NEEDS_QA | App-native confirm/text-entry dialogs replace ordinary browser prompt/confirm flows; backdrop close where safe, visible focus/modal sizing normalized; status regions use polite live announcements |
| Responsive | IMPLEMENTED_NEEDS_QA | Compact toolbar/Reader/settings breakpoints added; fixed Reader header and controls adapt at 900/700 px; requires real-browser QA |

## Implementation safeguards added in this pass

- Dynamic UI observers are coalesced with `requestAnimationFrame`; no full-page polish runs once per DOM mutation.
- Settings page reads local configuration on open, but Pica/WebDAV network probes run only after explicit “Check connections”.
- `alpha8-update-ui.js` is the only software-update progress poller; the legacy duplicate poller was removed from `alpha8-product.js`.
- Sync, online search, download queue start, maintenance scans and WebDAV test/save/plan actions now guard against duplicate submission.
- Chinese recommendation/Visual/Chronicle user-facing strings were reconciled with the main i18n table.
- Shadow future-outcome accuracy excludes immature observation windows to avoid displaying recent partial data as formal accuracy.
- Shelf/create/rename/delete, recommendation restart, download cancel, update confirmation, Reader export-open, Browser Lite clear and WebDAV sync now use the app's themed confirmation/text-entry dialogs.
- Settings Hub uses `tablist` / `tab` / `tabpanel` semantics with Arrow/Home/End keyboard navigation and localized accessibility labels.
- E-H secondary actions are visually separated from the primary web-login and cloud-favorites workflow, and long-running account actions reject duplicate clicks.

## Manual QA gates for this pass

- Opening any normal page must not run V5 evaluation, Visual QC or provider shadow work.
- Reader exit must remain available after long vertical scrolling.
- Leaving Reader must return to the prior page and prior scroll position.
- Library primary workflow must fit without exposing every advanced filter/action at once.
- Recommendation controls must show understandable 1–10 semantics without requiring algorithm knowledge.
- V5 Evaluation must not show 0% accuracy as if it were a measured failure when there are no future-outcome runs.
- Experimental tools remain available but visually separated from normal settings.
- App confirmation and text-entry dialogs must preserve Cancel/Esc behavior and remain readable in light/dark themes.
- Settings Hub must be fully operable with keyboard arrows/Home/End and keep the active section announced correctly.
