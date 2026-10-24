import { LegacyRecommendationRetrieval } from '../recommendation/legacy-retrieval'
import { legacyRecallPorts } from '../services/legacy-recommendation-adapter'
import fs from 'node:fs'
import { WorkIdentityQueriesV5 } from '../identity/queries-v5'
import { WorkIdentityCommandsV5 } from '../identity/commands-v5'
import { WorkIdentityTaskV5 } from '../identity/task-v5'
import { workIdentityReadPortV5, workIdentityWritePortV5, workIdentityTaskPortsV5 } from '../services/work-identity-adapter'
import { executeRecommendationShadowV5 } from '../recommendation/shadow-execution-v5'
import { RecommendationShadowTaskV5 } from '../recommendation/shadow-task-v5'
import { recommendationShadowPortsV5 } from '../services/recommendation-shadow-adapter'
import type { RecommendationShadowRuntimeV5 } from '../recommendation/shadow-ports-v5'
import { buildRecommendationCycleV3 } from '../recommendation/build-pipeline'
import { recommendationBuildPortsV3 } from '../services/recommendation-build-adapter'
import { RecommendationAuditQueriesV5 } from '../recommendation/audit-queries-v5'
import { recommendationAuditReadPortV5, recommendationAuditSnapshotV5 } from '../services/recommendation-audit-adapter'
import { SourceRuntime, type SourceId } from '../sources/source-policy'
import { JmProvider } from '../providers/jm-provider'
import { ProviderFavoritesImport } from '../providers/favorites-import'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import pLimit from 'p-limit'
import { Pica } from '../sdk'
import {
    EhProvider,
    parseEhTag,
    type EhSession
} from '../providers/eh-provider'
import {
    providerComicToRecord,
    type EhBrowseMode,
    type EhSurface,
    type OnlineSource,
    type ProviderComic,
    type SearchRequest
} from '../providers/types'
import type { Comic, Episode, Picture } from '../types'
import { LibraryDatabase } from './database'
import { TagProfileExchangeV1 } from '../recommendation-v5/tag-profile-exchange'
import { normalizeAuthorKey } from './author'
import { safeRasterContentType, trustedCoverUrl } from './cover-url'
import type {
    FavoriteRecord,
    SortMode,
    StoredComic
} from './types'
import { DownloadScheduler } from '../core/downloads/scheduler'
import { MediaRequestGate } from '../core/downloads/media-gate'
import {
    resolvePerformanceSettings,
    type PerformanceProfile,
    type PerformanceSettings
} from '../core/downloads/profiles'
import {
    defaultLibraryTemplate,
    renderLibraryPath,
    safePathSegment
} from './path-template'
import {
    organizeLibraryViews,
    type LibraryOrganizeProgress
} from './organizer'
import type {
    CreateDownloadJob,
    DownloadJob,
    DownloadRunner
} from '../core/downloads/types'
import { checkComicUpdates, type UpdateFinding } from '../maintenance/updates'
import { scanRepairIssues, type RepairIssue } from '../maintenance/repair'
import {
    ProviderService,
    type FavoritesSyncMode
} from '../services/provider-service'
import type { UserEventInput } from '../recommendation-v3/types'
import {
    buildHistoricalTasteSnapshot,
    type HistoricalTasteSnapshot
} from '../recommendation-v3/taste-chronicle'
import { runtimeRegistryDirectory } from '../recommendation-v3/runtime-registry-path'
import {
    buildVisualPreferenceProfile,
    cosineSimilarity,
    selectPreferredVisualEmbeddings,
    visualAffinity,
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_PROFILE_VERSION,
    VISUAL_RERANK_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION,
    type VisualEmbeddingRecord,
    type VisualInfluenceStrength,
    type VisualRerankMode,
    type VisualSamplingMode
} from '../recommendation-v4/visual-style'
import {
    loadTagRegistryV3,
    resolveTagV3
} from '../recommendation-v3/tag-resolution-v3'
import {
    RecommendationPolicyStoreV5,
    type MobileRecommendationSyncV5
} from '../recommendation-v5/policy-store'
import { buildBehaviorEvidenceLedgerV5 } from '../recommendation-v5/behavior-evidence'
import { buildCandidateChannelPlanV5 } from '../recommendation-v5/candidate-channels'
import {
    compileCandidateProviderRoutesV5,
    deriveObservedEhCanonicalBindingsV5
} from '../recommendation-v5/provider-query-compiler'
import { buildPreferenceTimescalesV5 } from '../recommendation-v5/preference-timescales'
import { evaluateP3PromotionGateV5 } from '../recommendation-v5/promotion-gate'
import { buildVisualRepresentationQcV5 } from '../recommendation-v5/visual-representation-qc'
import { buildVisualAuthorAtlasV5 } from '../recommendation-v5/visual-author-atlas'
import { buildVisualStyleFamiliesV5 } from '../recommendation-v5/visual-style-families'
import { evaluateVisualActivationGateV5 } from '../recommendation-v5/visual-activation-gate'
import { buildRetrospectiveBenchmarkV5 } from '../recommendation-v5/retrospective-benchmark'
import { evaluateSteerabilityV5 } from '../recommendation-v5/steerability-audit'
import { buildEvaluationFrameworkV5 } from '../recommendation-v5/evaluation-framework'
import { compareRetrospectiveBenchmarksV5 } from '../recommendation-v5/benchmark-comparison'
import {
    evaluateAdvancedLearningGateV5,
    type AdvancedLearningDirectionV5
} from '../recommendation-v5/advanced-learning-gate'
import {
    filterCandidatesAgainstOwnedV5,
    RECOMMENDATION_V5_POLICY_STATE_KEY,
    type PortablePolicyStateV5,
    normalizePreferenceKey,
    workIdentitySignalsV2
} from '../recommendation-v5/portable-policy'
import {
    createPreferencePresentationIndex,
    searchPreferenceSignalsV5,
    type PreferencePresentationIndex
} from '../recommendation-v5/preference-discovery'
import {
    projectTasteChronicleView,
    type ChronicleViewOptions
} from '../recommendation-v3/taste-chronicle-view'
import { buildTagDirectoryV1, normalizeTagPolicyV1, privateTagForSignalV1, projectComicTagSignalsV1, tagPoliciesEqualV1, rawTagParticipatesV1, comicTagProviderV1, providerRawTagFactsV1 } from '../tags/policy'
import {
    WORK_IDENTITY_RESOLVER_VERSION
} from '../recommendation-v5/work-identity-foundation'
import { AnalysisTimingRegistry } from '../runtime/analysis-timing'
import { RuntimeResourceCoordinator } from '../runtime/resource-coordinator'
import { runtimeTaskDiagnosticSnapshot } from '../runtime/task-diagnostics'

export { WORK_IDENTITY_MATERIALIZATION_PREPARE_CONFIRMATION } from '../identity/ports-v5'
export { RECOMMENDATION_V5_SHADOW_RETRIEVAL_CONFIRMATION } from '../recommendation/shadow-ports-v5'

const DOWNLOAD_PROGRESS_PERSIST_INTERVAL_MS = 250

export interface DiscoverQuery {
    keyword?: string
    tags?: string[]
    categories?: string[]
    sort?: SortMode
    limit?: number
    providers?: OnlineSource[]
    ehMode?: EhBrowseMode
    ehToplist?: string
    ehLanguage?: string
    ehExcludeTags?: string[]
    ehMinRating?: number
    ehPageFrom?: number
    ehPageTo?: number
}

export interface DownloadProgress {
    comicId: string
    comicTitle: string
    episodeId: string
    episodeTitle: string
    completed: number
    total: number
    bytes: number
    file?: string
}

export interface DownloadResult {
    comicId: string
    title: string
    episodes: number
    pictures: number
    downloaded: number
    skipped: number
    completed: number
    bytes: number
}

class RecommendationBuildCancelledError extends Error {
    constructor() {
        super('Recommendation generation was cancelled')
        this.name = 'RecommendationBuildCancelledError'
    }
}

class FavoritesSyncCancelledError extends Error {
    constructor() {
        super('Favorites sync was cancelled')
        this.name = 'FavoritesSyncCancelledError'
    }
}

class MaintenanceUpdateCancelledError extends Error {
    constructor() {
        super('Maintenance update scan was cancelled')
        this.name = 'MaintenanceUpdateCancelledError'
    }
}

class MaintenanceRepairCancelledError extends Error {
    constructor() {
        super('Maintenance repair scan was cancelled')
        this.name = 'MaintenanceRepairCancelledError'
    }
}

export interface MaintenanceRepairProgress {
    state:
        | 'idle'
        | 'running'
        | 'pausing'
        | 'paused'
        | 'cancelling'
        | 'complete'
        | 'failed'
        | 'cancelled'
    phase: 'idle' | 'scanning' | 'paused' | 'complete' | 'failed' | 'cancelled'
    done: number
    total: number
    issueCount: number
    startedAt?: string
    updatedAt?: string
    error?: string
}

class LibraryOrganizeCancelledError extends Error {
    constructor() {
        super('Library organize task was cancelled')
        this.name = 'LibraryOrganizeCancelledError'
    }
}

export interface LibraryOrganizeTaskProgress {
    state:
        | 'idle'
        | 'running'
        | 'pausing'
        | 'paused'
        | 'cancelling'
        | 'complete'
        | 'failed'
        | 'cancelled'
    phase: 'idle' | 'organizing' | 'paused' | 'complete' | 'failed' | 'cancelled'
    done: number
    total: number
    linked: number
    existing: number
    manifests: number
    skipped: number
    startedAt?: string
    updatedAt?: string
    error?: string
}



export type { WorkIdentityEvidenceRefreshTaskProgress } from '../identity/ports-v5'

export type { RecommendationV5ShadowTaskProgress } from '../recommendation/shadow-ports-v5'

export interface MaintenanceUpdateProgress {
    state:
        | 'idle'
        | 'running'
        | 'pausing'
        | 'paused'
        | 'cancelling'
        | 'complete'
        | 'failed'
        | 'cancelled'
    phase: 'idle' | 'checking' | 'paused' | 'complete' | 'failed' | 'cancelled'
    done: number
    total: number
    findingCount: number
    updateCount: number
    startedAt?: string
    updatedAt?: string
    error?: string
}

export interface FavoritesSyncProgress {
    phase:
        | 'idle'
        | 'reading'
        | 'processing'
        | 'pausing'
        | 'paused'
        | 'cancelling'
        | 'complete'
        | 'failed'
        | 'cancelled'
    mode?: FavoritesSyncMode
    page?: number
    pages?: number
    fetched?: number
    total?: number
    processed?: number
    error?: string
    found?: number
    fallbackReason?: string
}

function comicToRecord(comic: Comic): FavoriteRecord {
    return {
        comicId: comic._id,
        title: comic.title.trim(),
        author: comic.author ?? '',
        description: comic.description ?? '',
        chineseTeam: comic.chineseTeam ?? '',
        categories: comic.categories ?? [],
        tags: comic.tags ?? [],
        finished: Boolean(comic.finished),
        createdAt: comic.created_at,
        updatedAt: comic.updated_at,
        totalLikes: comic.totalLikes ?? comic.likesCount ?? 0,
        totalViews: comic.totalViews ?? comic.viewsCount ?? 0,
        pagesCount: comic.pagesCount ?? 0,
        epsCount: comic.epsCount ?? 0,
        coverUrl: trustedCoverUrl(
            comic.thumb?.fileServer && comic.thumb.path
                ? `${comic.thumb.fileServer}/static/${comic.thumb.path}`
                : undefined
        )
    }
}

function sortCode(pica: Pica, sort: SortMode | undefined) {
    if (sort === 'latest') return pica.Order.latest
    if (sort === 'oldest') return pica.Order.oldest
    if (sort === 'views') return pica.Order.point
    if (sort === 'likes' || sort === 'recommended') return pica.Order.loved
    return pica.Order.default
}

export class LibraryService {
    private tagProfileExchangeInstance?: TagProfileExchangeV1

    tagProfileExchangeV1(): TagProfileExchangeV1 {
        return this.tagProfileExchangeInstance ??= new TagProfileExchangeV1(
            this.database, () => this.recommendationTagPolicyV1(), () => this.preferenceViewState()
        )
    }
    private pica: Pica | null = null
    private readonly ehProvider: EhProvider
    private readonly jmProvider = new JmProvider()
    private readonly coverRequests = new Map<string, Promise<{ data: Buffer; contentType: string; cached: boolean }>>()
    private readonly jmFavorites = new ProviderFavoritesImport()
    private jmMetadataGeneration = 0
    private jmMetadataBusy = false
    private acceptingLocalDownloads = true
    private readonly activeLocalRuns = new Set<Promise<void>>()
    private readonly activeLocalSchedulers = new Set<DownloadScheduler>()
    private localDownloadRunStartedAt: string | null = null
    private localDownloadLastError: string | null = null
    private recoveredLocalDownloadJobs = 0
    private favoritesProgress: FavoritesSyncProgress = { phase: 'idle' }
    private favoritesTaskState:
        | 'idle'
        | 'running'
        | 'pausing'
        | 'paused'
        | 'cancelling'
        | 'complete'
        | 'failed'
        | 'cancelled' = 'idle'
    private favoritesPauseRequested = false
    private favoritesCancelRequested = false
    private readonly favoritesResumeWaiters = new Set<() => void>()
    private recommendationProgress: {
        state:
            | 'idle'
            | 'running'
            | 'pausing'
            | 'paused'
            | 'cancelling'
            | 'complete'
            | 'failed'
            | 'cancelled'
        phase: string
        done: number
        total: number
        error?: string
    } = {
        state: 'idle',
        phase: 'idle',
        done: 0,
        total: 7
    }
    private recommendationPauseRequested = false
    private recommendationCancelRequested = false
    private readonly recommendationResumeWaiters = new Set<() => void>()
    private recommendationBuildCycleId: string | null = null
    private latestRecommendationBuildCycleId: string | null = null

    private maintenanceUpdateProgress: MaintenanceUpdateProgress = {
        state: 'idle',
        phase: 'idle',
        done: 0,
        total: 0,
        findingCount: 0,
        updateCount: 0
    }
    private maintenanceUpdatePauseRequested = false
    private maintenanceUpdateCancelRequested = false
    private readonly maintenanceUpdateResumeWaiters = new Set<() => void>()
    private maintenanceUpdateFindings: UpdateFinding[] = []
    private maintenanceUpdateRun: Promise<void> | null = null

    private maintenanceRepairProgress: MaintenanceRepairProgress = {
        state: 'idle',
        phase: 'idle',
        done: 0,
        total: 0,
        issueCount: 0
    }
    private maintenanceRepairPauseRequested = false
    private maintenanceRepairCancelRequested = false
    private readonly maintenanceRepairResumeWaiters = new Set<() => void>()
    private maintenanceRepairIssues: RepairIssue[] = []
    private maintenanceRepairRun: Promise<void> | null = null

    private libraryOrganizeProgress: LibraryOrganizeTaskProgress = {
        state: 'idle',
        phase: 'idle',
        done: 0,
        total: 0,
        linked: 0,
        existing: 0,
        manifests: 0,
        skipped: 0
    }
    private libraryOrganizePauseRequested = false
    private libraryOrganizeCancelRequested = false
    private readonly libraryOrganizeResumeWaiters = new Set<() => void>()
    private libraryOrganizeRun: Promise<void> | null = null
    private libraryOrganizeResult:
        | Awaited<ReturnType<typeof organizeLibraryViews>>
        | null = null

    private readonly recommendationShadowTaskV5 =
        new RecommendationShadowTaskV5({
            acquire: () => this.runtimeResources.acquire({
                ownerId: 'recommendation-v5-shadow',
                taskType: 'recommendation-v5-shadow',
                priority: 'background',
                resources: {
                    'provider-network': 1,
                    'cpu-analysis': 1,
                    'sqlite-write-heavy': 1
                }
            }),
            run: (input, runtime) =>
                this.runRecommendationV5ShadowRetrieval(input, runtime)
        })
    private readonly visualAnalysisTimings = new AnalysisTimingRegistry()
    private readonly runtimeResources: RuntimeResourceCoordinator

    private readonly workIdentityTaskV5: WorkIdentityTaskV5

    runtimeResourceProfile() {
        return this.runtimeResources.snapshot()
    }

