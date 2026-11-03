# R3 Android original-product source-neutral boundary — 2026-11-03

The current officially published v0.5.0 main and its user data remain unchanged.

## Objective and honest proof level

Build a SOURCE_NEUTRAL_QA variant from the **same original :app** sources; do not fork HomeActivity, the reader, the library store, recommendation ranking or Android navigation. The four original tabs and the real same-signer standalone Host path remain usable. This is a staged excision, **not evidence of source-free distribution** until the R8 + real APK DEX audit passes.

- `:app:assembleCleanSourceQa -PsourceNeutralQa=true` builds isolated `com.picalibrary.android.cleanqa` without changing stable app/signature/default Gradle build. R8 shrinkage is enabled only for this build; the old dev/stable build graph is unchanged. This avoids copying/recreating an alternate product.
- Existing `SourceAccess` returns disabled permits for bundled `pica/eh/jm` providers without parsing account credentials or mutating previous opt-in settings. Startup skips source bootstrap, supporter and updater workers. Source menus and account pages become **separate Host, local, Desktop/LAN and WebDAV** navigation; no login/UI activation of bundled site SDKs. The actual original `HomeActivity`/four tabs, native recommendation, `LocalComicStore`, `:reader-view` and `:signed-reader` are retained.
- Original reader refuses legacy site-bound intent kinds; only local, phone, desktop and WebDAV survive in its direct route. Optional Host uses the existing signed Binder import/Reader activities; it is independently installed and never bundled into the core. Provider thumbnail fetch is skipped, but existing local/desktop/WebDAV covers remain possible.
- Standalone Host target selection now recognizes `com.picalibrary.android.cleanqa` only after its same-signer and exported Activity permission verification, alongside prior two QA identities.
- The clean-build manifest prevents direct launching historic site account/browser screens and removes `REQUEST_INSTALL_PACKAGES`; INTERNET is retained **specifically** for LAN/WebDAV and updates are not enabled in this QA. INTERNET here alone is not evidence of bundled site access.
- The existing Pica/E-H/JM Java source and old JNI/JM runtime dependencies are still in the shared original `:app` source tree at this stage. The R8 audit checks the actual DEX **and mapping** for retained provider classes and refuses to upload an APK under a source-neutral label if found. A compile pass or hidden menu DOES NOT complete G2.
- The first standalone audit lives in one bounded GitHub Actions workflow `.github/workflows/r3-android-clean-source-qa.yml`, not in the 29-check original PR matrix. It reuses the existing Android 35/Gradle 8.9 build and actual APK inspection; no new Reader, source protocol, test harness or mock.

**Next concrete gate** if DEX audit reports retained providers: separate the original recommendation/catalog metadata models from provider client implementations and exclude the legacy source libraries from this variant's runtime dependency graph. Re-run the same DEX audit; do not weaken its forbidden rules. Real three-language 360/393/480dp UI, old profile migration/rollback and production signers G1/G3/G4 remain open.

For the exact product-signed Host and original Android full-app source/Reader/byte-identical offline E2E, see [R3 dual-client handoff](R3_DUAL_CLIENT_PRODUCT_CANDIDATE_20261102.md).
