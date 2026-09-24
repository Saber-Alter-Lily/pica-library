import { PRODUCT_VERSION } from './version'
import { latestMigrationVersion } from './storage/sqlite/migrations'

export const APP_API_VERSION = 2
export const DATABASE_SCHEMA_VERSION = latestMigrationVersion
export const BUNDLE_FORMAT_VERSION = 1
export const UPDATE_MANIFEST_VERSION = 1
export const READER_API_VERSION = 1

export type CapabilityExecution = 'engine' | 'platform-host' | 'client'

export interface CapabilityState {
    supported: boolean
    available: boolean
    execution: CapabilityExecution
    reason:
        | 'Available'
        | 'NoPlatformHost'
        | 'UnsupportedPlatform'
        | 'MissingSystemDependency'
        | 'MissingSecureCredentialBackend'
        | 'MissingManagedBrowser'
        | 'UnavailableInRuntime'
        | 'DisabledByConfiguration'
}

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
        recommendationV3: boolean
        behaviorLearning: boolean
        multiTagPreference: boolean
        adaptiveRecommendationBatches: boolean
        remoteApi: boolean
        remoteWebSessions: boolean
        remoteWebShell: boolean
        remoteWebPwa: boolean
    }
    runtime: {
        role: 'desktop' | 'server' | 'engine'
        mode: 'interactive' | 'headless' | 'embedded'
        platform: string
        arch: string
    }
    capabilityStates: {
        selfUpdate: CapabilityState
        nativeFolderPicker: CapabilityState
        nativeSavePicker: CapabilityState
        secureCredentialPersistence: CapabilityState
        managedEhWebLogin: CapabilityState
        remoteApi: CapabilityState
        remoteWebSessions: CapabilityState
        remoteWebShell: CapabilityState
        remoteWebPwa: CapabilityState
    }
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {}
}

function stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function platformId(platform: NodeJS.Platform) {
    if (platform === 'win32') return 'windows'
    if (platform === 'darwin') return 'macos'
    if (platform === 'linux') return 'linux'
    return 'unsupported'
}

function capabilityState(input: {
    supported: boolean
    available: boolean
    hostPresent: boolean
    unavailableReason: CapabilityState['reason']
}): CapabilityState {
    const reason: CapabilityState['reason'] = !input.supported
        ? 'UnsupportedPlatform'
        : !input.hostPresent
          ? 'NoPlatformHost'
          : input.available
            ? 'Available'
            : input.unavailableReason
    return {
        supported: input.supported,
        available: input.supported && input.hostPresent && input.available,
        execution: 'platform-host',
        reason
    }
}

