import type {
    RemoteStorageCredentials,
    RemoteStorageProvider,
    RemoteStoragePublicConfig
} from './types'
import { WebDavStorageProvider } from './webdav'

export function createRemoteStorageProvider(
    config: RemoteStoragePublicConfig,
    credentials: RemoteStorageCredentials
): RemoteStorageProvider {
    if (config.kind === 'webdav')
        return new WebDavStorageProvider(config, credentials)
    throw new Error(`Unsupported remote storage provider: ${String(config.kind)}`)
}
