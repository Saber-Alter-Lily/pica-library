export type DownloadProfile = 'conservative' | 'balanced' | 'fast'

export interface DesktopConfig {
    schemaVersion: 1
    libraryDirectory: string
    profile: DownloadProfile
    openBrowser: boolean
    preferredPort: number
    proxyUrl?: string
}

export interface RemoteTargetStoredCredentials {
    username?: string
    password?: string
}

export interface StoredCredentials {
    account: string
    password: string
    proxyUsername?: string
    proxyPassword?: string
    /** Legacy single-target fields retained for seamless migration. */
    remoteStorageUsername?: string
    remoteStoragePassword?: string
    /** DPAPI-protected credentials keyed by RemoteStorageTarget.id. */
    remoteStorageCredentials?: Record<string, RemoteTargetStoredCredentials>
    /** Optional E-Hentai cookie-session material. The whole credential object is DPAPI-protected. */
    ehMemberId?: string
    ehPassHash?: string
    ehIgneous?: string
    ehCfClearance?: string
}

export interface SetupInput {
    account: string
    password: string
    libraryDirectory: string
    profile: DownloadProfile
    proxyUrl?: string
}
