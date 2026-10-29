/**
 * Original local Desktop folder commands, as source-free capabilities.
 *
 * The browser can choose only a purpose/slot. It never supplies a filesystem
 * path to an OS launcher. The native UI picker and system opener remain owned
 * by the trusted Desktop process, not by this module or a source worker.
 */
export const coreLocalDirectoryKinds = [
    'data', 'logs', 'personalization', 'packs', 'browser-lite-export'
] as const
export type CoreLocalDirectoryKind = typeof coreLocalDirectoryKinds[number]
export type CoreLocalPlatformAction = 'choose-folder' | 'open-directory'
export type CoreLocalDirectoryPaths = Partial<Record<CoreLocalDirectoryKind, string>>
export interface CoreLocalPlatformPort {
    chooseFolder(): Promise<string | null>
    openDirectory(kind: string): Promise<void>
}
export interface CoreLocalPlatformReply {
    status: 200 | 400 | 409
    value: Record<string, unknown>
}

export function coreLocalPlatformMatch(
    method: string, pathname: string
): CoreLocalPlatformAction | null {
    if (method !== 'POST') return null
    if (pathname === '/api/v1/desktop/choose-folder') return 'choose-folder'
    if (pathname === '/api/v1/desktop/open-directory') return 'open-directory'
    return null
}

export function coreLocalDirectoryKind(
    value: unknown
): value is CoreLocalDirectoryKind {
    return typeof value === 'string' &&
        coreLocalDirectoryKinds.some(kind => kind === value)
}

/** Accept only the fixed, trusted directories computed by the Desktop host. */
export function coreLocalDirectoryPath(
    kind: string, locations: CoreLocalDirectoryPaths
): string {
    if (!coreLocalDirectoryKind(kind) ||
        !Object.prototype.hasOwnProperty.call(locations, kind))
        throw new Error('Unknown directory')
    const directory = locations[kind]
    if (typeof directory !== 'string' || !directory)
        throw new Error('Unknown directory')
    return directory
}

export async function coreLocalPlatformExecute(
    action: CoreLocalPlatformAction,
    host?: CoreLocalPlatformPort | null,
    input: Record<string, unknown> = {}
): Promise<CoreLocalPlatformReply> {
    if (!host) return {
        status: 409,
        value: { error: 'Local Desktop platform actions are unavailable' }
    }
    if (action === 'choose-folder') return {
        status: 200, value: { path: await host.chooseFolder() }
    }
    // Do not forward arbitrary paths, commands or unknown directory kinds.
    if (Object.keys(input).length !== 1 ||
        !coreLocalDirectoryKind(input.kind))
        return {
            status: 400, value: { error: 'Unsupported local directory kind' }
        }
    await host.openDirectory(input.kind)
    return { status: 200, value: { success: true } }
}
