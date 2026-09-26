import fs from 'node:fs'
import path from 'node:path'
import { LibraryDatabase } from '../../src/library/database'
import {
    CycleCoordinatorV3,
    type BuiltRecommendationCycleV3
} from '../../src/recommendation-v3/cycle-coordinator-v3'
import { FINAL_PROFILE_VERSION, type FinalLifetimeProfileV3 } from '../../src/recommendation-v3/final-profile'
import { BATCH_ALLOCATOR_VERSION } from '../../src/recommendation-v3/batch-allocator-v3'

function optionValue(name: string) {
    const prefix = `--${name}=`
    const inline = process.argv.slice(2).find((arg) => arg.startsWith(prefix))
    if (inline) return inline.slice(prefix.length)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : undefined
}

const libraryDirectory = optionValue('library-dir')
const output = optionValue('output')
if (!libraryDirectory) throw new Error('--library-dir is required')
if (!output) throw new Error('--output is required')

const root = path.resolve(libraryDirectory)
fs.mkdirSync(root, { recursive: true })
const databaseFile = path.join(root, 'library.db')
for (const suffix of ['', '-wal', '-shm'])
    fs.rmSync(`${databaseFile}${suffix}`, { force: true })

const database = new LibraryDatabase(databaseFile)
const candidateCount = 72
const records = Array.from({ length: candidateCount }, (_, index) => {
    const ordinal = index + 1
    return {
        comicId: `j7-recommend-${String(ordinal).padStart(3, '0')}`,
        title: `J7 推荐候选 ${String(ordinal).padStart(3, '0')}`,
        author: `J7 作者 ${ordinal % 9}`,
        description: 'J7 deterministic recommendation batch-switch fixture',
        categories: ['基准'],
        tags: ['推荐', `分组-${ordinal % 6}`],
        finished: ordinal % 2 === 0,
        updatedAt: '2026-09-26T00:00:00.000Z'
    }
})
database.importCatalog(records, 'benchmark:j7')

const profile: FinalLifetimeProfileV3 = {
    schemaVersion: 1,
    profileVersion: FINAL_PROFILE_VERSION,
    registryVersion: 'benchmark:j7',
    favoriteFingerprint: 'benchmark-j7-no-favorites',
    sourceFavoriteCount: 0,
    primaryInterests: [],
    profileOnlyInterests: [],
    modifierEvidence: [],
    creatorProfiles: [],
    unresolvedEvidence: [],
    generatedAt: '2026-09-26T00:00:00.000Z',
    noFabricatedRecency: true,
    providerSamplePriorEffect: 0
}

const versions = {
    profileVersion: profile.profileVersion,
    registryVersion: profile.registryVersion,
    rankerModelVersion: 'benchmark:j7-frozen',
    candidatePoolVersion: 'benchmark:j7-local',
    allocatorVersion: BATCH_ALLOCATOR_VERSION
}

const ranked = records.map((record, index) => {
    const comic = database.getComic(record.comicId)
    if (!comic) throw new Error(`Missing imported J7 candidate ${record.comicId}`)
    return {
        comicId: record.comicId,
        score: candidateCount - index,
        rawRank: index + 1,
        comic,
        features: {},
        reasons: ['J7_LOCAL_FIXTURE'],
        provenance: [],
        evidence: {
            comicId: record.comicId,
            originIntentIds: [],
            originRouteIds: ['j7-local'],
            routeFamilies: ['EXPLORATION'],
            primaryFamily: 'EXPLORATION',
            routeHitCount: 1,
            intentHitCount: 0,
            providerBestRank: index + 1,
            providerRanks: [index + 1],
            queryTerms: [],
            conjunctionEvidence: [],
            relatedSeedIds: [],
            exploration: true,
            firstSeenAt: '2026-09-26T00:00:00.000Z'
        }
    }
}) as BuiltRecommendationCycleV3['ranked']

const built: BuiltRecommendationCycleV3 = {
    profile,
    intents: [],
    routes: [],
    ranked,
    readiness: 'READY',
    telemetry: { fixture: 'p2-j7-local-batch-switch' },
    versions
}

const coordinator = new CycleCoordinatorV3(
    database,
    async () => built,
    versions
)
coordinator.forceNew('p2-j7-fixture')
await coordinator.waitForBuild()
const first = coordinator.current() as {
    cycleId?: string
    batchIndex?: number
    recommendations?: Array<{ comicId: string }>
    maxVisibleBatches?: number
}
if (!first.cycleId || first.batchIndex !== 0 || first.recommendations?.length !== 12)
    throw new Error('J7 fixture did not create the expected first managed V3 batch')

database.close()

const target = path.resolve(output)
fs.mkdirSync(path.dirname(target), { recursive: true })
const fixture = {
    schemaVersion: 1,
    candidateCount,
    expectedBatchSize: 12,
    expectedMaxVisibleBatches: Number(first.maxVisibleBatches ?? 6),
    initialBatchComicIds: first.recommendations.map((item) => item.comicId)
}
fs.writeFileSync(target, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify(fixture)}\n`)
