import path from 'node:path'
import { defaultDesktopRoot } from './platform'

export interface DesktopPaths {
    root: string
    config: string
    credentials: string
    remoteStorageConfig: string
    data: string
    cache: string
    packs: string
    logs: string
    runtimeState: string
    lock: string
    instance: string
    exportState: string
}

export function desktopPaths(rootOverride?: string): DesktopPaths {
    const local =
        rootOverride ??
        process.env.PICA_LIBRARY_DESKTOP_HOME ??
        defaultDesktopRoot()
    return {
        root: local,
        config: path.join(local, 'config', 'config.json'),
        credentials: path.join(local, 'config', 'credentials.dat'),
        remoteStorageConfig: path.join(local, 'config', 'remote-storage.json'),
        data: path.join(local, 'data'),
        cache: path.join(local, 'cache'),
        packs: path.join(local, 'packs'),
        logs: path.join(local, 'logs'),
        runtimeState: path.join(local, 'runtime-state'),
        lock: path.join(local, 'runtime-state', 'instance.lock'),
        instance: path.join(local, 'runtime-state', 'instance.json'),
        exportState: path.join(
            local,
            'runtime-state',
            'browser-lite-export.json'
        )
    }
}
