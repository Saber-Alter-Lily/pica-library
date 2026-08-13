export type DownloadProfile = 'conservative' | 'balanced' | 'fast'

export interface DesktopConfig {
    schemaVersion: 1
    libraryDirectory: string
    profile: DownloadProfile
    openBrowser: boolean
    preferredPort: number
    proxyUrl?: string
}

export interface StoredCredentials {
    account: string
    password: string
    proxyUsername?: string
    proxyPassword?: string
}

export interface SetupInput {
    account: string
    password: string
    libraryDirectory: string
    profile: DownloadProfile
    proxyUrl?: string
}
