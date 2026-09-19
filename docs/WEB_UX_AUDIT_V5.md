# Web UX Audit — V5 Development

Status: fourth implementation pass in validation; recommendation profile dashboard, audit export and QR pairing/account-state sync added. This document tracks product UX, not scientific/recommendation promotion.

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
| Mobile bridge | IMPLEMENTED_NEEDS_QA | Pairing methods are separated into collapsible QR/manual/deep-link/device sections; Android adds in-app QR scan; stable device identity prevents repeated pairing rows |
| Remote storage | IMPLEMENTED_NEEDS_QA | User-facing copy simplified; Test → Save → Scan → Sync sequence shown; test/save/plan/sync all protected against duplicate submission |
| Software update | IMPLEMENTED_NEEDS_QA | One-click update remains primary; local ZIP advanced; duplicate legacy update poller removed so alpha8-update-ui is sole status authority |
| Maintenance | IMPLEMENTED_NEEDS_QA | Existing task tabs retained; empty outputs hidden and long actions disabled while running |
| Recommendation V5 controls | IMPLEMENTED_NEEDS_QA | Profile/serving/shadow summaries are separately collapsible; facets have a second grouping layer and bounded internal scroll; session attribution and BLOCK counts are corrected |
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
- Main `app.js` is the sole authority for page/Reader scroll restoration; theme decoration no longer owns a competing scroll map.
- Theme/Visual/settings observers are coalesced and themed progress decoration uses event-driven updates with a low-frequency fallback instead of 650 ms full-page rescans.
- File import is one-step (`choose → import`) with duplicate execution locked; settings, connection, update, export and cache actions expose busy/failed states.
- E-H secondary actions are visually separated from the primary web-login and cloud-favorites workflow, and long-running account actions reject duplicate clicks.
- Recommendation Preferences now opens with an inspectable long-term/recent/session profile and current candidate-channel composition before detailed controls.
- Detailed 1–10 sliders are staged locally and require explicit Save; search requires Search/Enter, and an unknown term is never auto-created as a tag without confirmation.
- Recommendation audit export is an explicit Desktop action that writes an allowlisted ZIP and excludes provider credentials, tokens/cookies and manga files.
- Mobile pairing now exposes a locally generated QR deep link; the QR payload never leaves the device for rendering.
- Paired Android devices mirror only non-secret Desktop provider connection state. Credential/session handoff remains disabled until the Mobile Bridge transport is hardened.

## 2026-09-19 live-use feedback round

Observed on the existing user-installed beta; development changes in this section are intentionally not packaged for the user yet.

- **Audit export review:** package structure and credential exclusions passed, but the first package exposed three semantic gaps: Session was generated with `appSessionId=null`; V5 Shadow candidate-channel planning was labelled as current recommendation composition; and the headline “blocked” count only represented comic hard-suppression, not BLOCK preference controls.
- **Session fix:** the Web app exposes the active app-session ID to Recommendation V5; timescale/channel reads and the explicit audit export now carry that session ID.
- **Serving vs Shadow:** a new read-only Final V3 serving-composition snapshot reads the persisted current batch without allocating or regenerating recommendations. Ordinary UI labels this as “当前实际推荐构成”; V5 candidate-channel planning is explicitly labelled Shadow/experimental.
- **Audit schema v2:** adds `serving_composition.json` and records the active `appSessionId` in `manifest.json`; README explains that `candidate_channels.json` is Shadow planning rather than serving.
- **BLOCK semantics:** policy snapshots now expose `blockedTargets` separately from `hardSuppressed`; UI reports “屏蔽偏好” and “屏蔽作品” separately.
- **Profile density:** the flat facet list is grouped into five higher-level groups. Each facet renders its complete set inside a bounded 5–6 row scroll region with `overscroll-behavior: contain`, so scrolling the facet does not chain to the page.
- **Compact help:** a reusable info-tip component supports hover/focus on desktop and click/pinned display on touch/click surfaces. Recommendation and Mobile Bridge explanatory copy is being migrated from always-visible muted paragraphs to this component; state/error/warning text remains visible.
- **Pairing hierarchy:** Desktop pairing is split into QR (recommended), manual address/code, deep-link fallback, and paired devices. QR generation remains fully local.
- **Android scanner:** Android uses the open-source JourneyApps ZXing Android Embedded scanner and only accepts `picalibrary://pair` QR payloads.
- **Duplicate paired devices:** Android now sends the existing stable app-local `DeviceIdentity`; Desktop replaces/revokes prior tokens for the same stable device and collapses legacy duplicate-name rows in display.
- **Release discipline:** CI may continue producing unpublished validation artifacts, but no new package is handed to the user and no upgrade is requested during this live-use accumulation window. Changes remain on the development branch until the formal test dataset is returned.
- **InfoTip rollout:** the compact circular “!” help control now covers the main page headings, Settings explanatory panels, connection probing, WebDAV flow, Recommendation V5 and Theme Studio. Hover/focus previews the explanation and click pins it; status/error/warning/security messages are not hidden behind help controls.

## Test-round disposition

Current installed-beta data is sufficient to stop waiting on the old build and continue product/telemetry development.

- Product/UX/telemetry iteration: **SUFFICIENT**
- Audit-export contract review: **SUFFICIENT_WITH_KNOWN_GAPS**, with the identified gaps already addressed in the development branch
- Formal recommendation-quality claim or serving promotion: **NOT SUFFICIENT**
- Advanced-learning escalation (LTR / Bandit / Active Learning): **NOT SUFFICIENT**

The next candidate should be treated as a targeted acceptance build rather than another long pre-upgrade accumulation phase. The acceptance focus is: active Session attribution, audit schema v2 + Final V3 serving composition, Android in-app QR scan, stable-device re-pair dedupe, nested facet scrolling, and InfoTip interaction.

Long-horizon future-outcome evidence continues accumulating independently and must not block ordinary product fixes.

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
