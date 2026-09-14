# Multi-target remote storage API

Pica Library Desktop exposes named remote-storage targets through the existing Desktop settings endpoints. A target is a saved public WebDAV configuration plus credentials stored separately in the DPAPI-protected credential blob.

## Status

`GET /api/v1/desktop/status` includes:

```json
{
  "remoteStorage": {
    "configured": true,
    "targets": [
      {
        "id": "server-generated-id",
        "label": "My cloud",
        "kind": "webdav",
        "vendor": "123pan",
        "baseUrl": "https://webdav.123pan.cn/webdav",
        "root": "PicaLibrary",
        "credentialsConfigured": true
      }
    ],
    "presets": []
  }
}
```

Secrets are never returned.

## Test an edited or new target

`POST /api/v1/desktop/test-connection`

```json
{
  "remoteStorageAction": "test",
  "remoteTargetId": "existing-target-id",
  "remoteStorage": {
    "kind": "webdav",
    "vendor": "jianguoyun",
    "label": "Nutstore",
    "baseUrl": "https://dav.jianguoyun.com/dav",
    "root": "PicaLibrary",
    "username": "user@example.com",
    "password": "app-password"
  }
}
```

Omit `remoteTargetId` and send `createNewTarget: true` when testing a new target. Blank username/password fields reuse saved credentials only when editing an existing target.

## Save a target

`POST /api/v1/desktop/settings` with `remoteStorageAction: "save"` and the same `remoteStorage` shape. The server returns the stable `targetId`. Only an explicit `createNewTarget: true` creates a second target; otherwise a single existing target is updated for backward compatibility.

## Read/plan a saved target

Inventory and plan operations identify the saved target explicitly:

```json
{
  "remoteStorageAction": "inventory",
  "remoteTargetId": "target-id"
}
```

or

```json
{
  "remoteStorageAction": "plan",
  "remoteTargetId": "target-id"
}
```

If more than one target exists and no target ID is supplied, the request is rejected instead of choosing one implicitly.

## Upload

`POST /api/v1/desktop/settings`

```json
{
  "remoteStorageAction": "sync",
  "remoteTargetId": "target-id"
}
```

For an explicit comic selection, first request inventory for the same target and then send its returned `remoteScopeId` together with `comicIds`. Pica Library never fans an upload out to all configured targets automatically.

## Delete remote copies

Remote-only deletion is scoped to one target and retains the existing target verification contract:

```json
{
  "remoteStorageAction": "delete-remote",
  "remoteTargetId": "target-id",
  "remoteScopeId": "scope-from-inventory",
  "expectedGeneration": "generation-from-inventory",
  "confirmation": "DELETE_REMOTE_ONLY",
  "comicIds": ["comic-id"]
}
```

The local download is not deleted. Targets without the server-side locking guarantees required by Pica Library remain fail-closed for physical remote deletion.

## Compatibility

A legacy v1 single-WebDAV JSON config loads as the `legacy-default` target without rewriting the file during read. The next explicit save writes the v2 target registry. Legacy DPAPI WebDAV credentials remain usable during this transition.