    runtimeTaskDiagnostics() {
        const resources = this.runtimeResourceProfile()
        const recommendation = this.recommendationBuildProgress()
        const favorites = this.favoritesSyncProgress()
        const update = this.maintenanceUpdateStatus()
        const repair = this.maintenanceRepairStatus()
        const organize = this.libraryOrganizeStatus()
        const shadow = this.recommendationV5ShadowStatus()
        const identity = this.recommendationV5WorkIdentityEvidenceRefreshStatus()
        const downloads = this.localDownloadRuntime()
        const downloadPage = this.database.listDownloadJobsPage({
            view: 'active',
            runner: 'LOCAL',
            limit: 1
        })
        const firstDownload = downloadPage.items[0]
        const downloadState = downloads.running
            ? 'running'
            : firstDownload?.status === 'PAUSED'
              ? 'paused'
              : firstDownload?.status === 'FAILED'
                ? 'failed'
                : firstDownload
                  ? 'waiting'
                  : 'idle'

        return runtimeTaskDiagnosticSnapshot(
            [
                {
                    taskKey: 'recommendation-v3',
                    taskId: this.recommendationBuildCycleId,
                    taskType: 'recommendation-v3-build',
                    state: recommendation.state,
                    phase: recommendation.phase,
                    done: recommendation.done,
                    total: recommendation.total,
                    canPause: recommendation.canPause,
                    canResume: recommendation.canResume,
                    canCancel: recommendation.canCancel,
                    canRetry: null,
                    pauseSemantics: 'in_place',
                    resourceClasses: [
                        'provider-network',
                        'cpu-analysis',
                        'sqlite-read-heavy',
                        'sqlite-write-heavy'
                    ],
                    lastError: recommendation.error,
                    recoveryMode: 'reset_interrupted_build_keep_last_good',
                    commitBoundary:
                        'new recommendation cycle promoted only after successful final build'
                },
                {
                    taskKey: 'favorites-sync',
                    taskType: 'favorites-sync',
                    state: favorites.state,
                    phase: favorites.phase,
                    done: favorites.processed ?? favorites.fetched,
                    total: favorites.total,
                    canPause: favorites.canPause,
                    canResume: favorites.canResume,
                    canCancel: favorites.canCancel,
                    canRetry: null,
                    pauseSemantics: 'in_place',
                    resourceClasses: [
                        'provider-network',
                        'sqlite-write-heavy'
                    ],
                    lastError: favorites.error,
                    recoveryMode: 'rerun_with_committed_cache_reuse',
                    commitBoundary:
                        'favorite reconciliation committed only after completed remote listing'
                },
                {
                    taskKey: 'maintenance-update',
                    taskType: 'maintenance-update-scan',
                    state: update.state,
                    phase: update.phase,
                    done: update.done,
                    total: update.total,
                    startedAt: update.startedAt,
                    updatedAt: update.updatedAt,
                    canPause: update.canPause,
                    canResume: update.canResume,
                    canCancel: update.canCancel,
                    canRetry: null,
                    pauseSemantics: 'in_place',
                    resourceClasses: [
                        'provider-network',
                        'sqlite-write-heavy'
                    ],
                    lastError: update.error,
                    recoveryMode: 'restart_scan',
                    commitBoundary:
                        'findings become authoritative only through completed scan state'
                },
                {
                    taskKey: 'maintenance-repair',
                    taskType: 'maintenance-repair-scan',
                    state: repair.state,
                    phase: repair.phase,
                    done: repair.done,
                    total: repair.total,
                    startedAt: repair.startedAt,
                    updatedAt: repair.updatedAt,
                    canPause: repair.canPause,
                    canResume: repair.canResume,
                    canCancel: repair.canCancel,
                    canRetry: null,
                    pauseSemantics: 'in_place',
                    resourceClasses: [
                        'filesystem-heavy',
                        'sqlite-read-heavy'
                    ],
                    lastError: repair.error,
                    recoveryMode: 'restart_scan',
                    commitBoundary:
                        'repair scan is review-only; no destructive mutation is committed by the scan'
                },
                {
                    taskKey: 'library-organize',
                    taskType: 'library-organize',
                    state: organize.state,
                    phase: organize.phase,
                    done: organize.done,
                    total: organize.total,
                    startedAt: organize.startedAt,
                    updatedAt: organize.updatedAt,
                    canPause: organize.canPause,
                    canResume: organize.canResume,
                    canCancel: organize.canCancel,
                    canRetry: null,
                    pauseSemantics: 'in_place',
                    resourceClasses: ['filesystem-heavy'],
                    lastError: organize.error,
                    recoveryMode: 'restart_from_checkpointed_filesystem_state',
                    commitBoundary:
                        'final indexes and manifests publish only after the last organize checkpoint'
                },
                {
                    taskKey: 'recommendation-v5-shadow',
                    taskType: 'recommendation-v5-shadow',
                    state: shadow.state,
                    phase: shadow.phase,
                    done: shadow.done,
                    total: shadow.total,
                    startedAt: shadow.startedAt,
                    updatedAt: shadow.updatedAt,
                    canPause: shadow.canPause,
                    canResume: shadow.canResume,
                    canCancel: shadow.canCancel,
                    canRetry: null,
                    pauseSemantics: 'in_place',
                    resourceClasses: [
                        'provider-network',
                        'cpu-analysis',
                        'sqlite-write-heavy'
                    ],
                    lastError: shadow.error,
                    recoveryMode: 'restart_shadow_analysis',
                    commitBoundary:
                        'shadow result remains non-serving and publishes only at terminal success'
                },
                {
                    taskKey: 'work-identity-evidence',
                    taskType: 'work-identity-evidence-refresh',
                    state: identity.state,
                    phase: identity.phase,
                    done: identity.done,
                    total: identity.total,
                    startedAt: identity.startedAt,
                    updatedAt: identity.updatedAt,
                    canPause: identity.canPause,
                    canResume: identity.canResume,
                    canCancel: identity.canCancel,
                    canRetry: null,
                    pauseSemantics: 'in_place',
                    resourceClasses: [
                        'cpu-analysis',
                        'sqlite-read-heavy',
                        'sqlite-write-heavy'
                    ],
                    lastError: identity.error,
                    recoveryMode: 'restart_checkpointed_evidence_refresh',
                    commitBoundary:
                        'evidence persists only after the final cooperative checkpoint'
                },
                {
                    taskKey: 'local-downloads',
                    taskType: 'local-download-runner',
                    state: downloadState,
                    phase: downloads.running
                        ? 'draining'
                        : firstDownload?.status.toLowerCase() ?? 'idle',
                    startedAt: downloads.startedAt,
                    updatedAt: firstDownload?.progressUpdatedAt,
                    canPause: null,
                    canResume: null,
                    canCancel: null,
                    canRetry: null,
                    pauseSemantics: 'in_place',
                    resourceClasses: [
                        'media-network',
                        'filesystem-heavy',
                        'sqlite-write-heavy'
                    ],
                    lastError: downloads.lastError,
                    recoveryMode: 'db_backed_verified_page_resume',
                    commitBoundary:
                        'verified files/pages plus SQLite download job state'
                }
            ],
            resources
        )
    }

    runtimeActiveTaskTypes() {
        return this.runtimeResources.activeTaskTypes()
    }

    private allComicsForIdentity(): StoredComic[] {
        return this.database.listComics(
            {
                limit: Number.MAX_SAFE_INTEGER,
                sort: 'latest'
            },
            Number.MAX_SAFE_INTEGER
        )
    }

    recommendationBuildProgress() {
        return {
            ...this.recommendationProgress,
            canPause:
                this.recommendationProgress.phase !== 'persist' &&
                (this.recommendationProgress.state === 'running' ||
                    this.recommendationProgress.state === 'pausing'),
            canResume: this.recommendationProgress.state === 'paused',
            canCancel:
                this.recommendationProgress.phase !== 'persist' &&
                ['running', 'pausing', 'paused', 'cancelling'].includes(
                    this.recommendationProgress.state
                )
        }
    }

    recommendationBuildControl(action: 'pause' | 'resume' | 'cancel') {
        if (this.recommendationProgress.phase === 'persist') return this.recommendationBuildProgress()
        if (action === 'pause') {
            if (this.recommendationProgress.state === 'running') {
                this.recommendationPauseRequested = true
                this.recommendationProgress = {
                    ...this.recommendationProgress,
                    state: 'pausing'
                }
            }
            return this.recommendationBuildProgress()
        }
        if (action === 'resume') {
            this.recommendationPauseRequested = false
            for (const resolve of this.recommendationResumeWaiters) resolve()
            this.recommendationResumeWaiters.clear()
            if (
                this.recommendationProgress.state === 'paused' ||
                this.recommendationProgress.state === 'pausing'
            )
                this.recommendationProgress = {
                    ...this.recommendationProgress,
                    state: 'running'
                }
            return this.recommendationBuildProgress()
        }
        this.recommendationCancelRequested = true
        this.recommendationPauseRequested = false
        for (const resolve of this.recommendationResumeWaiters) resolve()
        this.recommendationResumeWaiters.clear()
        if (
            this.recommendationProgress.state === 'running' ||
            this.recommendationProgress.state === 'pausing' ||
            this.recommendationProgress.state === 'paused'
        )
            this.recommendationProgress = {
                ...this.recommendationProgress,
                state: 'cancelling'
            }
        return this.recommendationBuildProgress()
    }

    private beginRecommendationBuild(cycleId: string) {
        this.recommendationBuildCycleId = cycleId
        this.latestRecommendationBuildCycleId = cycleId
        this.recommendationPauseRequested = false
        this.recommendationCancelRequested = false
        this.recommendationResumeWaiters.clear()
        this.recommendationProgress = {
            state: 'running',
            phase: 'profile',
            done: 0,
            total: 7
        }
    }

    private async recommendationCheckpoint() {
        if (this.recommendationCancelRequested)
            throw new RecommendationBuildCancelledError()
        if (!this.recommendationPauseRequested) return
        this.recommendationProgress = {
            ...this.recommendationProgress,
            state: 'paused'
        }
        await new Promise<void>((resolve) =>
            this.recommendationResumeWaiters.add(resolve)
        )
        if (this.recommendationCancelRequested)
            throw new RecommendationBuildCancelledError()
        this.recommendationProgress = {
            ...this.recommendationProgress,
            state: 'running'
        }
    }

    private finishRecommendationBuild() {
        this.recommendationBuildCycleId = null
        this.recommendationPauseRequested = false
        this.recommendationCancelRequested = false
        for (const resolve of this.recommendationResumeWaiters) resolve()
        this.recommendationResumeWaiters.clear()
    }

    /** A completed computation is not a persisted/promoted recommendation cycle. */
    recommendationBuildCommitState(
        cycleId: string,
        state: 'persisting' | 'committed' | 'failed' | 'discarded',
        error?: unknown
    ) {
        if (cycleId !== this.latestRecommendationBuildCycleId) return
        if (state === 'persisting') {
            this.recommendationProgress = {
                state: 'running',
                phase: 'persist',
                done: 6,
                total: 7
            }
        } else if (state === 'committed') {
            this.recommendationProgress = {
                state: 'complete',
                phase: 'complete',
                done: 7,
                total: 7
            }
        } else if (state === 'discarded') {
            this.recommendationProgress = {
                ...this.recommendationProgress,
                state: 'cancelled'
            }
        } else if (this.recommendationProgress.state !== 'cancelled') {
            this.recommendationProgress = {
                ...this.recommendationProgress,
                state: 'failed',
                error: error instanceof Error ? error.message : String(error)
            }
        }
    }

    private recoverInterruptedRecommendationBuild() {
        const key = 'recommendation.v3.activeCycle.v1'
        const current = this.database.getAppState<Record<string, unknown>>(key)
        if (
            Number(current?.schemaVersion) !== 1 ||
            !String(current?.buildingCycleId ?? '').trim()
        )
            return false
        this.database.setAppState(key, {
            ...current,
            buildingCycleId: null,
            buildingRequestId: null
        })
        this.recommendationProgress = {
            state: 'failed',
            phase: 'recovered',
            done: 0,
            total: 7,
            error: 'Previous recommendation generation was interrupted and has been reset'
        }
        return true
    }

    recordRecommendationEvent(input: UserEventInput) {
        return this.database.recordUserEvent(input)
    }

    recordRecommendationEvents(inputs: UserEventInput[]) {
        return this.database.recordUserEvents(inputs)
    }

    private preferencePresentationIndex?: PreferencePresentationIndex

    private preferencePresentation() {
        if (!this.preferencePresentationIndex) {
            try {
                this.preferencePresentationIndex = createPreferencePresentationIndex(
                    loadTagRegistryV3(runtimeRegistryDirectory())
                )
            } catch {
                // Do not silently claim semantic equivalence when assets fail.
                return createPreferencePresentationIndex()
            }
        }
        return this.preferencePresentationIndex
    }

    private preferenceViewState() {
        // These GET views must not initialize/persist a policy on an empty library.
        const state = this.database.getAppState<PortablePolicyStateV5>(
            RECOMMENDATION_V5_POLICY_STATE_KEY
        )
        return {
            revision: state?.revision ?? 0,
            tagPolicy: normalizeTagPolicyV1(state?.tagPolicy),
            controls: Array.isArray(state?.controls) ? state.controls : [],
            tasteExcludedComicIds: Array.isArray(state?.tasteExcludedComicIds)
                ? state.tasteExcludedComicIds
                : []
        }
    }

    recommendationV5SearchPreferences(query: string, limit = 100) {
        if (query.length > 160)
            throw new Error('Preference search is limited to 160 characters')
        return searchPreferenceSignalsV5(
            this.database.listAllComics(),
            this.preferenceViewState(),
            query.trim(),
            this.preferencePresentation(),
            limit
        )
    }

    recommendationTagPolicyV1() {
        const state = this.preferenceViewState(), catalog = this.database.listAllComics()
        const index = this.preferencePresentation()
        return {
            revision: state.revision, tagPolicy: state.tagPolicy,
            tagExchange: this.tagProfileExchangeV1().status(),
            directorySource: 'LOCAL_OBSERVED_METADATA',
            note: '收藏涉及数量不是喜好强度；未观测的平台标签不冒充全站目录。',
            rows: buildTagDirectoryV1(catalog, state, (provider, raw) => provider === 'pica' ? index.resolve(raw)?.facet || 'OTHER' : provider === 'eh' && raw.includes(':') ? `EH_${raw.split(':')[0].toUpperCase()}` : 'OTHER'),
            comics: catalog.map(c => ({ comicId: c.comicId, title: c.title, author: c.canonicalAuthor || c.author, providerId: c.providerId, isFavorite: c.isFavorite }))
        }
    }

    updateRecommendationTagPolicyV1(input: { tagPolicy?: unknown; baseRevision?: unknown }) {
        new RecommendationPolicyStoreV5(this.database).setTagPolicy({ tagPolicy: input.tagPolicy, baseRevision: input.baseRevision })
        return this.recommendationTagPolicyV1()
    }

    tasteChronicleView(options: ChronicleViewOptions = {}) {
        const snapshot = this.tasteChronicle()
        if (!snapshot) return { available: false, snapshot: null, view: null }
        return {
            available: true,
            ...projectTasteChronicleView(
                snapshot,
                this.preferenceViewState().controls,
                options,
                this.preferencePresentation()
            )
        }
    }

    recommendationV5Snapshot() {
        return recommendationAuditSnapshotV5(this.database)
    }

