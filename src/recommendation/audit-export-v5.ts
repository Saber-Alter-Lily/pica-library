import type { StoredComic } from '../library/types'
import type { UserEvent } from '../recommendation-v3/types'

/** Fixed audit views only; no config, credential store, SQL, file chooser or generation command. */
export interface RecommendationAuditExportReadPortV5 {
    userEvents(limit: number): UserEvent[]
    catalog(limit: number): StoredComic[]
    policySnapshot(): unknown
    preferenceTimescales(appSessionId: string | null, limit: number): unknown
    behaviorEvidence(limit: number): unknown
    candidateChannels(appSessionId: string | null, limit: number): unknown
    servingComposition(): unknown
    shadowRuns(limit: number): unknown
    evaluationSummary(
        limit: number,
        horizonDays: number,
        steerabilityStep: number,
        targetLimit: number
    ): unknown
}

export interface RecommendationAuditExportContextV5 {
    generatedAt: string
    productVersion: string
    sourceSha: string | null
    appSessionId: string | null
}

export const RECOMMENDATION_AUDIT_README_V5 = [
    'Pica Library Recommendation Audit Export',
    '',
    'This package contains allowlisted recommendation and interaction audit data only.',
    'preference_timescales.json is generated for the appSessionId recorded in manifest.json when the export is requested from the active Web session.',
    'candidate_channels.json describes the V5 shadow planner and is not the serving recommendation batch.',
    'serving_composition.json describes the persisted Final V3 serving batch without allocating or regenerating a recommendation batch.',
    'It intentionally excludes account passwords, provider tokens/cookies, GitHub credentials, WebDAV credentials, comic images, and downloaded manga files.',
    'Share this ZIP only when you intentionally want another person or analysis tool to review recommendation behavior.',
    ''
].join('\n')

/** Assemble the existing schema2 families in their original read order; encoding remains an adapter. */
export function buildRecommendationAuditBundleV5(
    read: RecommendationAuditExportReadPortV5,
    context: RecommendationAuditExportContextV5
) {
    const events = read.userEvents(10000)
    const catalog = read.catalog(10000).map((comic) => ({
        comicId: comic.comicId,
        title: comic.title,
        author: comic.author,
        canonicalAuthor: comic.canonicalAuthor ?? null,
        tags: comic.tags,
        categories: comic.categories,
        providerId: comic.providerId ?? null,
        isFavorite: comic.isFavorite,
        inLibrary: comic.inLibrary,
        downloadedPictures: comic.downloadedPictures,
        firstSeenAt: comic.firstSeenAt,
        lastSeenAt: comic.lastSeenAt
    }))
    const policy = read.policySnapshot()
    const timescales = read.preferenceTimescales(context.appSessionId, 10000)
    const behavior = read.behaviorEvidence(10000)
    const channels = read.candidateChannels(context.appSessionId, 10000)
    const servingComposition = read.servingComposition()
    const shadowRuns = read.shadowRuns(500)
    const evaluation = read.evaluationSummary(500, 30, 3, 50)
    const manifest = {
        schemaVersion: 2,
        kind: 'pica-library-recommendation-audit',
        generatedAt: context.generatedAt,
        productVersion: context.productVersion,
        sourceSha: context.sourceSha,
        appSessionId: context.appSessionId,
        includes: [
            'manifest.json',
            'policy_snapshot.json',
            'preference_timescales.json',
            'candidate_channels.json',
            'serving_composition.json',
            'behavior_evidence_v5.json',
            'user_events.json',
            'shadow_runs.json',
            'evaluation_snapshot.json',
            'catalog_minimal.json',
            'README.txt'
        ],
        excludes: [
            'pica_password',
            'pica_token',
            'eh_cookies',
            'github_token',
            'webdav_credentials',
            'comic_images',
            'downloaded_files'
        ]
    }
    return {
        manifest,
        jsonEntries: [
            { name: 'manifest.json', value: manifest },
            { name: 'policy_snapshot.json', value: policy },
            { name: 'preference_timescales.json', value: timescales },
            { name: 'candidate_channels.json', value: channels },
            { name: 'serving_composition.json', value: servingComposition },
            { name: 'behavior_evidence_v5.json', value: behavior },
            { name: 'user_events.json', value: events },
            { name: 'shadow_runs.json', value: shadowRuns },
            { name: 'evaluation_snapshot.json', value: evaluation },
            { name: 'catalog_minimal.json', value: catalog }
        ],
        readme: RECOMMENDATION_AUDIT_README_V5
    }
}
