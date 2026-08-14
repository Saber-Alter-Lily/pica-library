import { PRODUCT_VERSION } from './version'

export const APP_API_VERSION = 2
export const DATABASE_SCHEMA_VERSION = 5
export const BUNDLE_FORMAT_VERSION = 1
export const UPDATE_MANIFEST_VERSION = 1
export const READER_API_VERSION = 1

export interface AppCapabilities {
    appVersion: string
    appApiVersion: number
    databaseSchemaVersion: number
    bundleFormatVersion: number
    updateManifestVersion: number
    readerApiVersion: number
    features: {
        providerFavoriteMutation: boolean
        browserLite: boolean
        shelves: boolean
        reader: boolean
        archiveReader: boolean
        updatePackages: boolean
        recommendationSessions: boolean
        previewPages: boolean
    }
}

export function appCapabilities(
    providerFavoriteMutation = false
): AppCapabilities {
    return {
        appVersion: PRODUCT_VERSION,
        appApiVersion: APP_API_VERSION,
        databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
        bundleFormatVersion: BUNDLE_FORMAT_VERSION,
        updateManifestVersion: UPDATE_MANIFEST_VERSION,
        readerApiVersion: READER_API_VERSION,
        features: {
            providerFavoriteMutation,
            browserLite: true,
            shelves: true,
            reader: true,
            archiveReader: false,
            updatePackages: true,
            recommendationSessions: true,
            previewPages: true
        }
    }
}