    recommendationServingCompositionV3() {
        const state = this.database.getAppState<{
            schemaVersion?: number
            activeCycleId?: string | null
            activeBatchIndex?: number
        }>('recommendation.v3.activeCycle.v1')
        const cycleId = String(state?.activeCycleId ?? '').trim()
        if (!cycleId)
            return {
                available: false,
                source: 'final-v3-serving',
                cycleId: null,
                batchId: null,
                batchIndex: null,
                itemCount: 0,
                primaryFamilies: {},
                reasonCodes: {}
            }
        const pool = this.database.latestV3CandidatePool(cycleId)
        if (!pool)
            return {
                available: false,
                source: 'final-v3-serving',
                cycleId,
                batchId: null,
                batchIndex: null,
                itemCount: 0,
                primaryFamilies: {},
                reasonCodes: {}
            }
        const batches = this.database.listV3Batches(pool.id)
        const requestedIndex = Number(state?.activeBatchIndex ?? -1)
        const batch =
            (requestedIndex >= 0
                ? batches.find((item) => item.batchIndex === requestedIndex)
                : undefined) ?? batches.at(-1)
        if (!batch)
            return {
                available: false,
                source: 'final-v3-serving',
                cycleId,
                poolId: pool.id,
                batchId: null,
                batchIndex: null,
                itemCount: 0,
                primaryFamilies: {},
                reasonCodes: {}
            }
        const rawItems = Array.isArray(batch.evidence?.items)
            ? (batch.evidence.items as Array<Record<string, unknown>>)
            : []
        const policy = new RecommendationPolicyStoreV5(this.database).state()
        const ownership = this.database.recommendationOwnershipState()
        const filterCatalog = this.database.getComicsByIds([
            ...new Set([
                ...ownership.ownedComicIds,
                ...policy.ownedComicIds,
                ...batch.itemIds
            ])
        ])
        const servingRows = filterCandidatesAgainstOwnedV5(
            this.database.recommendationRecords(batch.itemIds),
            filterCatalog,
            policy
        ).rows
        const servingIds = new Set(
            servingRows.map((row) => String(row.comic.comicId))
        )
        const servedItems = rawItems.filter((item) =>
            servingIds.has(String(item.comicId ?? ''))
        )
        const familyCounts: Record<string, number> = {}
        const reasonCounts: Record<string, number> = {}
        const intentCounts: Record<string, number> = {}
        for (const item of servedItems) {
            const family = String(item.primaryFamily ?? 'UNATTRIBUTED')
            familyCounts[family] = (familyCounts[family] ?? 0) + 1
            const intentId = String(item.primaryIntentId ?? '').trim()
            if (intentId)
                intentCounts[intentId] = (intentCounts[intentId] ?? 0) + 1
            const reasons = Array.isArray(item.reasonCodes)
                ? item.reasonCodes.map(String)
                : []
            for (const reason of reasons)
                reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1
        }
        const rawIntentPlan = Array.isArray(
            (pool.telemetry as { intentPlan?: unknown[] })?.intentPlan
        )
            ? ((pool.telemetry as { intentPlan?: unknown[] }).intentPlan ?? [])
            : []
        const intentPlan = new Map(
            rawIntentPlan.flatMap((value) => {
                if (!value || typeof value !== 'object') return []
                const row = value as Record<string, unknown>
                const intentId = String(row.intentId ?? '').trim()
                if (!intentId) return []
                const anchors = Array.isArray(row.anchors)
                    ? row.anchors.flatMap((anchor) => {
                          if (!anchor || typeof anchor !== 'object') return []
                          const item = anchor as Record<string, unknown>
                          const label = String(
                              item.canonicalLabel ??
                                  item.providerQueryLabel ??
                                  item.canonicalKey ??
                                  ''
                          ).trim()
                          return label ? [label] : []
                      })
                    : []
                const explanation =
                    row.explanation &&
                    typeof row.explanation === 'object'
                        ? (row.explanation as Record<string, unknown>)
                        : {}
                return [
                    [
                        intentId,
                        {
                            type: String(row.type ?? 'UNATTRIBUTED'),
                            anchors,
                            shortReason: String(
                                explanation.shortReason ?? ''
                            ).trim()
                        }
                    ] as const
                ]
            })
        )
        const primaryIntents = Object.entries(intentCounts)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([intentId, count]) => ({
                intentId,
                count,
                type: intentPlan.get(intentId)?.type ?? 'UNATTRIBUTED',
                anchors: intentPlan.get(intentId)?.anchors ?? [],
                shortReason: intentPlan.get(intentId)?.shortReason ?? ''
            }))
        return {
            available: true,
            source: 'final-v3-serving',
            tagPolicyStale: !tagPoliciesEqualV1((pool.telemetry.recommendationV5 as { portableBaseline?: { tagPolicy?: unknown } } | undefined)?.portableBaseline?.tagPolicy, policy.tagPolicy),
            cycleId,
            poolId: pool.id,
            poolState: String(pool.telemetry?.state ?? ''),
            batchId: batch.id,
            batchIndex: batch.batchIndex,
            contextId: batch.contextId,
            generatedAt: batch.generatedAt,
            itemCount: servingIds.size,
            allocatedItemCount: batch.itemIds.length,
            servingFilteredCount: batch.itemIds.length - servingIds.size,
            primaryFamilies: familyCounts,
            primaryIntents,
            reasonCodes: reasonCounts,
            items: servedItems.map((item) => ({
                comicId: String(item.comicId ?? ''),
                rawRank: Number(item.rawRank ?? 0),
                rawRankerScore: Number(item.rawRankerScore ?? 0),
                primaryIntentId: String(item.primaryIntentId ?? ''),
                primaryFamily: String(item.primaryFamily ?? 'UNATTRIBUTED'),
                relatedOnly: Boolean(item.relatedOnly),
                recentlyDisplayed: Boolean(item.recentlyDisplayed),
                reasonCodes: Array.isArray(item.reasonCodes)
                    ? item.reasonCodes.map(String)
                    : []
            }))
        }
    }

    recommendationV5ShadowStatus() {
        return this.recommendationShadowTaskV5.status()
    }

    recommendationV5ShadowControl(
        action: 'pause' | 'resume' | 'cancel'
    ) {
        return this.recommendationShadowTaskV5.control(action)
    }

    startRecommendationV5ShadowRetrieval(input: Record<string, unknown>) {
        return this.recommendationShadowTaskV5.start(input)
    }

    async runRecommendationV5ShadowRetrieval(
        input: Record<string, unknown>,
        runtime: RecommendationShadowRuntimeV5 = {}
    ) {
        const sourceRevision = this.sources.snapshot().revision
        return executeRecommendationShadowV5(
            input,
            recommendationShadowPortsV5({
                database: this.database,
                provider: () => this.providerService(),
                plan: (session, limit) =>
                    this.recommendationV5ProviderRoutes(session, limit),
                timescales: (session, limit) =>
                    this.recommendationV5PreferenceTimescales(session, limit),
                createCycleId: () => `v5-shadow:${randomUUID()}`,
                assertSourcesCurrent: () => {
                    if (this.sources.snapshot().revision !== sourceRevision)
                        throw new Error(
                            'Source choices changed during shadow retrieval; no shadow audit was saved'
                        )
                }
            }),
            runtime
        )
    }

    private recommendationAuditQueriesV5() {
        return new RecommendationAuditQueriesV5(recommendationAuditReadPortV5(this.database, {
            visualRepresentationQc: () => this.visualRepresentationQc(),
            visualAuthorAtlas: () => this.visualAuthorAtlas(),
            providerEligibility: () => {
                const status = this.providerService().providerStatus()
                return {pica:Boolean(status.pica.search),eh:Boolean(status.eh.search),exh:Boolean(status.eh.search && status.eh.exHentai && this.ehProvider.hasSession())}
            }
        }))
    }

    recommendationV5AdvancedLearningGate(
        directionInput?: string | null,
        baselineVersion?: string | null,
        candidateVersion?: string | null,
        limit = 1000,
        horizonDays = 30
    ) {
        return this.recommendationAuditQueriesV5().recommendationV5AdvancedLearningGate(directionInput, baselineVersion, candidateVersion, limit, horizonDays)
    }

    recommendationV5BenchmarkVersions(limit = 1000) {
        return this.recommendationAuditQueriesV5().recommendationV5BenchmarkVersions(limit)
    }

    recommendationV5BenchmarkComparison(
        baselineVersion: string,
        candidateVersion: string,
        limit = 1000,
        horizonDays = 30
    ) {
        return this.recommendationAuditQueriesV5().recommendationV5BenchmarkComparison(baselineVersion, candidateVersion, limit, horizonDays)
    }

    recommendationV5EvaluationSummary(
        limit = 200,
        horizonDays = 30,
        steerabilityStep = 3,
        steerabilityTargetLimit = 30
    ) {
        return this.recommendationAuditQueriesV5().recommendationV5EvaluationSummary(limit, horizonDays, steerabilityStep, steerabilityTargetLimit)
    }

    recommendationV5SteerabilityAudit(
        requestedStep = 3,
        targetLimit = 30
    ) {
        return this.recommendationAuditQueriesV5().recommendationV5SteerabilityAudit(requestedStep, targetLimit)
    }

    recommendationV5RetrospectiveBenchmark(
        limit = 200,
        horizonDays = 30
    ) {
        return this.recommendationAuditQueriesV5().recommendationV5RetrospectiveBenchmark(limit, horizonDays)
    }

    recommendationV5VisualActivationGate(limit = 100) {
        return this.recommendationAuditQueriesV5().recommendationV5VisualActivationGate(limit)
    }

    recommendationV5P3PromotionGate(limit = 100) {
        return this.recommendationAuditQueriesV5().recommendationV5P3PromotionGate(limit)
    }

    recommendationV5ShadowRuns(limit = 50) {
        return this.recommendationAuditQueriesV5().recommendationV5ShadowRuns(limit)
    }

    recommendationV5ProviderRoutes(
        appSessionId?: string | null,
        limit = 5000
    ) {
        return this.recommendationAuditQueriesV5().recommendationV5ProviderRoutes(appSessionId, limit)
    }

    recommendationV5CandidateChannels(
        appSessionId?: string | null,
        limit = 5000
    ) {
        return this.recommendationAuditQueriesV5().recommendationV5CandidateChannels(appSessionId, limit)
    }

    recommendationV5PreferenceTimescales(
        appSessionId?: string | null,
        limit = 5000
    ) {
        return this.recommendationAuditQueriesV5().recommendationV5PreferenceTimescales(appSessionId, limit)
    }

    recommendationV5BehaviorEvidence(limit = 5000) {
        return this.recommendationAuditQueriesV5().recommendationV5BehaviorEvidence(limit)
    }

    private workIdentityQueriesV5() {
        return new WorkIdentityQueriesV5(
            workIdentityReadPortV5(this.database, () => this.allComicsForIdentity())
        )
    }

    private workIdentityCommandsV5() {
        return new WorkIdentityCommandsV5(
            this.workIdentityQueriesV5(),
            workIdentityWritePortV5(this.database)
        )
    }

    workVariantsForComic(comicId: string, limit = 24) {
        return this.workIdentityQueriesV5().workVariantsForComic(comicId, limit)
    }

    recommendationV5WorkIdentityEvidenceRefreshStatus() {
        return this.workIdentityTaskV5.status()
    }

    recommendationV5WorkIdentityEvidenceRefreshControl(
        action: 'pause' | 'resume' | 'cancel'
    ) {
        return this.workIdentityTaskV5.control(action)
    }

    startRecommendationV5WorkIdentityEvidenceRefresh(requestedLimit = 500) {
        return this.workIdentityTaskV5.start(requestedLimit)
    }

    recommendationV5WorkIdentityAudit(limit = 200) {
        return this.workIdentityQueriesV5().recommendationV5WorkIdentityAudit(limit)
    }

    recommendationV5WorkIdentityEvidence(limit = 200) {
        return this.workIdentityQueriesV5().recommendationV5WorkIdentityEvidence(limit)
    }

    recommendationV5RefreshWorkIdentityEvidence(limit = 500) {
        return this.workIdentityCommandsV5().recommendationV5RefreshWorkIdentityEvidence(limit)
    }


    recommendationV5WorkIdentityReview(limit = 200) {
        return this.workIdentityQueriesV5().recommendationV5WorkIdentityReview(limit)
    }

    recommendationV5WorkIdentityMaterializationPlan() {
        return this.workIdentityQueriesV5().recommendationV5WorkIdentityMaterializationPlan()
    }

    prepareRecommendationV5WorkIdentityMaterialization(
        input: Record<string, unknown>
    ) {
        return this.workIdentityCommandsV5().prepareRecommendationV5WorkIdentityMaterialization(input)
    }

    recommendationV5WorkIdentityMaterializationRuns(limit = 100) {
        return this.workIdentityQueriesV5().recommendationV5WorkIdentityMaterializationRuns(limit)
    }

    updateRecommendationV5WorkIdentityDecision(
        input: Record<string, unknown>
    ) {
        return this.workIdentityCommandsV5().updateRecommendationV5WorkIdentityDecision(input)
    }

    updateRecommendationV5Control(input: Record<string, unknown>) {
        const store = new RecommendationPolicyStoreV5(this.database)
        store.setControl({
            targetType: input.targetType,
            key: input.key,
            label: input.label,
            direction: input.direction,
            levelDelta: input.levelDelta,
            scope: input.scope,
            source: 'DESKTOP'
        })
        return this.recommendationV5Snapshot()
    }

    updateRecommendationV5Session(input: Record<string, unknown>) {
        const store = new RecommendationPolicyStoreV5(this.database)
        store.setSessionIntent({
            mode: input.mode,
            targetType: input.targetType,
            key: input.key,
            label: input.label,
            source: 'DESKTOP'
        })
        return this.recommendationV5Snapshot()
    }

    suppressRecommendationV5Comic(input: Record<string, unknown>) {
        const store = new RecommendationPolicyStoreV5(this.database)
        store.setItemDisposition({
            comicId: input.comicId,
            reason: input.reason,
            active: input.suppressed !== false,
            durationDays: input.durationDays,
            source: 'DESKTOP'
        })
        return this.recommendationV5Snapshot()
    }

    updateRecommendationV5TasteExclusion(
        input: Record<string, unknown>
    ) {
        const store = new RecommendationPolicyStoreV5(this.database)
        store.setTasteExclusion(
            String(input.comicId ?? ''),
            input.excluded !== false,
            'DESKTOP'
        )
        return this.recommendationV5Snapshot()
    }

    mergeMobileRecommendationV5(input: MobileRecommendationSyncV5) {
        return new RecommendationPolicyStoreV5(this.database).mergeMobile(input)
    }

    previewMobileRecommendationV5(input: MobileRecommendationSyncV5) {
        const preview = new RecommendationPolicyStoreV5(
            this.database
        ).previewMobile(input)
        const portable = this.recommendationPortablePackageV5(24)
        return {
            ...preview,
            remotePackage: {
                engineVersion: portable.engineVersion,
                foundation: portable.foundation,
                reservoirGeneration: portable.reservoir.generation,
                reservoirCount: portable.reservoir.count,
                behaviorGeneration: portable.behavior.generation
            }
        }
    }

    recommendationPortablePackageV5(limit = 500) {
        const bounded = Math.max(24, Math.min(1000, Math.floor(limit)))
        const policyStore = new RecommendationPolicyStoreV5(this.database)
        const policy = policyStore.state({ initialize: false })
        const active = this.database.getAppState<{
            activeCycleId?: string | null
        }>('recommendation.v3.activeCycle.v1')
        const cycleId = String(active?.activeCycleId ?? '').trim()
        const pool = cycleId
            ? this.database.latestV3CandidatePool(cycleId)
            : null
        const catalog = this.database.listComics({ limit: 10000 })
        const rawRecords = pool
            ? this.database.recommendationRecords(
                  pool.candidateIds.slice(0, bounded * 2)
              )
            : []
        const filtered = filterCandidatesAgainstOwnedV5(
            rawRecords,
            catalog,
            policy
        ).rows.slice(0, bounded)

        const profile = this.visualPreferenceProfile()
        const preferred = selectPreferredVisualEmbeddings(
            this.database.listVisualEmbeddings(
                filtered.map((row) => row.comic.comicId)
            )
        )
        const visualRows = filtered.flatMap((row) => {
            const embedding = preferred.get(row.comic.comicId)
            if (!embedding || !profile) return []
            const affinity = visualAffinity(embedding, profile)
            return [
                {
                    comicId: row.comic.comicId,
                    affinity: affinity.affinity,
                    positiveSimilarity: affinity.positiveSimilarity,
                    negativeSimilarity: affinity.negativeSimilarity,
                    confidence: embedding.confidence,
                    sourceKind: embedding.sourceKind,
                    embeddingKind: embedding.embeddingKind
                }
            ]
        })
        const allIdentityBindings = this.database.listWorkIdentityBindings(10000)
        const portableIdentityIds = new Set([
            ...filtered.map((row) => row.comic.comicId),
            ...catalog
                .filter((comic) =>
                    Boolean(
                        comic.isFavorite ||
                            comic.inLibrary ||
                            comic.downloadedPictures > 0
                    )
                )
                .map((comic) => comic.comicId)
        ])
        const identityBindings = allIdentityBindings
            .filter((binding) => portableIdentityIds.has(binding.comicId))
            .map((binding) => ({
                comicId: binding.comicId,
                workId: binding.workId,
                workTitle: binding.workTitle,
                editionId: binding.editionId,
                editionLabel: binding.editionLabel,
                editionLanguage: binding.editionLanguage,
                editionKind: binding.editionKind,
                bindingStatus: binding.bindingStatus,
                confidence: binding.confidence,
                resolverVersion: binding.resolverVersion
            }))
        const catalogById = new Map(
            catalog.map((comic) => [comic.comicId, comic] as const)
        )
        const feedbackSnapshot = this.database
            .recommendationFeedback()
            .slice(0, 500)
            .map((item) => ({
                comicId: item.comicId,
                sentiment: item.sentiment,
                reasons: item.reasons,
                occurredAt: item.occurredAt
            }))
        const recentCutoff =
            Date.now() - 30 * 24 * 60 * 60 * 1000
        const recentEvents = this.database
            .listUserEvents({ limit: 5000 })
            .filter(
                (event) =>
                    Boolean(event.comicId) &&
                    event.source !== 'android-sync-v5' &&
                    [
                        'recommend_impression',
                        'recommend_detail_open',
                        'reader_complete'
                    ].includes(event.eventType) &&
                    Date.parse(event.occurredAt) >= recentCutoff
            )
            .slice(-500)
            .map((event) => {
                const comic = catalogById.get(String(event.comicId))
                return {
                    eventId: `desktop:${event.id}`,
                    eventType: event.eventType,
                    comicId: String(event.comicId),
                    occurredAt: event.occurredAt,
                    author: comic?.canonicalAuthor ?? comic?.author ?? '',
                    tags: comic?.tags ?? [],
                    categories: comic?.categories ?? []
                }
            })
        const behaviorGeneration = createHash('sha256')
            .update(
                JSON.stringify({
                    feedback: feedbackSnapshot,
                    recentEvents
                })
            )
            .digest('hex')
            .slice(0, 24)
        const portablePolicyGeneration = createHash('sha256')
            .update(
                JSON.stringify({
                    tagPolicy: normalizeTagPolicyV1(policy.tagPolicy),
                    controls: policy.controls
                        .filter((control) => control.scope === 'PERSISTENT')
                        .map((control) => ({
                            targetType: control.targetType,
                            key: control.key,
                            direction: control.direction,
                            levelDelta: control.levelDelta ?? null,
                            scope: control.scope
                        })),
                    hardSuppressComicIds: policy.hardSuppressComicIds,
                    seenComicIds: policy.seenComicIds,
                    ownedComicIds: policy.ownedComicIds,
                    duplicateReportComicIds:
                        policy.duplicateReportComicIds,
                    temporarySuppressions:
                        policy.temporarySuppressions.map((item) => ({
                            comicId: item.comicId,
                            expiresAt: item.expiresAt
                        })),
                    tasteExcludedComicIds:
                        policy.tasteExcludedComicIds,
                    explicitDistinctPairs:
                        policy.explicitDistinctPairs
                })
            )
            .digest('hex')
            .slice(0, 24)
        const visualStatus = this.visualIndexStatus()
        const visualGeneration = createHash('sha256')
            .update(
                JSON.stringify({
                    modelId: visualStatus.modelId,
                    modelVersion: visualStatus.modelVersion,
                    samplingPolicyVersion: visualStatus.samplingPolicyVersion,
                    profileVersion: visualStatus.profileVersion,
                    indexedCount: visualStatus.indexedCount,
                    profile: profile
                        ? {
                              ...profile,
                              generatedAt: undefined
                          }
                        : null
                })
            )
            .digest('hex')
            .slice(0, 24)
        const canonicalGeneration = createHash('sha256')
            .update(
                JSON.stringify({
                    resolverVersion: WORK_IDENTITY_RESOLVER_VERSION,
                    explicitDistinctPairs: policy.explicitDistinctPairs,
                    identityBindings,
                    authors: this.database
                        .listAuthors()
                        .map((author) => [
                            author.id,
                            author.canonicalName,
                            author.reviewStatus
                        ])
                })
            )
            .digest('hex')
            .slice(0, 24)
        const candidates = filtered.map(({ comic }, index) => ({
            comicId: comic.comicId,
            providerId: comic.providerId ?? null,
            providerRemoteId: comic.providerRemoteId ?? null,
            title: comic.title,
            author: comic.author,
            canonicalAuthor: comic.canonicalAuthor ?? null,
            tags: comic.tags,
            providerRawTags: comicTagProviderV1(comic) === 'eh' ? providerRawTagFactsV1(comic) : [],
            categories: comic.categories,
            pagesCount: comic.pagesCount ?? null,
            totalLikes: comic.totalLikes ?? null,
            totalViews: comic.totalViews ?? null,
            coverUrl: comic.coverUrl ?? null,
            desktopPoolRank: index + 1
        }))
        const reservoirGeneration = createHash('sha256')
            .update(
                JSON.stringify({
                    cycleId: cycleId || null,
                    poolId: pool?.id ?? null,
                    generatedAt: pool?.generatedAt ?? null,
                    ids: candidates.map((item) => item.comicId)
                })
            )
            .digest('hex')
            .slice(0, 24)
        return {
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            engineVersion: 'portable-v5-runtime-v1',
            foundation: {
                policyRevision: policy.revision,
                portablePolicyGeneration,
                visualGeneration,
                canonicalGeneration,
                workIdentityResolverVersion: WORK_IDENTITY_RESOLVER_VERSION,
                visualModelId: visualStatus.modelId,
                visualModelVersion: visualStatus.modelVersion,
                visualSamplingPolicyVersion:
                    visualStatus.samplingPolicyVersion,
                identityBindings
            },
            reservoir: {
                generation: reservoirGeneration,
                sourceCycleId: cycleId || null,
                sourcePoolId: pool?.id ?? null,
                sourceGeneratedAt: pool?.generatedAt ?? null,
                count: candidates.length,
                candidates
            },
            visual: {
                generation: visualGeneration,
                profileVersion: visualStatus.profileVersion,
                indexedCount: visualStatus.indexedCount,
                targetCount: visualStatus.targetCount,
                signals: visualRows
            },
            behavior: {
                generation: behaviorGeneration,
                feedback: feedbackSnapshot,
                recentEvents
            }
        }
    }

    visualSettings() {
        const stored = this.database.getAppState<{
            enabled?: boolean
            samplingMode?: VisualSamplingMode
            rerankMode?: VisualRerankMode
            strength?: VisualInfluenceStrength
        }>('recommendation.visualSettings.v1')
        const samplingMode: VisualSamplingMode = [
            'local_only',
            'standard',
            'cover_only'
        ].includes(String(stored?.samplingMode ?? ''))
            ? (stored!.samplingMode as VisualSamplingMode)
            : 'local_only'
        const rerankMode: VisualRerankMode = ['OFF', 'SHADOW', 'LIVE'].includes(
            String(stored?.rerankMode ?? '')
        )
            ? (stored!.rerankMode as VisualRerankMode)
            : 'SHADOW'
        const strength: VisualInfluenceStrength = ['LIGHT', 'STANDARD', 'STRONG'].includes(
            String(stored?.strength ?? '')
        )
            ? (stored!.strength as VisualInfluenceStrength)
            : 'STANDARD'
        return {
            enabled: Boolean(stored?.enabled),
            samplingMode,
            rerankMode,
            strength
        }
    }

    updateVisualSettings(input: {
        enabled?: unknown
        samplingMode?: unknown
        rerankMode?: unknown
        strength?: unknown
    }) {
        const previous = this.visualSettings()
        const samplingMode = ['local_only', 'standard', 'cover_only'].includes(
            String(input.samplingMode ?? '')
        )
            ? (String(input.samplingMode) as VisualSamplingMode)
            : previous.samplingMode
        const rerankMode = ['OFF', 'SHADOW', 'LIVE'].includes(
            String(input.rerankMode ?? '')
        )
            ? (String(input.rerankMode) as VisualRerankMode)
            : previous.rerankMode
        const strength = ['LIGHT', 'STANDARD', 'STRONG'].includes(
            String(input.strength ?? '')
        )
            ? (String(input.strength) as VisualInfluenceStrength)
            : previous.strength
        const next = {
            enabled:
                input.enabled === undefined
                    ? previous.enabled
                    : Boolean(input.enabled),
            samplingMode,
            rerankMode,
            strength
        }
        this.database.setAppState('recommendation.visualSettings.v1', next)
        return next
    }

    saveVisualEmbedding(
        input: Omit<VisualEmbeddingRecord, 'generatedAt'> & {
            generatedAt?: string
        }
    ) {
        if (!this.database.getComic(input.comicId)) throw new Error('Unknown comic')
        if (
            input.modelId !== VISUAL_MODEL_ID ||
            input.modelVersion !== VISUAL_MODEL_VERSION
        )
            throw new Error('Unsupported visual embedding model')
        if (input.samplingPolicyVersion !== VISUAL_SAMPLING_POLICY_VERSION)
            throw new Error('Unsupported visual sampling policy')
        return this.database.saveVisualEmbedding({
            ...input,
            generatedAt: input.generatedAt ?? new Date().toISOString()
        })
    }

    visualPreferenceProfile() {
        const tasteExcluded = new Set(
            new RecommendationPolicyStoreV5(this.database).state({ initialize: false })
                .tasteExcludedComicIds
        )
        const favorites = new Set(
            this.database
                .favoriteIds()
                .filter((comicId) => !tasteExcluded.has(comicId))
        )
        const feedback = this.database.recommendationFeedback()
        return buildVisualPreferenceProfile({
            embeddings: this.database.listVisualEmbeddings(),
            favoriteComicIds: favorites,
            feedback,
            catalogSize: Math.max(
                1,
                favorites.size +
                    feedback.filter((item) => item.sentiment === 'like').length
            )
        })
    }

    visualAnalysisRuntimeProfile() {
        return this.visualAnalysisTimings.snapshot()
    }

    visualStyleFamilies(
        minWorksPerAuthor = 2,
        maxAuthors = 300,
        mutualK = 2,
        minimumSimilarity = -1
    ) {
        return this.visualAnalysisTimings.measureDynamic(
            'visual-style-families',
            () => {
                const embeddings = this.database.listVisualEmbeddings()
                const catalog = this.database.listComics({ limit: 10000 })
                const atlas = buildVisualAuthorAtlasV5({
                    embeddings,
                    catalog,
                    minWorksPerAuthor,
                    maxGraphAuthors: Math.max(maxAuthors, 10),
                    neighborLimit: Math.max(mutualK, 2)
                })
                return {
                    result: buildVisualStyleFamiliesV5({
                        atlas,
                        maxAuthors,
                        mutualK,
                        minimumSimilarity
                    }),
                    catalogCount: catalog.length,
                    embeddingCount: embeddings.length,
                    parameters: {
                        minWorksPerAuthor,
                        maxAuthors,
                        mutualK,
                        minimumSimilarity
                    }
                }
            }
        )
    }

    visualAuthorAtlas(
        minWorksPerAuthor = 2,
        maxGraphAuthors = 600,
        neighborLimit = 8
    ) {
        return this.visualAnalysisTimings.measureDynamic(
            'visual-author-atlas',
            () => {
                const embeddings = this.database.listVisualEmbeddings()
                const catalog = this.database.listComics({ limit: 10000 })
                return {
                    result: buildVisualAuthorAtlasV5({
                        embeddings,
                        catalog,
                        minWorksPerAuthor,
                        maxGraphAuthors,
                        neighborLimit
                    }),
                    catalogCount: catalog.length,
                    embeddingCount: embeddings.length,
                    parameters: {
                        minWorksPerAuthor,
                        maxGraphAuthors,
                        neighborLimit
                    }
                }
            }
        )
    }

    visualRepresentationQc(
        maxPairSamples = 4000,
        maxAnchors = 120
    ) {
        return this.visualAnalysisTimings.measureDynamic(
            'visual-representation-qc',
            () => {
                const catalog = this.database.listComics({ limit: 10000 })
                const embeddings = this.database.listVisualEmbeddings()
                const fandomKeysByComic: Record<string, string[]> = {}
                try {
                    const registry = loadTagRegistryV3(
                        runtimeRegistryDirectory()
                    )
                    for (const comic of catalog) {
                        const keys = new Set<string>()
                        for (const tag of comic.tags) {
                            const resolved = resolveTagV3(tag, registry)
                            if (
                                resolved.resolutionStatus === 'RESOLVED' &&
                                resolved.resolutionType !== 'SAFETY' &&
                                resolved.facet === 'FANDOM_IP' &&
                                resolved.canonicalKey
                            )
                                keys.add(resolved.canonicalKey)
                        }
                        if (keys.size)
                            fandomKeysByComic[comic.comicId] = [
                                ...keys
                            ].sort()
                    }
                } catch {
                    // E-H raw parody tags remain available inside the QC module even
                    // when the packaged semantic registry cannot be loaded.
                }
                return {
                    result: buildVisualRepresentationQcV5({
                        embeddings,
                        catalog,
                        fandomKeysByComic,
                        maxPairSamples,
                        maxAnchors
                    }),
                    catalogCount: catalog.length,
                    embeddingCount: embeddings.length,
                    parameters: {
                        maxPairSamples,
                        maxAnchors
                    }
                }
            }
        )
    }

    visualIndexStatus() {
        const settings = this.visualSettings()
        const feedback = this.database.recommendationFeedback()
        const targetIds = new Set([
            ...this.database.favoriteIds(),
            ...feedback.map((item) => item.comicId)
        ])
        const embeddings = this.database.listVisualEmbeddings()
        const current = embeddings.filter(
            (item) =>
                item.modelId === VISUAL_MODEL_ID &&
                item.modelVersion === VISUAL_MODEL_VERSION &&
                item.samplingPolicyVersion === VISUAL_SAMPLING_POLICY_VERSION
        )
        const indexedIds = new Set(current.map((item) => item.comicId))
        const pendingComicIds = [...targetIds]
            .filter((id) => !indexedIds.has(id))
            .sort()
        return {
            settings,
            modelId: VISUAL_MODEL_ID,
            modelVersion: VISUAL_MODEL_VERSION,
            samplingPolicyVersion: VISUAL_SAMPLING_POLICY_VERSION,
            profileVersion: VISUAL_PROFILE_VERSION,
            rerankVersion: VISUAL_RERANK_VERSION,
            targetCount: targetIds.size,
            indexedCount: [...targetIds].filter((id) => indexedIds.has(id)).length,
            bodyCount: current.filter((item) => item.embeddingKind === 'body').length,
            coverCount: current.filter((item) => item.embeddingKind === 'cover').length,
            pendingComicIds,
            profile: this.visualPreferenceProfile()
        }
    }

    similarVisualStyle(comicId: string, limit = 20) {
        const embeddings = this.database.listVisualEmbeddings()
        const preferred = new Map<string, VisualEmbeddingRecord>()
        for (const item of embeddings) {
            if (
                item.modelId !== VISUAL_MODEL_ID ||
                item.modelVersion !== VISUAL_MODEL_VERSION ||
                item.samplingPolicyVersion !== VISUAL_SAMPLING_POLICY_VERSION
            )
                continue
            const previous = preferred.get(item.comicId)
            if (
                !previous ||
                (previous.embeddingKind === 'cover' && item.embeddingKind === 'body')
            )
                preferred.set(item.comicId, item)
        }
        const source = preferred.get(comicId)
        if (!source) return []
        const maxResults = Math.max(1, Math.min(50, Math.floor(limit)))
        const nearest = [...preferred.values()]
            .filter(
                (item) =>
                    item.comicId !== comicId &&
                    item.vector.length === source.vector.length
            )
            .map((embedding) => ({
                embedding,
                similarity: cosineSimilarity(source.vector, embedding.vector)
            }))
            .sort(
                (a, b) =>
                    b.similarity - a.similarity ||
                    a.embedding.comicId.localeCompare(b.embedding.comicId)
            )
            .slice(0, maxResults)
        return nearest
            .map((item) => ({
                comic: this.database.getComic(item.embedding.comicId),
                similarity: item.similarity,
                sourceKind: item.embedding.sourceKind,
                confidence: item.embedding.confidence,
                sampleCount: item.embedding.sampleCount,
                embeddingKind: item.embedding.embeddingKind
            }))
            .filter((item) => item.comic)
    }

    private recordForOnlineSource(
        comic: ProviderComic,
        source: OnlineSource
    ): FavoriteRecord {
        const record = providerComicToRecord(comic)
        if (source !== 'eh' && source !== 'exh') return record
        const previous =
            this.database.getComic(record.comicId)?.providerMetadata ?? {}
        const known = new Set<string>([
            ...(Array.isArray(previous.knownSurfaces)
                ? previous.knownSurfaces.map(String)
                : []),
            source
        ])
        record.providerMetadata = {
            ...previous,
            ...record.providerMetadata,
            preferredSurface: source,
            knownSurfaces: [...known].filter(
                (item) => item === 'eh' || item === 'exh'
            )
        }
        return record
    }

    constructor(
        readonly database: LibraryDatabase,
        readonly dataDir: string,
        provider?: Pica,
        ehProvider?: EhProvider,
        runtimeResources?: RuntimeResourceCoordinator,
        readonly sources = new SourceRuntime()
    ) {
        this.pica = provider ?? null
        this.ehProvider = ehProvider ?? new EhProvider()
        this.pica?.setSourceAccess?.(sources.acquire)
        this.ehProvider.setSourceAccess?.(sources.acquire)
        this.jmProvider.setSourceAccess(sources.acquire)
        this.runtimeResources =
            runtimeResources ??
            new RuntimeResourceCoordinator({
                mode: 'observe'
            })
        const identityPorts = workIdentityTaskPortsV5(
            this.database, () => this.allComicsForIdentity()
        )
        this.workIdentityTaskV5 = new WorkIdentityTaskV5(
            identityPorts.read, identityPorts.write, {
                acquire: () => this.runtimeResources.acquire({
                    ownerId: 'work-identity-evidence',
                    taskType: 'work-identity-evidence-refresh',
                    priority: 'background',
                    resources: {
                        'cpu-analysis': 1,
                        'sqlite-read-heavy': 1,
                        'sqlite-write-heavy': 1
                    }
                })
            }
        )
        fs.mkdirSync(dataDir, { recursive: true })
        this.recoveredLocalDownloadJobs =
            this.database.recoverInterruptedDownloadJobs('LOCAL')
        this.recoverInterruptedRecommendationBuild()
    }

    async connect() {
        const lease = this.sources.acquire('pica')
        if (this.pica) return this.pica
        const account = process.env.PICA_ACCOUNT
        const password = process.env.PICA_PASSWORD
        if (!account || !password) {
            throw new Error(
                'PICA_ACCOUNT and PICA_PASSWORD are required for connected mode'
            )
        }
        const pica = new Pica({ sourceAccess: this.sources.acquire })
        await pica.login(account, password)
        lease.check()
        this.pica = pica
        return pica
    }

    resetPicaSession() {
        this.pica = null
    }

    providerService() {
        return new ProviderService(
            () => this.connect(),
            this.database,
            this.ehProvider,
            this.jmProvider,
            this.sources
        )
    }

    jmAccountStatus() { return this.jmProvider.accountStatus() }
    jmRuntimeAvailable() { return this.jmProvider.available }
    setJmCredentials(username?: string, password?: string) { this.jmProvider.setRememberedCredentials(username, password) }
    async jmLogin(username: string, password: string) {
        this.sources.acquire('jm')
        this.jmMetadataGeneration++
        this.jmFavorites.clear()
        return this.jmProvider.login(username, password)
    }
    async jmClearAccount() { this.jmMetadataGeneration++; this.jmFavorites.clear(); await this.jmProvider.clearAccount() }
    jmPreviewFavorites(folderId = 0, checkpoint?: () => Promise<void>) {
        this.sources.acquire('jm')
        return this.jmFavorites.scan(this.jmProvider, folderId, checkpoint)
    }
    async jmConfirmFavorites(token: string) {
        const identity = await this.sources.run('jm', () => this.jmProvider.accountStatus())
        return this.jmFavorites.confirm(token, identity, this.database)
    }
    jmCancelFavorites() { this.jmMetadataGeneration++; this.jmFavorites.clear() }
    async jmEnrichFavorites(checkpoint?: () => Promise<void>) {
        const lease = this.sources.acquire('jm')
        if (this.jmMetadataBusy) throw new Error('JM 资料补全正在进行')
        this.jmMetadataBusy = true
        const generation = ++this.jmMetadataGeneration
        const pending = this.database.listComicsForLibraryQueryBase({ scope: 'favorites', providerIds: ['jm'] })
            .filter((comic) => comic.providerMetadata?.metadataCompleteness !== 'DETAIL')
        let updated = 0, failed = 0
        try {
            for (const comic of pending.slice(0, 20)) {
                await checkpoint?.()
                if (generation !== this.jmMetadataGeneration) break
                try {
                    const details = await this.jmProvider.details(comic.comicId)
                    lease.check()
                    if (generation !== this.jmMetadataGeneration) break
                    this.database.importCatalog([providerComicToRecord(details)], 'jm:metadata:details')
                    updated++
                } catch { failed++ }
            }
            return { updated, failed, remaining: pending.length - updated, batchLimit: 20, explicitLikesCreated: 0 }
        } finally { this.jmMetadataBusy = false }
    }
    closeSources() { this.jmMetadataGeneration++; this.jmFavorites.clear(); this.jmProvider.close() }

    sourceChoicesApplied(disabled: SourceId[]) {
        if (disabled.includes('jm')) this.closeSources()
        if (disabled.includes('pica')) this.resetPicaSession()
    }

    async refreshAuthorWorks(authorId: string) {
        const author = this.database.listAuthors().find((item) => item.id === authorId)
        if (!author) throw new Error('作者身份不存在或已经变化')
        const catalog = this.database.listComics({ limit: 10000 })
        const knownWorks = catalog.filter((comic) => comic.authorId === authorId)
        const identityKeys = new Set(
            [author.canonicalName, ...author.aliases].map(normalizeAuthorKey).filter(Boolean)
        )
        const picaQuery =
            knownWorks.find((comic) =>
                comic.providerId === 'pica' && identityKeys.has(normalizeAuthorKey(comic.author))
            )?.author || author.canonicalName
        const ehQueryName =
            knownWorks.find((comic) =>
                comic.providerId === 'eh' && identityKeys.has(normalizeAuthorKey(comic.author))
            )?.author || author.canonicalName
        const provider = this.providerService()
        const sources: Record<string, { count: number; error?: string }> = {}
        const run = async (source: 'pica' | 'eh' | 'exh', keyword: string) => {
            try {
                const records = await provider.search({ keyword, limit: 100 }, [source], 'discover')
                sources[source] = { count: records.length }
            } catch (error) {
                sources[source] = { count: 0, error: error instanceof Error ? error.message : String(error) }
            }
        }
        if (picaQuery.trim()) await run('pica', picaQuery.trim())
        const cleanEh = ehQueryName.replaceAll('"', '').trim()
        if (cleanEh) await run('eh', `artist:"${cleanEh}"`)
        if (cleanEh && this.ehProvider.hasSession()) {
            const capability = await this.probeExHentai().catch(() => 'NETWORK_ERROR')
            if (capability === 'AVAILABLE') await run('exh', `artist:"${cleanEh}"`)
            else sources.exh = { count: 0, error: capability }
        }
        const refreshedWorks = this.database
            .listComics({ limit: 10000 })
            .filter((comic) => comic.authorId === authorId)
        return {
            authorId,
            canonicalName: author.canonicalName,
            knownBefore: knownWorks.length,
            knownAfter: refreshedWorks.length,
            sources
        }
    }

    setEhSession(session?: EhSession | null) {
        this.ehProvider.setSession(session)
    }

    ehAccountStatus() {
        return this.providerService().ehAccountStatus()
    }

    verifyEhAccount() {
        return this.providerService().verifyEhAccount()
    }

    probeExHentai() {
        return this.providerService().probeExHentai()
    }

    syncEhFavorites() {
        return this.providerService().syncEhFavorites()
    }

    async mobileEhRelayFavoritesSnapshot() {
        const snapshot = await this.sources.run('eh', () => this.ehProvider.favoriteSnapshot())
        const records = snapshot.comics.map((comic) =>
            this.recordForOnlineSource(comic, 'eh')
        )
        this.database.syncEhFavorites(records)
        return snapshot
    }

    async mobileEhRelaySearch(input: SearchRequest) {
        const surface: EhSurface = input.surface === 'exh' ? 'exh' : 'eh'
        const comics = await this.sources.run('eh', () => this.ehProvider.search({
            ...input,
            surface,
            limit: Math.max(
                1,
                Math.min(100, Math.floor(Number(input.limit) || 50))
            )
        }))
        if (comics.length)
            this.database.importCatalog(
                comics.map((comic) =>
                    this.recordForOnlineSource(comic, surface)
                ),
                `${surface}:mobile-relay-search`
            )
        return comics
    }

    async mobileEhRelayDetails(comicId: string, surface: EhSurface) {
        const comic = await this.sources.run('eh', () => this.ehProvider.detailsOnSurface(
            comicId,
            surface
        ))
        this.database.importCatalog(
            [this.recordForOnlineSource(comic, surface)],
            `${surface}:mobile-relay-details`
        )
        return comic
    }

    mobileEhRelayEpisodes(comicId: string, surface: EhSurface) {
        return this.sources.run('eh', () => this.ehProvider.episodesOnSurface(comicId, surface))
    }

    mobileEhRelayPages(
        comicId: string,
        episode: Episode,
        surface: EhSurface
    ) {
        return this.sources.run('eh', () => this.ehProvider.pagesOnSurface(comicId, episode, surface))
    }

    mobileEhRelayFetchPage(
        locator: string,
        maxBytes = 20 * 1024 * 1024
    ) {
        return this.sources.run('eh', () => this.ehProvider.fetchPage(locator, maxBytes))
    }

    mobileEhRelayProbeExH() {
        return this.sources.run('eh', () => this.ehProvider.probeExHentai())
    }

    async mobileEhRelaySetFavorite(
        comicId: string,
        desired: boolean,
        category = 0,
        note = ''
    ) {
        const lease = this.sources.acquire('eh')
        if (!this.ehProvider.hasSession())
            throw new Error('E-H account session is not configured')
        let before = this.database.getComic(comicId)
        if (!before) {
            const comic = await this.ehProvider.detailsOnSurface(
                comicId,
                'eh'
            )
            lease.check()
            this.database.importCatalog(
                [this.recordForOnlineSource(comic, 'eh')],
                'eh:mobile-relay-favorite'
            )
            before = this.database.getComic(comicId)
        }
        if (!before) throw new Error('E-H comic could not be persisted')
        const beforeRemote = this.database.hasFavoriteMembership(
            comicId,
            'eh-favorite'
        )
        if (beforeRemote === desired)
            return {
                changed: false,
                isFavorite: before.isFavorite,
                already: true,
                remote: true,
                category,
                note
            }
        await this.ehProvider.setRemoteFavorite(
            comicId,
            desired,
            category,
            note
        )
        lease.check()
        const after = this.database.setEhFavoriteState(
            comicId,
            desired
        )
        return {
            changed: true,
            isFavorite: Boolean(after?.isFavorite),
            already: false,
            remote: true,
            category,
            note
        }
    }

    async cover(comicId: string) {
        // Reuse the existing per-key promise pattern: one writer per comic, including scope changes.
        const previous = this.coverRequests.get(comicId)
        const request = (async () => {
            if (previous) await previous.catch(() => undefined)
            return this.loadCover(comicId)
        })()
        this.coverRequests.set(comicId, request)
        try { return await request }
        finally { if (this.coverRequests.get(comicId) === request) this.coverRequests.delete(comicId) }
    }

    private async loadCover(comicId: string) {
        if (comicId.startsWith('local:')) return { ...await this.downloadedCover(comicId), cached: true }
        const comic = this.database.getComic(comicId)
        if (!comic?.coverUrl) throw new Error('Comic cover is unavailable')

        const cacheDir = path.join(this.dataDir, 'cover-cache')
        const cacheKey = createHash('sha256').update(comicId).digest('hex')
        const providerService = this.providerService()
        const sourceScope = providerService.cacheScope(comicId)
        const sourceFingerprint = createHash('sha256')
            .update(
                [
                    comic.comicId,
                    comic.providerId ?? '',
                    comic.providerRemoteId ?? '',
                    comic.coverUrl,
                    comic.updatedAt ?? '',
                    sourceScope
                ].join('\n')
            )
            .digest('hex')
        const imageFile = path.join(cacheDir, `${cacheKey}.bin`)
        const metadataFile = path.join(cacheDir, `${cacheKey}.json`)
        const assertCurrentSource = () => {
            const current = this.database.getComic(comicId)
            if (sourceScope !== providerService.cacheScope(comicId) || current?.coverUrl !== comic.coverUrl ||
                current?.updatedAt !== comic.updatedAt || current?.providerId !== comic.providerId || current?.providerRemoteId !== comic.providerRemoteId)
                throw new Error('Cover source changed while loading; please retry')
        }
        let cached: { data: Buffer; contentType: string; cached: boolean } | undefined
        try {
            const metadata = JSON.parse(
                await fs.promises.readFile(metadataFile, 'utf8')
            ) as {
                contentType?: unknown
                sourceFingerprint?: unknown
            }
            const contentType = safeRasterContentType(metadata.contentType)
            if (
                !contentType ||
                String(metadata.sourceFingerprint ?? '') !== sourceFingerprint
            )
                throw new Error('invalid')
            cached = {
                data: await fs.promises.readFile(imageFile),
                contentType,
                cached: true
            }
        } catch {
            // A partial, legacy, or source-stale cache entry is replaced below.
        }
        if (cached) { assertCurrentSource(); return cached }

        const image = await providerService.fetchCover(comicId, comic.coverUrl)
        assertCurrentSource()
        await fs.promises.mkdir(cacheDir, { recursive: true })
        const imagePartial = `${imageFile}.part`
        const metadataPartial = `${metadataFile}.part`
        await fs.promises.writeFile(imagePartial, image.data)
        await fs.promises.writeFile(
            metadataPartial,
            JSON.stringify({
                contentType: image.contentType,
                sourceFingerprint
            })
        )
        await fs.promises.rename(imagePartial, imageFile)
        await fs.promises.rename(metadataPartial, metadataFile)
        return { ...image, cached: false }
    }

    async buildFinalRecommendationCycleV3(cycleId: string) {
        const sourceRevision = this.sources.snapshot().revision
        this.beginRecommendationBuild(cycleId)
        let releaseResources: () => void = () => undefined
        try {
            const lease = await this.runtimeResources.acquire({
                ownerId: 'recommendation-v3',
                taskType: 'recommendation-v3-build',
                priority: 'background',
                resources: {
                    'provider-network': 1,
                    'cpu-analysis': 1,
                    'sqlite-read-heavy': 1,
                    'sqlite-write-heavy': 1
                }
            })
            releaseResources = () => lease.release()
            return await buildRecommendationCycleV3(
                cycleId,
                recommendationBuildPortsV3({
                    database: this.database,
                    sources: this.sources,
                    connectPica: () => this.connect(),
                    externalProvider: () => this.providerService(),
                    convertPica: comicToRecord,
                    visualSettings: () => this.visualSettings(),
                    checkpoint: () => this.recommendationCheckpoint(),
                    progress: (phase) => {
                        this.recommendationProgress = {
                            state:
                                phase === 'complete' ? 'complete' : 'running',
                            phase,
                            done:
                                [
                                    'intents',
                                    'routes',
                                    'providers',
                                    'retrieve',
                                    'rank',
                                    'visual',
                                    'complete'
                                ].indexOf(phase) + 1,
                            total: 7
                        }
                    },
                    assertSourcesCurrent: () => {
                        if (this.sources.snapshot().revision !== sourceRevision)
                            throw new Error(
                                'Source choices changed during recommendation generation; previous recommendations were kept'
                            )
                    }
                })
            )
        } catch (error) {
            const cancelled = error instanceof RecommendationBuildCancelledError
            this.recommendationProgress = {
                state: cancelled ? 'cancelled' : 'failed',
                phase: this.recommendationProgress.phase,
                done: this.recommendationProgress.done,
                total: 7,
                error: cancelled
                    ? undefined
                    : error instanceof Error
                      ? error.message
                      : String(error)
            }
            throw error
        } finally {
            releaseResources()
            this.finishRecommendationBuild()
        }
    }

    async downloadedCover(comicId: string) {
        const file = this.database.downloadedCoverPath(comicId)
        if (!file) throw new Error('Downloaded cover is unavailable')
        const contentTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.gif': 'image/gif'
        }
        const contentType = safeRasterContentType(
            contentTypes[path.extname(file).toLowerCase()]
        )
        if (!contentType) throw new Error('Downloaded cover type is unsafe')
        // Reuse Reader's realpath/root checks, including imported local pages.
        const realRoot = await fs.promises.realpath(this.dataDir)
        const realFile = await fs.promises.realpath(file)
        const relative = path.relative(realRoot, realFile)
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Cover file escaped the Library root')
        return { data: await fs.promises.readFile(realFile), contentType }
    }

    favoritesSyncProgress() {
        return {
            ...this.favoritesProgress,
            state: this.favoritesTaskState,
            canPause:
                this.favoritesTaskState === 'running' ||
                this.favoritesTaskState === 'pausing',
            canResume: this.favoritesTaskState === 'paused',
            canCancel: [
                'running',
                'pausing',
                'paused',
                'cancelling'
            ].includes(this.favoritesTaskState)
        }
    }

    favoritesSyncControl(action: 'pause' | 'resume' | 'cancel') {
        if (action === 'pause') {
            if (this.favoritesTaskState === 'running') {
                this.favoritesPauseRequested = true
                this.favoritesTaskState = 'pausing'
            }
            return this.favoritesSyncProgress()
        }
        if (action === 'resume') {
            this.favoritesPauseRequested = false
            for (const resolve of this.favoritesResumeWaiters) resolve()
            this.favoritesResumeWaiters.clear()
            if (
                this.favoritesTaskState === 'paused' ||
                this.favoritesTaskState === 'pausing'
            )
                this.favoritesTaskState = 'running'
            return this.favoritesSyncProgress()
        }
        this.favoritesCancelRequested = true
        this.favoritesPauseRequested = false
        for (const resolve of this.favoritesResumeWaiters) resolve()
        this.favoritesResumeWaiters.clear()
        if (
            this.favoritesTaskState === 'running' ||
            this.favoritesTaskState === 'pausing' ||
            this.favoritesTaskState === 'paused'
        )
            this.favoritesTaskState = 'cancelling'
        return this.favoritesSyncProgress()
    }

    private async favoritesSyncCheckpoint() {
        if (this.favoritesCancelRequested) throw new FavoritesSyncCancelledError()
        if (!this.favoritesPauseRequested) return
        this.favoritesTaskState = 'paused'
        this.favoritesProgress = {
            ...this.favoritesProgress,
            phase: 'paused'
        }
        await new Promise<void>((resolve) =>
            this.favoritesResumeWaiters.add(resolve)
        )
        if (this.favoritesCancelRequested) throw new FavoritesSyncCancelledError()
        this.favoritesTaskState = 'running'
    }

    private finishFavoritesSyncControl() {
        this.favoritesPauseRequested = false
        this.favoritesCancelRequested = false
        for (const resolve of this.favoritesResumeWaiters) resolve()
        this.favoritesResumeWaiters.clear()
    }

    private tasteChroniclePath() {
        return path.join(this.dataDir, 'taste-chronicle.json')
    }

    tasteChronicle(): HistoricalTasteSnapshot | null {
        try {
            return JSON.parse(
                fs.readFileSync(this.tasteChroniclePath(), 'utf8')
            ) as HistoricalTasteSnapshot
        } catch {
            return null
        }
    }

    rebuildTasteChronicle(_orderIds?: string[]) {
        // Atlas V2 intentionally ignores historical favorite order. The current
        // favorite set is the only preference authority; orderIds remains in the
        // method signature so full-sync callers stay backward compatible.
        void _orderIds
        const records = this.database.listComics({ limit: 5000 })
        const snapshot = buildHistoricalTasteSnapshot(records)
        const target = this.tasteChroniclePath()
        const nonce = `${process.pid}-${Date.now()}`
        const temporary = `${target}.${nonce}.new`
        const backup = `${target}.${nonce}.previous`
        fs.writeFileSync(temporary, JSON.stringify(snapshot), 'utf8')
        let movedPrevious = false
        try {
            if (fs.existsSync(target)) {
                fs.renameSync(target, backup)
                movedPrevious = true
            }
            fs.renameSync(temporary, target)
            if (movedPrevious) fs.unlinkSync(backup)
        } catch (error) {
            if (
                !fs.existsSync(target) &&
                movedPrevious &&
                fs.existsSync(backup)
            )
                fs.renameSync(backup, target)
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
            throw error
        }
        return snapshot
    }

    async syncFavorites(mode: FavoritesSyncMode = 'quick') {
        if (
            this.favoritesTaskState === 'running' ||
            this.favoritesTaskState === 'pausing' ||
            this.favoritesTaskState === 'paused' ||
            this.favoritesTaskState === 'cancelling'
        )
            throw new Error('Favorites sync is already running')
        this.favoritesPauseRequested = false
        this.favoritesCancelRequested = false
        this.favoritesResumeWaiters.clear()
        this.favoritesTaskState = 'running'
        this.favoritesProgress = { phase: 'reading' }
        let releaseResources: () => void = () => undefined
        try {
            const lease = await this.runtimeResources.acquire({
                ownerId: 'favorites-sync',
                taskType: 'favorites-sync',
                priority: 'background',
                resources: {
                    'provider-network': 1,
                    'sqlite-write-heavy': 1
                }
            })
            releaseResources = () => lease.release()
            const provider = this.providerService()
            const result = await provider.syncFavorites(
                mode,
                (progress) => {
                    this.favoritesProgress = {
                        ...progress
                    }
                },
                () => this.favoritesSyncCheckpoint()
            )
            if (result.syncMode === 'full' && result.favoriteOrderIds?.length)
                this.rebuildTasteChronicle(result.favoriteOrderIds)
            this.favoritesTaskState = 'complete'
            this.favoritesProgress = {
                phase: 'complete',
                mode: result.syncMode,
                page: result.pagesChecked,
                fetched: result.imported,
                total: result.favoriteCount,
                processed: result.imported,
                found: result.addedFavorites,
                fallbackReason: result.fallbackReason
            }
            return result
        } catch (error) {
            const cancelled = error instanceof FavoritesSyncCancelledError
            this.favoritesTaskState = cancelled ? 'cancelled' : 'failed'
            this.favoritesProgress = {
                phase: cancelled ? 'cancelled' : 'failed',
                error: cancelled
                    ? undefined
                    : error instanceof Error
                      ? error.message
                      : String(error)
            }
            throw error
        } finally {
            releaseResources()
            this.finishFavoritesSyncControl()
        }
    }

    async favoritesPage(page: number) {
        const lease = this.sources.acquire('pica')
        if (!Number.isInteger(page) || page < 1)
            throw new Error('Favorite page must be a positive integer')
        const pica = await this.connect()
        const result = await pica.favorites(page)
        lease.check()
        const records = result.docs.map(comicToRecord)
        this.database.importFavorites(
            records,
            `pica:favorites:page:${page}`,
            false,
            true
        )
        return {
            page: result.page,
            pages: result.pages,
            total: result.total,
            comics: records
        }
    }

    async discover(query: DiscoverQuery) {
        const providerService = this.providerService()
        const tags = (query.tags ?? []).map(normalizeAuthorKey)
        const categories = (query.categories ?? []).map(normalizeAuthorKey)
        let records = await providerService.search(
            {
                keyword: query.keyword?.trim(),
                tags: query.tags,
                categories: query.categories,
                ehMode: query.ehMode,
                ehToplist: query.ehToplist,
                ehLanguage: query.ehLanguage,
                ehExcludeTags: query.ehExcludeTags,
                ehMinRating: query.ehMinRating,
                ehPageFrom: query.ehPageFrom,
                ehPageTo: query.ehPageTo,
                limit: Math.min(query.limit ?? 100, 1000)
            },
            query.providers?.length ? query.providers : ['pica', 'eh', 'exh']
        )
        records = records.filter((comic) => {
            const comicTags = comic.tags.map(normalizeAuthorKey)
            const comicCategories = comic.categories.map(normalizeAuthorKey)
            return (
                tags.every((tag) => comicTags.includes(tag)) &&
                categories.every((category) =>
                    comicCategories.includes(category)
                )
            )
        })
        if (query.sort === 'title') {
            records.sort((a, b) => a.title.localeCompare(b.title))
        } else if (query.sort === 'latest') {
            records.sort((a, b) =>
                String(b.updatedAt ?? b.createdAt ?? '').localeCompare(
                    String(a.updatedAt ?? a.createdAt ?? '')
                )
            )
        } else if (query.sort === 'views') {
            records.sort(
                (a, b) => (b.totalViews ?? 0) - (a.totalViews ?? 0)
            )
        } else if (query.sort === 'recommended') {
            records.sort((a, b) => {
                const score = (comic: FavoriteRecord) =>
                    Math.log10(1 + (comic.totalLikes ?? 0)) * 3 +
                    Math.log10(1 + (comic.totalViews ?? 0)) +
                    (comic.rating ?? 0) +
                    tags.filter((tag) =>
                        comic.tags.map(normalizeAuthorKey).includes(tag)
                    ).length * 5
                return score(b) - score(a)
            })
        } else {
            records.sort((a, b) => {
                if (a.providerId === 'eh' && b.providerId === 'eh')
                    return (b.rating ?? 0) - (a.rating ?? 0)
                return (b.totalLikes ?? 0) - (a.totalLikes ?? 0)
            })
        }
        return records.slice(0, Math.min(query.limit ?? 100, 1000))
    }

    async recommendations(options: import('../recommendation/legacy-ports').LegacyRecommendationOptions = {}) {
        return new LegacyRecommendationRetrieval(legacyRecallPorts({
            database: this.database,
            tagPolicy: () => this.preferenceViewState(),
            connect: () => this.connect(),
            sources: this.sources,
            convert: comicToRecord
        })).execute(options)
    }

    libraryOrganizeStatus() {
        const active = [
            'running',
            'pausing',
            'paused',
            'cancelling'
        ].includes(this.libraryOrganizeProgress.state)
        const terminal = [
            'complete',
            'failed',
            'cancelled'
        ].includes(this.libraryOrganizeProgress.state)
        return {
            ...this.libraryOrganizeProgress,
            active,
            canPause:
                this.libraryOrganizeProgress.state === 'running' ||
                this.libraryOrganizeProgress.state === 'pausing',
            canResume: this.libraryOrganizeProgress.state === 'paused',
            canCancel: active,
            result: terminal ? this.libraryOrganizeResult : undefined
        }
    }

    libraryOrganizeControl(action: 'pause' | 'resume' | 'cancel') {
        if (action === 'pause') {
            if (this.libraryOrganizeProgress.state === 'running') {
                this.libraryOrganizePauseRequested = true
                this.libraryOrganizeProgress = {
                    ...this.libraryOrganizeProgress,
                    state: 'pausing',
                    updatedAt: new Date().toISOString()
                }
            }
            return this.libraryOrganizeStatus()
        }
        if (action === 'resume') {
            this.libraryOrganizePauseRequested = false
            for (const resolve of this.libraryOrganizeResumeWaiters) resolve()
            this.libraryOrganizeResumeWaiters.clear()
            if (
                this.libraryOrganizeProgress.state === 'paused' ||
                this.libraryOrganizeProgress.state === 'pausing'
            )
                this.libraryOrganizeProgress = {
                    ...this.libraryOrganizeProgress,
                    state: 'running',
                    phase: 'organizing',
                    updatedAt: new Date().toISOString()
                }
            return this.libraryOrganizeStatus()
        }
        this.libraryOrganizeCancelRequested = true
        this.libraryOrganizePauseRequested = false
        for (const resolve of this.libraryOrganizeResumeWaiters) resolve()
        this.libraryOrganizeResumeWaiters.clear()
        if (
            this.libraryOrganizeProgress.state === 'running' ||
            this.libraryOrganizeProgress.state === 'pausing' ||
            this.libraryOrganizeProgress.state === 'paused'
        )
            this.libraryOrganizeProgress = {
                ...this.libraryOrganizeProgress,
                state: 'cancelling',
                updatedAt: new Date().toISOString()
            }
        return this.libraryOrganizeStatus()
    }

    private async libraryOrganizeCheckpoint() {
        if (this.libraryOrganizeCancelRequested)
            throw new LibraryOrganizeCancelledError()
        if (!this.libraryOrganizePauseRequested) return
        this.libraryOrganizeProgress = {
            ...this.libraryOrganizeProgress,
            state: 'paused',
            phase: 'paused',
            updatedAt: new Date().toISOString()
        }
        await new Promise<void>((resolve) =>
            this.libraryOrganizeResumeWaiters.add(resolve)
        )
        if (this.libraryOrganizeCancelRequested)
            throw new LibraryOrganizeCancelledError()
        this.libraryOrganizeProgress = {
            ...this.libraryOrganizeProgress,
            state: 'running',
            phase: 'organizing',
            updatedAt: new Date().toISOString()
        }
    }

    private finishLibraryOrganizeControl() {
        this.libraryOrganizePauseRequested = false
        this.libraryOrganizeCancelRequested = false
        for (const resolve of this.libraryOrganizeResumeWaiters) resolve()
        this.libraryOrganizeResumeWaiters.clear()
        this.libraryOrganizeRun = null
    }

    startLibraryOrganize() {
        if (
            this.libraryOrganizeRun &&
            [
                'running',
                'pausing',
                'paused',
                'cancelling'
            ].includes(this.libraryOrganizeProgress.state)
        )
            return {
                started: false,
                ...this.libraryOrganizeStatus()
            }

        const comics = this.database.listAllComics()
        const now = new Date().toISOString()
        this.libraryOrganizePauseRequested = false
        this.libraryOrganizeCancelRequested = false
        this.libraryOrganizeResumeWaiters.clear()
        this.libraryOrganizeResult = null
        this.libraryOrganizeProgress = {
            state: 'running',
            phase: 'organizing',
            done: 0,
            total: comics.length,
            linked: 0,
            existing: 0,
            manifests: 0,
            skipped: 0,
            startedAt: now,
            updatedAt: now
        }

        const run = (async () => {
            let releaseResources: () => void = () => undefined
            try {
                const lease = await this.runtimeResources.acquire({
                    ownerId: 'library-organize',
                    taskType: 'library-organize',
                    priority: 'background',
                    resources: { 'filesystem-heavy': 1 }
                })
                releaseResources = () => lease.release()
                this.libraryOrganizeResult = await organizeLibraryViews(
                    this.dataDir,
                    comics,
                    {
                        checkpoint: () => this.libraryOrganizeCheckpoint(),
                        onProgress: (progress: LibraryOrganizeProgress) => {
                            const controlState =
                                this.libraryOrganizeProgress.state
                            this.libraryOrganizeProgress = {
                                ...this.libraryOrganizeProgress,
                                state:
                                    controlState === 'pausing' ||
                                    controlState === 'cancelling'
                                        ? controlState
                                        : 'running',
                                phase: 'organizing',
                                done: progress.done,
                                total: progress.total,
                                linked: progress.linked ?? 0,
                                existing: progress.existing ?? 0,
                                manifests: progress.manifests ?? 0,
                                skipped: progress.skipped,
                                updatedAt: new Date().toISOString()
                            }
                        }
                    }
                )
                this.libraryOrganizeProgress = {
                    ...this.libraryOrganizeProgress,
                    state: 'complete',
                    phase: 'complete',
                    done: comics.length,
                    total: comics.length,
                    updatedAt: new Date().toISOString()
                }
            } catch (error) {
                if (error instanceof LibraryOrganizeCancelledError)
                    this.libraryOrganizeProgress = {
                        ...this.libraryOrganizeProgress,
                        state: 'cancelled',
                        phase: 'cancelled',
                        updatedAt: new Date().toISOString()
                    }
                else
                    this.libraryOrganizeProgress = {
                        ...this.libraryOrganizeProgress,
                        state: 'failed',
                        phase: 'failed',
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        updatedAt: new Date().toISOString()
                    }
            } finally {
                releaseResources()
                this.finishLibraryOrganizeControl()
            }
        })()
        this.libraryOrganizeRun = run
        void run.catch(() => {
            // The task records its authoritative terminal state above.
        })
        return {
            started: true,
            ...this.libraryOrganizeStatus()
        }
    }

    maintenanceRepairStatus() {
        const active = [
            'running',
            'pausing',
            'paused',
            'cancelling'
        ].includes(this.maintenanceRepairProgress.state)
        const terminal = [
            'complete',
            'failed',
            'cancelled'
        ].includes(this.maintenanceRepairProgress.state)
        return {
            ...this.maintenanceRepairProgress,
            active,
            canPause:
                this.maintenanceRepairProgress.state === 'running' ||
                this.maintenanceRepairProgress.state === 'pausing',
            canResume: this.maintenanceRepairProgress.state === 'paused',
            canCancel: active,
            issues: terminal ? this.maintenanceRepairIssues : undefined
        }
    }

    maintenanceRepairControl(action: 'pause' | 'resume' | 'cancel') {
        if (action === 'pause') {
            if (this.maintenanceRepairProgress.state === 'running') {
                this.maintenanceRepairPauseRequested = true
                this.maintenanceRepairProgress = {
                    ...this.maintenanceRepairProgress,
                    state: 'pausing',
                    updatedAt: new Date().toISOString()
                }
            }
            return this.maintenanceRepairStatus()
        }
        if (action === 'resume') {
            this.maintenanceRepairPauseRequested = false
            for (const resolve of this.maintenanceRepairResumeWaiters) resolve()
            this.maintenanceRepairResumeWaiters.clear()
            if (
                this.maintenanceRepairProgress.state === 'paused' ||
                this.maintenanceRepairProgress.state === 'pausing'
            )
                this.maintenanceRepairProgress = {
                    ...this.maintenanceRepairProgress,
                    state: 'running',
                    phase: 'scanning',
                    updatedAt: new Date().toISOString()
                }
            return this.maintenanceRepairStatus()
        }
        this.maintenanceRepairCancelRequested = true
        this.maintenanceRepairPauseRequested = false
        for (const resolve of this.maintenanceRepairResumeWaiters) resolve()
        this.maintenanceRepairResumeWaiters.clear()
        if (
            this.maintenanceRepairProgress.state === 'running' ||
            this.maintenanceRepairProgress.state === 'pausing' ||
            this.maintenanceRepairProgress.state === 'paused'
        )
            this.maintenanceRepairProgress = {
                ...this.maintenanceRepairProgress,
                state: 'cancelling',
                updatedAt: new Date().toISOString()
            }
        return this.maintenanceRepairStatus()
    }

    private async maintenanceRepairCheckpoint() {
        if (this.maintenanceRepairCancelRequested)
            throw new MaintenanceRepairCancelledError()
        if (!this.maintenanceRepairPauseRequested) return
        this.maintenanceRepairProgress = {
            ...this.maintenanceRepairProgress,
            state: 'paused',
            phase: 'paused',
            updatedAt: new Date().toISOString()
        }
        await new Promise<void>((resolve) =>
            this.maintenanceRepairResumeWaiters.add(resolve)
        )
        if (this.maintenanceRepairCancelRequested)
            throw new MaintenanceRepairCancelledError()
        this.maintenanceRepairProgress = {
            ...this.maintenanceRepairProgress,
            state: 'running',
            phase: 'scanning',
            updatedAt: new Date().toISOString()
        }
    }

    private finishMaintenanceRepairControl() {
        this.maintenanceRepairPauseRequested = false
        this.maintenanceRepairCancelRequested = false
        for (const resolve of this.maintenanceRepairResumeWaiters) resolve()
        this.maintenanceRepairResumeWaiters.clear()
        this.maintenanceRepairRun = null
    }

    startMaintenanceRepairScan() {
        if (
            this.maintenanceRepairRun &&
            [
                'running',
                'pausing',
                'paused',
                'cancelling'
            ].includes(this.maintenanceRepairProgress.state)
        )
            return {
                started: false,
                ...this.maintenanceRepairStatus()
            }

        const now = new Date().toISOString()
        this.maintenanceRepairPauseRequested = false
        this.maintenanceRepairCancelRequested = false
        this.maintenanceRepairResumeWaiters.clear()
        this.maintenanceRepairIssues = []
        this.maintenanceRepairProgress = {
            state: 'running',
            phase: 'scanning',
            done: 0,
            total: 0,
            issueCount: 0,
            startedAt: now,
            updatedAt: now
        }

        const run = (async () => {
            let releaseResources: () => void = () => undefined
            try {
                const lease = await this.runtimeResources.acquire({
                    ownerId: 'maintenance-repair',
                    taskType: 'maintenance-repair-scan',
                    priority: 'background',
                    resources: {
                        'filesystem-heavy': 1,
                        'sqlite-read-heavy': 1
                    }
                })
                releaseResources = () => lease.release()
                const issues = await scanRepairIssues(this.database, {
                    checkpoint: () => this.maintenanceRepairCheckpoint(),
                    onProgress: ({ done, total }) => {
                        const controlState =
                            this.maintenanceRepairProgress.state
                        this.maintenanceRepairProgress = {
                            ...this.maintenanceRepairProgress,
                            state:
                                controlState === 'pausing' ||
                                controlState === 'cancelling'
                                    ? controlState
                                    : 'running',
                            phase: 'scanning',
                            done,
                            total,
                            updatedAt: new Date().toISOString()
                        }
                    }
                })
                this.maintenanceRepairIssues = issues
                this.maintenanceRepairProgress = {
                    ...this.maintenanceRepairProgress,
                    state: 'complete',
                    phase: 'complete',
                    issueCount: issues.length,
                    updatedAt: new Date().toISOString()
                }
            } catch (error) {
                if (error instanceof MaintenanceRepairCancelledError)
                    this.maintenanceRepairProgress = {
                        ...this.maintenanceRepairProgress,
                        state: 'cancelled',
                        phase: 'cancelled',
                        updatedAt: new Date().toISOString()
                    }
                else
                    this.maintenanceRepairProgress = {
                        ...this.maintenanceRepairProgress,
                        state: 'failed',
                        phase: 'failed',
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        updatedAt: new Date().toISOString()
                    }
            } finally {
                releaseResources()
                this.finishMaintenanceRepairControl()
            }
        })()
        this.maintenanceRepairRun = run
        void run.catch(() => {
            // The task records its authoritative terminal state above.
        })
        return {
            started: true,
            ...this.maintenanceRepairStatus()
        }
    }

    maintenanceUpdateStatus() {
        const active = [
            'running',
            'pausing',
            'paused',
            'cancelling'
        ].includes(this.maintenanceUpdateProgress.state)
        const terminal = [
            'complete',
            'failed',
            'cancelled'
        ].includes(this.maintenanceUpdateProgress.state)
        return {
            ...this.maintenanceUpdateProgress,
            active,
            canPause:
                this.maintenanceUpdateProgress.state === 'running' ||
                this.maintenanceUpdateProgress.state === 'pausing',
            canResume: this.maintenanceUpdateProgress.state === 'paused',
            canCancel: active,
            findings: terminal ? this.maintenanceUpdateFindings : undefined
        }
    }

    maintenanceUpdateControl(action: 'pause' | 'resume' | 'cancel') {
        if (action === 'pause') {
            if (this.maintenanceUpdateProgress.state === 'running') {
                this.maintenanceUpdatePauseRequested = true
                this.maintenanceUpdateProgress = {
                    ...this.maintenanceUpdateProgress,
                    state: 'pausing',
                    updatedAt: new Date().toISOString()
                }
            }
            return this.maintenanceUpdateStatus()
        }
        if (action === 'resume') {
            this.maintenanceUpdatePauseRequested = false
            for (const resolve of this.maintenanceUpdateResumeWaiters) resolve()
            this.maintenanceUpdateResumeWaiters.clear()
            if (
                this.maintenanceUpdateProgress.state === 'paused' ||
                this.maintenanceUpdateProgress.state === 'pausing'
            )
                this.maintenanceUpdateProgress = {
                    ...this.maintenanceUpdateProgress,
                    state: 'running',
                    phase: 'checking',
                    updatedAt: new Date().toISOString()
                }
            return this.maintenanceUpdateStatus()
        }
        this.maintenanceUpdateCancelRequested = true
        this.maintenanceUpdatePauseRequested = false
        for (const resolve of this.maintenanceUpdateResumeWaiters) resolve()
        this.maintenanceUpdateResumeWaiters.clear()
        if (
            this.maintenanceUpdateProgress.state === 'running' ||
            this.maintenanceUpdateProgress.state === 'pausing' ||
            this.maintenanceUpdateProgress.state === 'paused'
        )
            this.maintenanceUpdateProgress = {
                ...this.maintenanceUpdateProgress,
                state: 'cancelling',
                updatedAt: new Date().toISOString()
            }
        return this.maintenanceUpdateStatus()
    }

    private async maintenanceUpdateCheckpoint() {
        if (this.maintenanceUpdateCancelRequested)
            throw new MaintenanceUpdateCancelledError()
        if (!this.maintenanceUpdatePauseRequested) return
        this.maintenanceUpdateProgress = {
            ...this.maintenanceUpdateProgress,
            state: 'paused',
            phase: 'paused',
            updatedAt: new Date().toISOString()
        }
        await new Promise<void>((resolve) =>
            this.maintenanceUpdateResumeWaiters.add(resolve)
        )
        if (this.maintenanceUpdateCancelRequested)
            throw new MaintenanceUpdateCancelledError()
        this.maintenanceUpdateProgress = {
            ...this.maintenanceUpdateProgress,
            state: 'running',
            phase: 'checking',
            updatedAt: new Date().toISOString()
        }
    }

    private finishMaintenanceUpdateControl() {
        this.maintenanceUpdatePauseRequested = false
        this.maintenanceUpdateCancelRequested = false
        for (const resolve of this.maintenanceUpdateResumeWaiters) resolve()
        this.maintenanceUpdateResumeWaiters.clear()
        this.maintenanceUpdateRun = null
    }

    async checkUpdates(
        comicIds?: string[],
        options: {
            checkpoint?: () => Promise<void> | void
            onProgress?: (
                done: number,
                total: number,
                findings: UpdateFinding[]
            ) => void
        } = {}
    ) {
        const providerService = this.providerService()
        const ids = comicIds?.length
            ? [...new Set(comicIds)]
            : this.database.listDownloadedComicIds()
        const findings: UpdateFinding[] = []
        for (let index = 0; index < ids.length; index += 1) {
            await options.checkpoint?.()
            const comicId = ids[index]
            findings.push(
                await checkComicUpdates(
                    this.database,
                    {
                        episodes: async (id) =>
                            (await providerService.getEpisodes(id))
                                .map((episode) => ({
                                    id: episode.id || episode._id || '',
                                    order: episode.order,
                                    title: episode.title,
                                    updatedAt: episode.updated_at
                                }))
                                .filter((episode) => episode.id)
                    },
                    comicId
                )
            )
            options.onProgress?.(index + 1, ids.length, findings)
            await options.checkpoint?.()
        }
        return findings
    }

    startMaintenanceUpdateCheck(comicIds?: string[]) {
        if (
            this.maintenanceUpdateRun &&
            [
                'running',
                'pausing',
                'paused',
                'cancelling'
            ].includes(this.maintenanceUpdateProgress.state)
        )
            return {
                started: false,
                ...this.maintenanceUpdateStatus()
            }

        const ids = comicIds?.length
            ? [...new Set(comicIds)]
            : this.database.listDownloadedComicIds()
        const now = new Date().toISOString()
        this.maintenanceUpdatePauseRequested = false
        this.maintenanceUpdateCancelRequested = false
        this.maintenanceUpdateResumeWaiters.clear()
        this.maintenanceUpdateFindings = []
        this.maintenanceUpdateProgress = {
            state: 'running',
            phase: 'checking',
            done: 0,
            total: ids.length,
            findingCount: 0,
            updateCount: 0,
            startedAt: now,
            updatedAt: now
        }

        const run = (async () => {
            let releaseResources: () => void = () => undefined
            try {
                const lease = await this.runtimeResources.acquire({
                    ownerId: 'maintenance-update',
                    taskType: 'maintenance-update-scan',
                    priority: 'background',
                    resources: {
                        'provider-network': 1,
                        'sqlite-write-heavy': 1
                    }
                })
                releaseResources = () => lease.release()
                const findings = await this.checkUpdates(ids, {
                    checkpoint: () => this.maintenanceUpdateCheckpoint(),
                    onProgress: (done, total, current) => {
                        this.maintenanceUpdateFindings = [...current]
                        const controlState =
                            this.maintenanceUpdateProgress.state
                        this.maintenanceUpdateProgress = {
                            ...this.maintenanceUpdateProgress,
                            state:
                                controlState === 'pausing' ||
                                controlState === 'cancelling'
                                    ? controlState
                                    : 'running',
                            phase: 'checking',
                            done,
                            total,
                            findingCount: current.length,
                            updateCount: current.filter(
                                (finding) =>
                                    finding.newEpisodeOrders.length > 0 ||
                                    finding.metadataChanged
                            ).length,
                            updatedAt: new Date().toISOString()
                        }
                    }
                })
                this.maintenanceUpdateFindings = findings
                this.maintenanceUpdateProgress = {
                    ...this.maintenanceUpdateProgress,
                    state: 'complete',
                    phase: 'complete',
                    done: ids.length,
                    total: ids.length,
                    findingCount: findings.length,
                    updateCount: findings.filter(
                        (finding) =>
                            finding.newEpisodeOrders.length > 0 ||
                            finding.metadataChanged
                    ).length,
                    updatedAt: new Date().toISOString()
                }
            } catch (error) {
                if (error instanceof MaintenanceUpdateCancelledError)
                    this.maintenanceUpdateProgress = {
                        ...this.maintenanceUpdateProgress,
                        state: 'cancelled',
                        phase: 'cancelled',
                        updatedAt: new Date().toISOString()
                    }
                else
                    this.maintenanceUpdateProgress = {
                        ...this.maintenanceUpdateProgress,
                        state: 'failed',
                        phase: 'failed',
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        updatedAt: new Date().toISOString()
                    }
            } finally {
                releaseResources()
                this.finishMaintenanceUpdateControl()
            }
        })()
        this.maintenanceUpdateRun = run
        void run.catch(() => {
            // The task records its authoritative terminal state above.
        })
        return {
            started: true,
            ...this.maintenanceUpdateStatus()
        }
    }

    enqueueDownload(input: CreateDownloadJob): DownloadJob {
        if (
            (input.runner ?? 'LOCAL') === 'LOCAL' &&
            !this.acceptingLocalDownloads
        )
            throw new Error('The local download engine is shutting down')
        const job = this.database.createDownloadJob(input)
        return this.database.transitionDownloadJob(job.id, 'QUEUED')
    }

    localDownloadRuntime() {
        return {
            running: this.activeLocalRuns.size > 0,
            schedulers: this.activeLocalSchedulers.size,
            startedAt:
                this.activeLocalRuns.size > 0
                    ? this.localDownloadRunStartedAt
                    : null,
            lastError: this.localDownloadLastError,
            recoveredOnStartup: this.recoveredLocalDownloadJobs,
            accepting: this.acceptingLocalDownloads
        }
    }

    startLocalDownloadQueue(
        options: {
            profile?: PerformanceProfile
            custom?: Partial<PerformanceSettings>
            onProgress?: (progress: DownloadProgress) => void
        } = {}
    ) {
        if (!this.acceptingLocalDownloads)
            throw new Error('The local download engine is shutting down')

        // Validate synchronously so an invalid Web request still receives an
        // immediate actionable error rather than launching a rejected task.
        resolvePerformanceSettings(
            options.profile ?? 'balanced',
            options.custom
        )

        if (this.activeLocalRuns.size > 0)
            return {
                started: false,
                ...this.localDownloadRuntime()
            }

        void this.runDownloadQueue({
            ...options,
            runner: 'LOCAL'
        }).catch(() => {
            // runDownloadQueue records the authoritative error for status/UI.
        })
        return {
            started: true,
            ...this.localDownloadRuntime()
        }
    }

    async runDownloadQueue(
        options: {
            runner?: DownloadRunner
            profile?: PerformanceProfile
            custom?: Partial<PerformanceSettings>
            onProgress?: (progress: DownloadProgress) => void
        } = {}
    ) {
        const runner = options.runner ?? 'LOCAL'
        if (runner === 'LOCAL' && !this.acceptingLocalDownloads)
            throw new Error('The local download engine is shutting down')
        if (runner === 'LOCAL' && this.activeLocalRuns.size > 0)
            throw new Error('The local download queue is already running')
        if (runner === 'LOCAL') {
            this.localDownloadRunStartedAt = new Date().toISOString()
            this.localDownloadLastError = null
        }
        const settings = resolvePerformanceSettings(
            options.profile ?? 'balanced',
            options.custom
        )
        const mediaGate = new MediaRequestGate(
            settings.globalMediaConcurrency,
            settings.requestIntervalMs
        )
        const store = {
            nextDownloadJobs: (limit: number) =>
                this.database.nextDownloadJobs(limit, runner),
            getDownloadJob: this.database.getDownloadJob.bind(this.database),
            transitionDownloadJob: this.database.transitionDownloadJob.bind(
                this.database
            )
        }
        const scheduler = new DownloadScheduler(
            store,
            async (job) => {
                let latestProgress: DownloadProgress | null = null
                let lastPersistedAt = 0
                const persistProgress = (
                    progress: DownloadProgress,
                    force = false,
                    emit = true
                ) => {
                    latestProgress = progress
                    if (emit) options.onProgress?.(progress)
                    const now = Date.now()
                    if (
                        !force &&
                        now - lastPersistedAt <
                            DOWNLOAD_PROGRESS_PERSIST_INTERVAL_MS
                    )
                        return
                    this.database.updateDownloadProgress(job.id, {
                        progressCompleted: progress.completed,
                        progressTotal: progress.total,
                        bytes: progress.bytes,
                        chapterTitle: progress.episodeTitle
                    })
                    lastPersistedAt = now
                }
                try {
                    const result = await this.downloadComicNow(job.comicId, {
                        episodeOrders: job.episodeOrders,
                        mediaGate,
                        onProgress: (progress) =>
                            persistProgress(progress),
                        shouldStop: () => {
                            const status = this.database.getDownloadJob(
                                job.id
                            ).status
                            return (
                                status === 'PAUSED' ||
                                status === 'CANCELLED'
                            )
                        }
                    })
                    this.database.updateDownloadProgress(job.id, {
                        progressCompleted: result.completed,
                        progressTotal: result.pictures,
                        bytes: result.bytes
                    })
                } finally {
                    if (latestProgress)
                        persistProgress(latestProgress, true, false)
                }
            },
            {
                jobConcurrency: settings.jobConcurrency,
                maxRetries: settings.maxRetries,
                retryBaseMs: settings.retryBaseMs
            }
        )
        const execution = (async () => {
            const lease = await this.runtimeResources.acquire({
                ownerId: `download-${runner.toLowerCase()}`,
                taskType:
                    runner === 'LOCAL'
                        ? 'local-download-runner'
                        : 'github-download-runner',
                priority: 'user',
                resources: {
                    'media-network': 1,
                    'filesystem-heavy': 1,
                    'sqlite-write-heavy': 1
                }
            })
            try {
                await scheduler.drain()
            } finally {
                lease.release()
            }
        })()
        if (runner === 'LOCAL') {
            this.activeLocalRuns.add(execution)
            this.activeLocalSchedulers.add(scheduler)
        }
        try {
            await execution
        } catch (error) {
            if (runner === 'LOCAL')
                this.localDownloadLastError =
                    error instanceof Error ? error.message : String(error)
            throw error
        } finally {
            if (runner === 'LOCAL') {
                this.activeLocalRuns.delete(execution)
                this.activeLocalSchedulers.delete(scheduler)
                if (this.activeLocalRuns.size === 0)
                    this.localDownloadRunStartedAt = null
            }
        }
        return this.database.listDownloadJobs()
    }

    hasActiveLocalDownloads() {
        return this.database.hasActiveDownloadJobs('LOCAL')
    }

    async quiesceLocalDownloads(timeoutMs = 30_000) {
        this.acceptingLocalDownloads = false
        for (const scheduler of this.activeLocalSchedulers) scheduler.stop()
        const pausable = new Set([
            'QUEUED',
            'PREPARING',
            'RUNNING',
            'RETRY_WAIT'
        ])
        for (const job of this.database.listDownloadJobs()) {
            if (job.runner === 'LOCAL' && pausable.has(job.status))
                this.database.transitionDownloadJob(job.id, 'PAUSED')
        }
        const settled = Promise.allSettled([...this.activeLocalRuns]).then(
            () => undefined
        )
        let timeout: NodeJS.Timeout | undefined
        try {
            await Promise.race([
                settled,
                new Promise<never>((_, reject) => {
                    timeout = setTimeout(
                        () =>
                            reject(
                                new Error(
                                    'Timed out waiting for active downloads to pause'
                                )
                            ),
                        timeoutMs
                    )
                })
            ])
        } finally {
            if (timeout) clearTimeout(timeout)
        }
    }

    private async downloadPicaComicNow(
        comicId: string,
        options: {
            episodeOrders?: number[]
            mediaGate: MediaRequestGate
            onProgress?: (progress: DownloadProgress) => void
            shouldStop?: () => boolean
        }
    ): Promise<DownloadResult> {
        const pica = await this.connect()
        const comic = await pica.comicInfo(comicId)
        if (comic.allowDownload === false) {
            throw new Error(
                'The site reports that this comic is not downloadable'
            )
        }
        this.database.importCatalog(
            [comicToRecord(comic)],
            'pica:download:metadata'
        )
        const observedEpisodes = await pica.episodesAll(comicId)
        for (const episode of observedEpisodes) {
            const episodeId = episode.id || episode._id
            if (!episodeId)
                throw new Error('Episode response did not include an id')
            this.database.upsertEpisode({
                id: episodeId,
                comicId,
                title: episode.title,
                order: episode.order,
                updatedAt: episode.updated_at
            })
        }
        let episodes = observedEpisodes
        if (options.episodeOrders?.length) {
            const allowed = new Set(options.episodeOrders)
            episodes = episodes.filter((episode) => allowed.has(episode.order))
        }

        const result: DownloadResult = {
            comicId,
            title: comic.title.trim(),
            episodes: episodes.length,
            pictures: 0,
            downloaded: 0,
            skipped: 0,
            completed: 0,
            bytes: 0
        }
        const work: Array<{
            picture: Picture
            pictureId: string
            episodeId: string
            episodeTitle: string
            file: string
        }> = []
        for (const episode of episodes) {
            const episodeId = episode.id || episode._id
            if (!episodeId)
                throw new Error('Episode response did not include an id')
            const pictures = await pica.picturesAll(comicId, episode)
            result.pictures += pictures.length
            const stored = this.database.getComic(comicId)
            const episodeDir = renderLibraryPath(
                path.join(this.dataDir, 'library'),
                process.env.PICA_LIBRARY_PATH_TEMPLATE ??
                    defaultLibraryTemplate,
                {
                    author:
                        stored?.canonicalAuthor ??
                        comic.author ??
                        'Unknown author',
                    title: comic.title,
                    comic_id: comicId,
                    chapter_order: String(episode.order).padStart(4, '0'),
                    chapter: episode.title || episodeId
                }
            )
            pictures.forEach((picture, index) => {
                const pictureId =
                    picture.id ||
                    String((picture as Picture & { _id?: string })._id ?? '')
                if (!pictureId)
                    throw new Error('Picture response did not include an id')
                this.database.upsertPicture({
                    id: pictureId,
                    comicId,
                    episodeId,
                    position: index + 1,
                    originalName: picture.media.originalName,
                    mediaPath: picture.media.path,
                    fileServer: picture.media.fileServer
                })
                work.push({
                    picture,
                    pictureId,
                    episodeId,
                    episodeTitle: episode.title,
                    file: path.join(
                        episodeDir,
                        safePathSegment(picture.name, `${index + 1}.jpg`)
                    )
                })
            })
        }
        const validExisting = new Map<string, string>()
        for (const item of work) {
            const previous = this.database.pictureDownloadState(item.pictureId)
            const existing =
                previous?.status === 'completed' &&
                previous.localPath &&
                fs.existsSync(previous.localPath)
                    ? previous.localPath
                    : fs.existsSync(item.file)
                      ? item.file
                      : null
            if (existing && fs.statSync(existing).size > 0) {
                validExisting.set(item.pictureId, existing)
            }
        }
        let completed = validExisting.size
        const completedPictureIds = new Set(validExisting.keys())
        let cumulativeBytes = [...validExisting.keys()].reduce(
            (total, pictureId) =>
                total +
                (this.database.pictureDownloadState(pictureId)?.byteSize ?? 0),
            0
        )
        result.skipped = completed
        result.pictures = work.length
        let attemptFailed = false
        const settled = await Promise.allSettled(
            work.map(async (item) => {
                if (options.shouldStop?.()) return
                const existing = validExisting.get(item.pictureId)
                if (existing) {
                    const data = fs.readFileSync(existing)
                    this.database.markPictureDownloaded(
                        item.pictureId,
                        existing,
                        data.byteLength,
                        createHash('sha256').update(data).digest('hex')
                    )
                    return
                }
                await options.mediaGate.run(async () => {
                    if (attemptFailed || options.shouldStop?.()) return
                    try {
                        const downloaded = await pica.downloadToFile(
                            item.picture.url,
                            item.file
                        )
                        this.database.markPictureDownloaded(
                            item.pictureId,
                            item.file,
                            downloaded.bytes,
                            downloaded.sha256
                        )
                        result.downloaded += 1
                        completedPictureIds.add(item.pictureId)
                        cumulativeBytes += downloaded.bytes
                        completed += 1
                        options.onProgress?.({
                            comicId,
                            comicTitle: comic.title,
                            episodeId: item.episodeId,
                            episodeTitle: item.episodeTitle,
                            completed,
                            total: work.length,
                            bytes: cumulativeBytes,
                            file: item.file
                        })
                    } catch (error) {
                        attemptFailed = true
                        throw error
                    }
                })
            })
        )
        result.completed = completedPictureIds.size
        result.bytes = [...completedPictureIds].reduce(
            (total, pictureId) =>
                total +
                (this.database.pictureDownloadState(pictureId)?.byteSize ?? 0),
            0
        )
        const failure = settled.find(
            (item): item is PromiseRejectedResult => item.status === 'rejected'
        )
        if (failure) throw failure.reason
        return result
    }

    private async downloadComicNow(
        comicId: string,
        options: {
            episodeOrders?: number[]
            mediaGate: MediaRequestGate
            onProgress?: (progress: DownloadProgress) => void
            shouldStop?: () => boolean
        }
    ): Promise<DownloadResult> {
        if (!comicId.includes(':'))
            return this.downloadPicaComicNow(comicId, options)
        const providerService = this.providerService()
        const comic = await providerService.getComicDetails(comicId)
        if (
            comic.providerId === 'pica' &&
            comic.providerMetadata.allowDownload === false
        )
            throw new Error('The site reports that this comic is not downloadable')
        const observedEpisodes = await providerService.getEpisodes(comicId)
        for (const episode of observedEpisodes) {
            const episodeId = episode.id || episode._id
            if (!episodeId)
                throw new Error('Episode response did not include an id')
            this.database.upsertEpisode({
                id: episodeId,
                comicId,
                title: episode.title,
                order: episode.order,
                updatedAt: episode.updated_at
            })
        }
        let episodes = observedEpisodes
        if (options.episodeOrders?.length) {
            const allowed = new Set(options.episodeOrders)
            episodes = episodes.filter((episode) => allowed.has(episode.order))
        }
        const result: DownloadResult = {
            comicId,
            title: comic.title.trim(),
            episodes: episodes.length,
            pictures: 0,
            downloaded: 0,
            skipped: 0,
            completed: 0,
            bytes: 0
        }
        const work: Array<{
            picture: Picture
            pictureId: string
            episodeId: string
            episodeTitle: string
            file: string
        }> = []
        for (const episode of episodes) {
            const episodeId = episode.id || episode._id
            if (!episodeId)
                throw new Error('Episode response did not include an id')
            const pictures = await providerService.getEpisodePages(comicId, episode)
            const stored = this.database.getComic(comicId)
            const episodeDir = renderLibraryPath(
                path.join(this.dataDir, 'library'),
                process.env.PICA_LIBRARY_PATH_TEMPLATE ?? defaultLibraryTemplate,
                {
                    author:
                        stored?.canonicalAuthor ?? comic.author ?? 'Unknown author',
                    title: comic.title,
                    comic_id: comicId,
                    chapter_order: String(episode.order).padStart(4, '0'),
                    chapter: episode.title || episodeId
                }
            )
            pictures.forEach((picture, index) => {
                const pictureId =
                    picture.id ||
                    String((picture as Picture & { _id?: string })._id ?? '')
                if (!pictureId)
                    throw new Error('Picture response did not include an id')
                this.database.upsertPicture({
                    id: pictureId,
                    comicId,
                    episodeId,
                    position: index + 1,
                    originalName: picture.media.originalName,
                    mediaPath: picture.media.path,
                    fileServer: picture.media.fileServer
                })
                work.push({
                    picture,
                    pictureId,
                    episodeId,
                    episodeTitle: episode.title,
                    file: path.join(
                        episodeDir,
                        safePathSegment(picture.name, `${index + 1}.jpg`)
                    )
                })
            })
        }
        const validExisting = new Map<string, string>()
        for (const item of work) {
            const previous = this.database.pictureDownloadState(item.pictureId)
            const existing =
                previous?.status === 'completed' &&
                previous.localPath &&
                fs.existsSync(previous.localPath)
                    ? previous.localPath
                    : fs.existsSync(item.file)
                      ? item.file
                      : null
            if (existing && fs.statSync(existing).size > 0)
                validExisting.set(item.pictureId, existing)
        }
        let completed = validExisting.size
        const completedPictureIds = new Set(validExisting.keys())
        let cumulativeBytes = [...validExisting.keys()].reduce(
            (total, pictureId) =>
                total + (this.database.pictureDownloadState(pictureId)?.byteSize ?? 0),
            0
        )
        result.skipped = completed
        result.pictures = work.length
        let attemptFailed = false
        const settled = await Promise.allSettled(
            work.map(async (item) => {
                if (options.shouldStop?.()) return
                const existing = validExisting.get(item.pictureId)
                if (existing) {
                    const data = fs.readFileSync(existing)
                    this.database.markPictureDownloaded(
                        item.pictureId,
                        existing,
                        data.byteLength,
                        createHash('sha256').update(data).digest('hex')
                    )
                    return
                }
                await options.mediaGate.run(async () => {
                    if (attemptFailed || options.shouldStop?.()) return
                    try {
                        const image = await providerService.fetchPage(
                            item.picture.url,
                            64 * 1024 * 1024
                        )
                        const extension =
                            image.contentType === 'image/png'
                                ? '.png'
                                : image.contentType === 'image/webp'
                                  ? '.webp'
                                  : image.contentType === 'image/gif'
                                    ? '.gif'
                                    : image.contentType === 'image/avif'
                                      ? '.avif'
                                      : '.jpg'
                        const target =
                            comic.providerId === 'eh'
                                ? item.file.replace(/.[^.]+$/, extension)
                                : item.file
                        await fs.promises.mkdir(path.dirname(target), {
                            recursive: true
                        })
                        const partial = `${target}.part`
                        await fs.promises.writeFile(partial, image.data)
                        await fs.promises.rename(partial, target)
                        const sha256 = createHash('sha256')
                            .update(image.data)
                            .digest('hex')
                        this.database.markPictureDownloaded(
                            item.pictureId,
                            target,
                            image.data.byteLength,
                            sha256
                        )
                        result.downloaded += 1
                        completedPictureIds.add(item.pictureId)
                        cumulativeBytes += image.data.byteLength
                        completed += 1
                        options.onProgress?.({
                            comicId,
                            comicTitle: comic.title,
                            episodeId: item.episodeId,
                            episodeTitle: item.episodeTitle,
                            completed,
                            total: work.length,
                            bytes: cumulativeBytes,
                            file: target
                        })
                    } catch (error) {
                        attemptFailed = true
                        throw error
                    }
                })
            })
        )
        result.completed = completedPictureIds.size
        result.bytes = [...completedPictureIds].reduce(
            (total, pictureId) =>
                total + (this.database.pictureDownloadState(pictureId)?.byteSize ?? 0),
            0
        )
        const failure = settled.find(
            (item): item is PromiseRejectedResult => item.status === 'rejected'
        )
        if (failure) throw failure.reason
        return result
    }

}

export function parseEpisodeSelection(input: string | undefined): number[] {
    if (!input || input === 'all') return []
    const values = new Set<number>()
    for (const part of input.split(',')) {
        const range = part.trim().match(/^(\d+)-(\d+)$/)
        if (range) {
            const start = Number(range[1])
            const end = Number(range[2])
            for (let value = start; value <= end; value += 1) values.add(value)
        } else {
            const value = Number(part.trim())
            if (Number.isInteger(value) && value > 0) values.add(value)
        }
    }
    return [...values].sort((a, b) => a - b)
}