export function appCapabilities(
    providerFavoriteMutation = false,
    platform: NodeJS.Platform = process.platform,
    arch = process.arch,
    hostStatus?: Record<string, unknown> | null
): AppCapabilities {
    const hostPresent = Boolean(hostStatus)
    const host = record(hostStatus)
    const runtimeStatus = record(host.runtime)
    const platformStatus = record(host.platform)
    const credentialBackend = record(host.credentialBackend)
    const nativePicker = record(host.nativePicker)

    const fallbackPlatform = platformId(platform)
    const runtimePlatform =
        stringValue(platformStatus.id) ?? fallbackPlatform
    const runtimeArch = stringValue(platformStatus.arch) ?? arch
    const runtimeFoundation =
        platformStatus.runtimeFoundation === true ||
        (!hostPresent &&
            (fallbackPlatform === 'windows' ||
                fallbackPlatform === 'macos' ||
                fallbackPlatform === 'linux'))
    const mode =
        stringValue(runtimeStatus.mode) === 'headless'
            ? 'headless'
            : hostPresent
              ? 'interactive'
              : 'embedded'
    const role = mode === 'headless' ? 'server' : hostPresent ? 'desktop' : 'engine'

    const selfUpdateSupported =
        runtimePlatform === 'windows' && runtimeArch === 'x64'
    const selfUpdate = capabilityState({
        supported: selfUpdateSupported,
        available: platformStatus.selfUpdate === true,
        hostPresent,
        unavailableReason: 'UnavailableInRuntime'
    })
    const nativeFolderPicker = capabilityState({
        supported: runtimeFoundation,
        available: nativePicker.folderPicker === true,
        hostPresent,
        unavailableReason: 'MissingSystemDependency'
    })
    const nativeSavePicker = capabilityState({
        supported: runtimeFoundation,
        available: nativePicker.savePicker === true,
        hostPresent,
        unavailableReason: 'MissingSystemDependency'
    })
    const secureCredentialPersistence = capabilityState({
        supported: runtimeFoundation,
        available: credentialBackend.securePersistence === true,
        hostPresent,
        unavailableReason: 'MissingSecureCredentialBackend'
    })
    const managedEhWebLogin = capabilityState({
        supported: runtimeFoundation,
        available: Boolean(host.managedEhBrowser),
        hostPresent,
        unavailableReason: 'MissingManagedBrowser'
    })
    const remoteStatus = record(host.remoteApi)
    const remoteApi: CapabilityState = !hostPresent
        ? {
              supported: false,
              available: false,
              execution: 'platform-host',
              reason: 'NoPlatformHost'
          }
        : mode !== 'headless'
          ? {
                supported: false,
                available: false,
                execution: 'platform-host',
                reason: 'UnavailableInRuntime'
            }
          : remoteStatus.enabled === true
            ? {
                  supported: true,
                  available: true,
                  execution: 'platform-host',
                  reason: 'Available'
              }
            : {
                  supported: true,
                  available: false,
                  execution: 'platform-host',
                  reason: 'DisabledByConfiguration'
              }
    const remoteWebSessions: CapabilityState = !hostPresent
        ? {
              supported: false,
              available: false,
              execution: 'platform-host',
              reason: 'NoPlatformHost'
          }
        : mode !== 'headless'
          ? {
                supported: false,
                available: false,
                execution: 'platform-host',
                reason: 'UnavailableInRuntime'
            }
          : remoteStatus.webSessions === true
            ? {
                  supported: true,
                  available: true,
                  execution: 'platform-host',
                  reason: 'Available'
              }
            : {
                  supported: true,
                  available: false,
                  execution: 'platform-host',
                  reason: 'DisabledByConfiguration'
              }
    const remoteWebShell: CapabilityState = !hostPresent
        ? {
              supported: false,
              available: false,
              execution: 'platform-host',
              reason: 'NoPlatformHost'
          }
        : mode !== 'headless'
          ? {
                supported: false,
                available: false,
                execution: 'platform-host',
                reason: 'UnavailableInRuntime'
            }
          : remoteStatus.webShell === true
            ? {
                  supported: true,
                  available: true,
                  execution: 'platform-host',
                  reason: 'Available'
              }
            : {
                  supported: true,
                  available: false,
                  execution: 'platform-host',
                  reason: 'DisabledByConfiguration'
              }
    const remoteWebPwa: CapabilityState = !hostPresent
        ? {
              supported: false,
              available: false,
              execution: 'platform-host',
              reason: 'NoPlatformHost'
          }
        : mode !== 'headless'
          ? {
                supported: false,
                available: false,
                execution: 'platform-host',
                reason: 'UnavailableInRuntime'
            }
          : remoteStatus.webPwa === true
            ? {
                  supported: true,
                  available: true,
                  execution: 'platform-host',
                  reason: 'Available'
              }
            : {
                  supported: true,
                  available: false,
                  execution: 'platform-host',
                  reason: 'DisabledByConfiguration'
              }

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
            updatePackages: selfUpdate.available,
            recommendationSessions: true,
            previewPages: true,
            recommendationV3: true,
            behaviorLearning: true,
            multiTagPreference: true,
            adaptiveRecommendationBatches: true,
            remoteApi: remoteApi.available,
            remoteWebSessions: remoteWebSessions.available,
            remoteWebShell: remoteWebShell.available,
            remoteWebPwa: remoteWebPwa.available
        },
        runtime: {
            role,
            mode,
            platform: runtimePlatform,
            arch: runtimeArch
        },
        capabilityStates: {
            selfUpdate,
            nativeFolderPicker,
            nativeSavePicker,
            secureCredentialPersistence,
            managedEhWebLogin,
            remoteApi,
            remoteWebSessions,
            remoteWebShell,
            remoteWebPwa
        }
    }
}
