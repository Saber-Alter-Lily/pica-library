export const RELEASED_INCREMENTAL_SHA256: string

export interface LegacyLaunchObservation {
    extractedFunctionSha256: string
    launches: Array<{
        executable: string
        argumentCount: number
        detached: boolean
        windowsHide: boolean
    }>
    returnedPromise: boolean
    childErrorListenersAfterReturn: number
    asynchronousErrorEscapedFunction: boolean
    promiseOutcomeAfterError: string | null
}

export function observeLegacyLaunch(
    source: string,
    options: {
        name: string
        fsAlias: string
        spawnAlias: string
        pathAlias?: string
        packaged: boolean
        argument: unknown
    }
): Promise<LegacyLaunchObservation>

export interface ReleasedUpgradePathAudit {
    status: 'VERIFIED_LEGACY_BOTH_PATH_COUNTEREXAMPLES_NOT_UPGRADE_PASS'
    baseline: Readonly<{
        version: string
        sourceSha: string
        zipSha256: string
        desktopSha256: string
        helperSha256: string
        incrementalHelperSha256: string
    }>
    launchObservations: Array<LegacyLaunchObservation & { path: string }>
    helperGlobalErrorHooks: { incremental: string[]; full: string[] }
    incrementalDependency: {
        entry: string
        sha256: string
        imports: string[]
        globalErrorHooks: string[]
    }
    legacyPathGuard: {
        canonicalBlocked: boolean
        caseVariantBlocked: boolean
        caseVariantIsSupportedTransition: false
        warning: string
    }
    controllerSelection: {
        extractedMethods: Array<{ name: string; sha256: string }>
        usesInstalledOrRegisteredOldHelper: boolean
        stagedCandidateHelperWasNotRead: boolean
        launches: Array<{
            executable: string
            helperSha256: string
            usesCandidateHelper: boolean
        }>
        handoffs: Array<{
            returnedAcceptedBeforeStartup: boolean
            childErrorListeners: number
            asynchronousErrorEscapedExtractedMethod: boolean
            actualDesktopGlobalHandlerEffect: string
        }>
        filesystem: string
        runtimeBytes: string
    }
    legacyFirstHopAccepted: false
    actualInstalledRecoveryExecuted: false
    realSpawnFileMutationNetworkApplicationOrJava: false
    conclusion: string
}

export function auditReleasedUpgradePaths(
    file: string
): Promise<ReleasedUpgradePathAudit>
