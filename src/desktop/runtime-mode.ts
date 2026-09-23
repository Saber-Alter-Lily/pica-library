export type DesktopRuntimeMode = 'interactive' | 'headless'

export interface DesktopRuntimeOptions {
    mode: DesktopRuntimeMode
    openBrowser: boolean
    idleBrowserShutdown: boolean
    mobileBridge: boolean
    remoteApi: boolean
    remoteWeb: boolean
}

export function desktopRuntimeOptions(
    argv: string[] = process.argv.slice(2)
): DesktopRuntimeOptions {
    const args = new Set(argv)
    const headless = args.has('--headless')
    const remoteWeb = headless && args.has('--remote-web')
    return {
        mode: headless ? 'headless' : 'interactive',
        openBrowser: !headless && !args.has('--no-open'),
        idleBrowserShutdown: !headless,
        mobileBridge: !headless || args.has('--mobile-bridge'),
        remoteApi: headless && (args.has('--remote-api') || remoteWeb),
        remoteWeb
    }
}
