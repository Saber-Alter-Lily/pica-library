# Web Reader input ownership (local-only)

## Purpose and actual wiring

`web/reader-input.js` extracts the existing Web Reader keyboard decisions and bounded single/double-page movement from `app.js`. It is pure JavaScript, has no imports or DOM/storage/network/provider access, and is typed by `reader-input.d.ts`. The existing `document` listener supplies input-ownership facts; the existing `moveReader` calls the pure page calculation and retains rendering/progress in the application adapter. Local, compiled-provider and explicitly authorized user-host reading use this same path; input never inspects a source ID, account or token.

This is maintenance of the existing Reader, not a new source/gesture framework, a separate updater or a rendering rewrite. Browser KeyboardEvent/DOM facilities, TypeScript AST and existing esbuild/Vitest are reused; no dependency or lockfile changes. No competitor APK implementation or artwork is included.

## Behavior and compatibility

- Ordinary Left/PageUp and Right/PageDown keep their existing physical -1/+1 mapping. Single/double, LTR/RTL, odd page counts and clamping retain the prior valid-state calculation. No automatic chapter transition or new shortcut.
- Continuous reading leaves the page keys to native scrolling. Ordinary non-fullscreen Escape still exits through the existing flush/cleanup path. Fullscreen Escape is left to the browser first.
- A native open dialog or active existing driver.js guide owns the keyboard, not the underlying Reader. The Reader no longer flips or exits behind it.
- Text/select/input, inherited content-editable and ARIA arrow-key widgets retain keyboard ownership. The adapter checks the available composed event path, including exposed inner controls of open shadow trees; it cannot inspect a closed shadow root's hidden internals.
- Handled events, IME composition (including legacy keyCode229), Ctrl/Alt/Meta/Shift combinations remain untouched: no Reader movement, exit or preventDefault.
- Invalid page/mode/direction/move state returns no action. A clamped move that leaves the page unchanged does not redraw or enqueue the same progress again. No database or progress format changes.

GUIDE_VERSION, public module APIs, native gesture settings, source/authentication contracts, recommendation/Visual state and updater behavior are unchanged. Windows packaging already copies the whole `web` tree; this new module ships with the normal application update rather than requiring a separate installation. This source has not been packaged into a new installer.

## Evidence and limits

Targeted tests include pure decisions, a differential check against the original valid-page formula, browser-only dependency closure, and execution of the **actual AST-extracted listener and moveReader function** with mocked DOM ownership. This deliberately does not execute app startup, a browser, a provider, Java, a listener service, an upgrade or production data. Source/text contract checks still cover the original Reader controls and full-screen/exit path; moved assertions follow the module rather than silently dropping the old contract.

Type/syntax results and before/after listener evidence are recorded against the exact local commit in the new source-review handoff. The first development attempt's missing type declarations/test return-type errors remain in its logs; only a later clean-source passing run is final evidence. No current-source full CI/browser/device/physical-keyboard acceptance has occurred. Native touch/OEM acceptance remains pending and is not validated by Web tests.

The immutable `9e879d3...`/Dev82 r2 acceptance package is unchanged and does **not** contain this module or the later guide correction. This maintenance must not delay its bounded user test or borrow its prior green checks. Full local-first, content-free, user-chosen-source modularization remains OPEN, including hosted-source parity/trust and other existing ledger gaps.

## Platform references

Checked 2026-10-25: [KeyboardEvent.isComposing](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing), [Event.defaultPrevented](https://developer.mozilla.org/en-US/docs/Web/API/Event/defaultPrevented), [Element.closest](https://developer.mozilla.org/en-US/docs/Web/API/Element/closest), [Fullscreen API guide](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API/Guide). These are references for existing browser mechanisms, not evidence of our rendered UI or a substitute for physical acceptance.
