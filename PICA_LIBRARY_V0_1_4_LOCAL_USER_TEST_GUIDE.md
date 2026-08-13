# Pica Library v0.1.4 Local User Test

This is a local acceptance build, not a public release. Extract it to a new folder and close any older Pica Library process before testing.

1. Double-click `Pica Library.exe`. Confirm one working local page opens and saved credentials are never displayed.
2. In first-run setup or Settings, use **Auto-detect proxy**, then **Test Connection**. Confirm proxy credentials are never shown.
3. Save settings. Confirm the page waits for the engine and does not redirect to a dead address.
4. Use **Sync Favorites** or **Update Favorites**. Confirm the Library receives records.
5. In Library, switch grid/list and turn cover loading off/on. OFF must show placeholders without new cover requests.
6. Open recommendations, note the first 12, then choose **Next batch**. Confirm recommendations do not repeat before the pool is exhausted.
7. In Settings > Browser Lite, export `pica-library-bundle.json`, then choose **Open Browser Lite**.
8. Confirm the import action is visible, import the package, and verify Library and Recommendations work offline.
9. Export a newer snapshot and reimport it to confirm updated content appears.
10. Close Pica Library and confirm its local port is released.

Do not reuse real data for development tests. Report any stale page, exposed secret, unexpected cover request, or process that remains after shutdown.
