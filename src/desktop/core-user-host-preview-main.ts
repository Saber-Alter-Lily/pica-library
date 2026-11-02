/**
 * Explicit source-neutral Desktop Host candidate. Reuses Suwayomi's *existing*
 * Host API adapter, Original Web/Reader, isolated source-free local database,
 * OS-native pickers and reader cache. Never contains bundled site-specific
 * Pica/E-H/JM provider SDKs, accounts, extensions, private keys or updater.
 *
 * This is a separate, not-distributed QA entrypoint. The source-free default
 * desktop-core-preview.mjs is still completely Host-free and offline.
 */
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { runCoreDesktopPreview } from './core-preview-runtime'
import { SourceHostInspector } from '../source-hosts/inspector'
import { SourceHostConnections } from '../source-hosts/connections'
import { sourceHostHttp } from '../source-hosts/http-transport'
import { HostedLibraryReader } from '../source-hosts/library-reader'
import { sourceHostStore } from './source-host-store'
import { PreviewCacheManager } from '../services/preview-cache-manager'
import type { CoreUserHostFactory } from './core-preview-runtime'

const makeUserHost: CoreUserHostFactory = (root, database) => {
    const inspector = new SourceHostInspector(sourceHostHttp)
    const connections = new SourceHostConnections(
        sourceHostStore(path.join(root, 'runtime-state', 'user-hosts.json')),
        inspector, randomUUID
    )
    const reader = new HostedLibraryReader(
        connections, database,
        () => new PreviewCacheManager(
            path.join(root, 'cache', 'owned-host-reader'),
            { maxBytes: 64 * 1024 * 1024, ttlMs: 30 * 60 * 1000 }
        )
    )
    // Missing local-download ports is intentional: browsing/reading only,
    // not an implicit Host import, background downloader or second library.
    return { inspector, connections, reader }
}

if (process.argv[1] &&
    /(?:^|[/\\])desktop-core-host-preview\.(?:mjs|js)$/.test(process.argv[1]))
    void runCoreDesktopPreview(process.argv.slice(2), process.argv[1], makeUserHost)
        .catch(error => {
            process.stderr.write('CORE_USER_HOST_PREVIEW_REJECTED: ' +
                (error instanceof Error ? error.message : String(error)) + '\n')
            process.exitCode = 1
        })
