import os from 'node:os'
import path from 'node:path'

export interface DesktopPaths {
    root: string
    config: string
    credentials: string
    data: string
    cache: string
    logs: string
    runtimeState: string
    lock: string
    instance: string
}

export function desktopPaths(rootOverride?: string): DesktopPaths {
    const local =
        rootOverride ??
        process.env.PICA_LIBRARY_DESKTOP_HOME ??
        path.join(
            process.env.LOCALAPPDATA ??
                path.join(os.homedir(), 'AppData', 'Local'),
            'Pica Library'
        )
    return {
        root: local,
        config: path.join(local, 'config', 'config.json'),
        credentials: path.join(local, 'config', 'credentials.dat'),
        data: path.join(local, 'data'),
        cache: path.join(local, 'cache'),
        logs: path.join(local, 'logs'),
        runtimeState: path.join(local, 'runtime-state'),
        lock: path.join(local, 'runtime-state', 'instance.lock'),
        instance: path.join(local, 'runtime-state', 'instance.json')
    }
}
