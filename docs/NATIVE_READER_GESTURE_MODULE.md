# Native Reader gesture seam (NEXT-51, unpublished)

## Ownership and compatibility

`reader/gestures/ReaderGesturePolicy` contains deterministic tap zones, zoom targets/bounds and horizontal-fling decisions. `ReaderTouchSession` contains only per-touch navigation/parent ownership. Neither depends on Android, a source, account, network, database, preferences or sync. `compileReaderGestureBoundary` compiles this folder with an empty classpath on the existing JDK; plain JUnit exercises the rules.

`ZoomImageView` is the Android adapter: existing `GestureDetector` / `ScaleGestureDetector` recognize events; `Matrix` renders; the parent ViewPager2/RecyclerView retains scrolling. The pure module returns physical LEFT/RIGHT/CENTER intent. `ReaderActivity` still maps physical directions to its existing RTL/LTR/continuous reading semantics and owns page/chapter navigation and progress. No second gesture recognizer, animation framework or external touch dependency is introduced.

`ReaderGestureSettings` remains the phone-local storage adapter. The existing `reader-gestures-v1` file, `doubleTapEnabled`/`zoomPercent` keys, enabled + 2x defaults and 1.5x/2x/3x choices are unchanged. Existing values are read without migration or rewriting unrelated keys. Portable `reader-display`, its timestamp and remote settings are untouched. This internal extraction does not change a public module API or data schema.

## Bounded behavior corrections

- The existing 28%/72% tap zones, 18%-width/500 px/s fling thresholds, 1–4x pinch bound and pager-managed suppression remain.
- A predominantly vertical/diagonal fling must not be interpreted as a horizontal page turn. Distance and velocity must both be predominantly horizontal.
- A touch that used multiple fingers retains ownership until UP/CANCEL, even after returning to fit or lifting one finger. It cannot finish as a single-finger page turn. Pinch and drag do not apply competing transforms at the same time.
- A cancelled touch, replaced/recycled image, detached view, changed size or changed gesture options cancels delayed detector callbacks. A pending confirmed tap must not turn the new page or execute under new options. Changing options does not reset the current zoom.
- Disabling double-tap also disables Android's double-tap-and-drag quick scale. Two-finger pinch is still enabled. The enabled path keeps the existing Android quick-scale behavior.

## Automated evidence and limits

The plain Java tests cover thresholds, invalid numbers, direction mapping and stream ownership. MotionEvent tests run on Robolectric SDK 28 and 35 and cover single/double taps, selected scales, pinch with double-tap disabled, pan bounds, cancellation, pending callbacks, recycled views, pager-managed motion and actual ViewGroup interception/CANCEL dispatch. Preference tests run on both SDK levels. This does not certify physical touch feel, real ViewPager2/RecyclerView inertia, OEM handling, system edge gestures or installation.

The new candidate retains the Dev package and fixed signing identity and increments code65 -> code66. Exact source/hash, SDK test counts, APK signature continuity, actual Windows application replacement/forced rollback and the unreleased handoff are recorded after building. No old green package is renamed. No APK is automatically installed; no stable release/OTA or production profile is touched.

As a counterfactual, the prior widget from `76898ad29c1a` was temporarily substituted only in an isolated test copy. The new 36-case SDK28/35 event suite found eight failures: vertical-dominant fling, recycled-image delayed tap, disabled-double-tap quick scale, and post-pinch parent ownership, on both SDK levels. The current widget passes those cases. Raw old-widget JUnit and restored-current results are kept separate; these deliberate old-code failures are not candidate failures or skipped gates.

## Reuse and continuation

References checked 2026-10-23: [Android drag/scale and multiple-pointer ownership](https://developer.android.com/develop/ui/views/touch-and-input/gestures/scale), [Android ViewGroup interception and ACTION_CANCEL](https://developer.android.com/develop/ui/views/touch-and-input/gestures/viewgroup). These document the platform components already in use; no competitor/APK code or assets were copied. Existing AndroidX ViewPager2/RecyclerView dependencies remain pinned and unchanged.

Further native tag-domain separation, recommendation service ports, optional source-runtime/trusted extension decisions, Android direct local import and concentrated physical-device acceptance remain open. This slice is not a rewrite of the whole Reader or completion of the modular-reader objective.
