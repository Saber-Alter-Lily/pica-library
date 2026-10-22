# Daily UX and dual onboarding — isolated first slice

Base: `e3c0ff365153555511f396321be6cdb63c981384`. Local branch: `codex/ux-tags-dual-onboarding-20261022`. No release or deployment.

The user explicitly authorized a new isolated development/build round after `local_memory_claim` again failed Windows DPAPI decryption. No coordination identity or secret was repaired. The user then separately authorized pushing this new isolated branch, creating a Draft PR and running fixed-signature unpublished Actions builds, without downloading the private key. No main merge, tag/Release, OTA or deployment is authorized.

## Implemented in this slice

- Web: seven-step daily guide plus completion, and seven explicit advanced chapters. Same local vendored Driver dependency; no CDN or new production package dependency.
- Independent daily/chapter progress; local step resume; skip, completion and replay; old v2 completion/dismissal and auto-prompt preference retained without forced re-onboarding. Advanced chapters never auto-start.
- Idempotent explicit exit cleanup restores the original view, settings section and disclosure states even when Driver omits its `onDestroyed` callback during the final animation. Step progress is captured before animation to handle immediate Skip.
- Guide spotlight interactions do not activate the highlighted actions. Navigation only; no automatic auth/sync/download/delete/update/model operations. Missing controls explain current-mode limitations rather than implying readiness.
- Android: short daily spotlight no longer chains into advanced settings. Eight offline advanced chapters, explicit feature navigation, independent read position/status, localized resources and bounded target waiting. Non-exported Activity.
- Advanced spotlight completion, Skip and unavailable-target handling do not complete or dismiss the daily guide. Its final message is independent from the daily completion text.
- Recommendation UI: existing adjustments stay visible; full search/sliders are opt-in. Profile, serving composition, Shadow plan, policy details, refresh/rebuild and audit export are grouped under advanced disclosure. Existing policy identities, weights, save semantics and ranking are unchanged.
- Two Chinese handbooks are linked from existing Desktop/Android guides. Both software guides retain zh-CN/en/ja text.

## Explicitly NOT implemented by this slice

- Selected-tag participation gating across profile, recall, scoring and Android offline policy.
- Private per-work labels; provider-tag rule mappings; cross-client concept migration.
- Visual reference-set tags or new embedding/model training.
- Automatic Save-and-apply recomputation. Existing Save still affects later recomputation and the guide states this explicitly.
- New serving version, production data/schema migration, formal OTA, stable release or deployment.

These remain the next integration work, not completed #200 acceptance. No cosmetic checkbox may be presented as functional until the entire serving/offline chain is gated and tested.

## Validation boundary

All fixtures and browser API responses are synthetic/offline. No user production database, credentials, embeddings, feedback, favorite or sync state is read or written. Browser testing uses app-bundled Playwright 1.62.1 and installed headless Edge with an isolated profile; normal CI pins its own version.

Local pnpm refused the pre-existing shared `node_modules` junction rather than replacing it. It was preserved. Tests run via the existing Node entrypoints; the Playwright package alias is task-local scratch, not a product dependency. Sandbox ancestor-read denial required scoped host-read execution for esbuild. No global package install or system configuration change.

Exact final test/build results and package digest belong in the final validation artifact, not copied from the previous candidate. Native/resource/source checks do not substitute for Android compilation, fixed signing, physical gestures or provider acceptance.

Before pushing this slice, the final local source passed 1,261 Desktop unit/integration assertions with no skips or failures, 29/29 headless Edge browser tests (including both complete guides and three-language narrow layouts), Web syntax 41/41, TypeScript and Rollup build. Browser/unit JSON and narrow-layout screenshots are retained in task-owned validation and will accompany the handoff. Fresh remote Android and actual Windows/APK verification remain pending at this source freeze, not inferred from these local gates.
