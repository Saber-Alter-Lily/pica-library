# Android permissions

The current Android build requests only permissions needed by implemented features:

- `INTERNET`: Pica access, GitHub update delivery, Desktop LAN access, WebDAV and media loading.
- `REQUEST_INSTALL_PACKAGES`: lets the in-app updater hand a verified APK to Android's system installer. Android still requires user approval.
- `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_DATA_SYNC`: background data-sync/download work that must remain visible to Android.
- `POST_NOTIFICATIONS`: download/sync/update notifications on Android versions that require runtime notification permission.

The app does not request contacts, SMS, call-log, microphone, camera, precise location, or accessibility-service permissions for normal operation.

`usesCleartextTraffic` is enabled because a paired Desktop bridge may use local-LAN HTTP. Public internet services are expected to use HTTPS; users should only pair with trusted LAN devices.
