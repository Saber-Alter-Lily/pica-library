# Android Preview signing policy

The moving `android-preview` channel must use one stable Android signing identity across every published build. GitHub-hosted runner debug keystores are ephemeral and therefore must never be used for a Preview intended to update an already-installed Preview.

## Repository secrets

Publishing requires exactly these repository secrets:

- `ANDROID_PREVIEW_KEYSTORE_B64` — Base64 of the private Preview JKS keystore.
- `ANDROID_PREVIEW_KEYSTORE_PASSWORD` — password for the JKS and `pica-preview` key alias.

The private keystore and its password must never be committed to this repository, included in a public release, copied into an Actions artifact, or written to logs.

## Fixed public identity

- Alias: `pica-preview`
- Expected signing certificate SHA-256: `64fb87dc7d8bd6bc7b2cec92cc8c83fad3afe8cfb07591a2e53d53cbd3ab2f9d`

The certificate fingerprint is public metadata and is intentionally enforced in CI. The private key remains secret.

## CI behavior

Ordinary branch pushes continue to run unit tests, Android lint, a debug build, and Windows validation without requiring signing secrets.

A Preview publication (`[publish-preview]` or manual `publish_preview=true`) additionally:

1. fails closed if either signing secret is missing;
2. decodes the keystore only into the runner's temporary directory;
3. builds `assembleRelease` with the stable Preview key;
4. verifies the APK with Android SDK `apksigner`;
5. compares the APK certificate SHA-256 to the fixed expected fingerprint;
6. creates the update manifest from the signed APK SHA-256;
7. moves the `android-preview` tag to the exact published commit;
8. overwrites the single moving Preview release assets.

## Update compatibility

The Android updater validates the downloaded APK's SHA-256, package name, versionCode, and signing certificate before invoking the system installer.

Builds installed before the stable Preview key was introduced may have been signed by transient Android debug keys. Android will not treat those as upgrade-compatible with the stable signed Preview. Such an old debug installation requires a one-time uninstall/reinstall when moving to the stable signed channel. After that migration, future Preview updates must retain the same signing key.

## Key recovery

Treat the Preview keystore as a long-lived release credential. Keep an offline backup. Losing it means future APKs cannot update existing installations signed with this key. Rotating it requires an explicit Android signing-migration design and must not be done as a routine CI change.
