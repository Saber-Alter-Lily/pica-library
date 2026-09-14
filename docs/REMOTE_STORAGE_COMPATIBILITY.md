# Remote storage compatibility

Pica Library treats remote storage as named targets. A target is a WebDAV endpoint plus a logical Pica Library root. Provider presets only normalize documented endpoints and authentication guidance; the logical remote library format remains provider-independent.

## Direct WebDAV presets

| Provider | Preset | Endpoint / rule | Authentication / compatibility notes |
| --- | --- | --- | --- |
| 123Pan | `123pan` | `https://webdav.123pan.cn/webdav` | App password. Uses Pica Library flat-object compatibility mode because hosted WebDAV may reject `MKCOL`. |
| Nutstore / Jianguoyun | `jianguoyun` | `https://dav.jianguoyun.com/dav` | Account email + app password. |
| pCloud US | `pcloud-us` | `https://webdav.pcloud.com` | Account credentials; 2FA can require login confirmation. WebDAV is not recommended by pCloud for large backup workloads. |
| pCloud EU | `pcloud-eu` | `https://ewebdav.pcloud.com` | Same as pCloud US, but EU data-region endpoint. |
| Koofr | `koofr` | `https://app.koofr.net/dav/Koofr` | Account email + application-specific password. |
| Yandex Disk | `yandex` | `https://webdav.yandex.ru` | Yandex username + app password. WebDAV requires an eligible Yandex 360 plan from 2026-06-22. |
| OpenDrive | `opendrive` | `https://webdav.opendrive.com` | WebDAV is documented for premium accounts. |
| InfiniCLOUD | `infinicloud` | User-specific URL from My Page | Connection ID + app password. Do not substitute a generic node URL. |
| Nextcloud | `nextcloud` | User/server-specific WebDAV URL | Prefer the URL shown by Nextcloud; app password recommended/required by current docs. |
| ownCloud | `owncloud` | Server-specific WebDAV URL | Deployment-specific URL. |
| OpenList / AList | `openlist` | Usually `https://host/dav/` | Server username/password; write operations require WebDAV management and file-operation permissions. |
| Synology WebDAV Server | `synology` | NAS-specific HTTPS URL | HTTPS strongly preferred. DSM WebDAV Server commonly uses a dedicated HTTPS port configured by the NAS owner. |
| Generic WebDAV | `generic` | User supplied | Used for standards-compatible WebDAV servers not covered above. |

## Not direct WebDAV targets

Dropbox does not provide native WebDAV. Box ended WebDAV service in 2023. Services such as AliyunDrive, Baidu Netdisk, Quark, 115 and MEGA should be connected only through an explicit user-operated WebDAV gateway (for example OpenList/AList where supported) or a future native provider implementation. Pica Library does not impersonate or reverse-engineer those services as part of the WebDAV layer.

## Capability policy

- Connection testing is non-destructive.
- Ordinary WebDAV targets keep the hierarchical `PicaLibrary/v1/...` layout.
- 123Pan uses deterministic flat object names while preserving the same logical paths.
- Remote-only deletion remains fail-closed when the server cannot provide the locking guarantees required by Pica Library.
- Secrets are never written to the public remote-storage JSON file; Windows persists them inside the existing DPAPI-protected credential blob.
