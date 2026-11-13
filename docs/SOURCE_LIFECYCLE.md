# Desktop source lifecycle v1 (NEXT-49, unpublished)

## Contract

Pica Library remains a local reader/library with no bundled comic bodies. A source is an optional network capability, not the owner of local files, favorites, tags or reading history.

- **New local Desktop setup:** all external sources off. First-run explicit Pica account setup enables Pica only; it is the existing intentional sign-in path, not an automatic background request.
- **Upgrade from a configuration without `externalSources`:** preserve the legacy enabled adapter set. The UI labels this compatibility state. No silent logout or deletion on upgrade.
- **Settings → Basic → External comic sources:** Read current choices → change checkboxes → Save. Pica, EH/ExH and JM are independent; ExH shares EH's account/adapter and switch. Choices are local to this installation, never copied as an account secret or forced onto another device.
- `config.json.externalSources` holds only `{schemaVersion:1, revision, enabled}`. Unknown fields/IDs, duplicates and stale revisions fail closed. It is separate from DPAPI credentials, SQLite and content directories.
- Save atomically to disk first, then update runtime synchronously. A failed save leaves the current access state and in-flight leases intact. Old browser revisions must reload before retrying.
- Disabling fences retained Pica clients, EH HTTP and JM worker/media calls, aborts current HTTP signals and closes the JM worker. Re-enabling cannot revive an old request. Account restore/status must not spawn a disabled JM worker. Closing EH also cancels the managed login window. A remote mutation already received by the provider cannot be undone by client cancellation.
- Provider-service results recheck the same request lease before catalog/favorite writes; current V3 generation checks the source-policy revision before returning a result. Candidate planning reads actual enabled capability masks. No ranker weight, embedding or Visual mode changes.
- Disabling does **not** remove existing recommendation batches, catalog facts, cached files, downloaded chapters, preferences, private tags or credentials. Existing local Reader and paired LAN reading continue. A queued online download may report a source-disabled failure and requires explicit retry after re-enabling; this is not automatic pause/resume migration.
- Desktop settings retain loopback/CSRF/origin controls. Remote Web and paired Mobile APIs do not get a policy-write endpoint. Mode/capability/status responses expose non-secret choices and enabled states. Native Android ignores a disabled Desktop relay even if a stored account is reported.

## Reuse and module boundary

This extends the existing compiled ProviderRegistry, standard [AbortController / AbortSignal.any](https://nodejs.org/api/globals.html#static-method-abortsignalanysignals), existing HTTP clients, native worker and atomic config/update machinery. No new cancellation framework, updater or runtime executable-plugin loader is added. TS5.3 needs only a narrow type declaration for the native Node API already supported by the application's Node >=22.5 floor.

[Suwayomi's explicit extension-repository selection](https://github.com/Suwayomi/Suwayomi-Server/wiki/Getting-Extensions) supports separating core reading from user-selected sources. It is a design reference, **not** a claim that its extension host or trust model is implemented here. Existing pinned JM Java SDK reuse/provenance/licenses remain unchanged.

The pure `src/sources/source-policy.ts` module owns validation/revisions/request leases, not disk/SQLite/credentials. `src/desktop/source-settings.ts` owns config persistence. Existing library and provider services bind it at operational boundaries. Source manifest API1 and data schema14 are unchanged (additive configuration). The existing updater remains the only update action; full replacement is still required when upgrading from stable's older library/tag module contracts.

## Verified and remaining

Before source freeze, local TypeScript and Web45 syntax pass; 246 unit/integration files pass (1359 assertions + one pre-existing POSIX-only skip on Windows), and real headless Edge passes 46 browser cases, including three-language draft/save/stale-state source choices. Tests use synthetic data and loopback providers. The local Reader/LAN import test now explicitly disables every external source. Initial historical mock-arity failure and the environment's esbuild sandbox denial are retained in isolated evidence, not counted as final passes.

Exact-source CI, signed Dev64 APK, actual Windows ZIP, restart/config persistence, signature continuity, upgrade and rollback gates must be recorded separately in the frozen handoff. No old green result validates a new archive.

**Still pending:** native phone-local source-choice UI and full native worker/WebView lifecycle; optional runtime packaging and trusted external extension repositories; deeper recommendation service/gesture decomposition; native file import; source-free Browser Lite export behavior (a separate offline HTML product); physical phone/OEM and live provider acceptance; user AI-tag round trip and stable published OTA. Disabling Desktop sources is not a remote switch for a phone's own accounts or an already exported standalone Browser Lite copy. UI/automation success is not legal clearance or device acceptance.

No main merge, Release/tag, stable OTA change, deployment, production data access, private-key download or reference-APK code import. Previous NEXT-48 handoff stays immutable.
