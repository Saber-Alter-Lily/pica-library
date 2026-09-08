import fs from 'node:fs'

const file = 'src/mobile/bridge-server.ts'
let source = fs.readFileSync(file, 'utf8')

const importAnchor = "import { ReaderService } from '../services/reader-service'\n"
const imports = `${importAnchor}import { CycleCoordinatorV3 } from '../recommendation-v3/cycle-coordinator-v3'\nimport { FINAL_PROFILE_VERSION } from '../recommendation-v3/final-profile'\nimport { RANKER_ADAPTER_VERSION } from '../recommendation-v3/ranker-adapter-v3'\nimport { RETRIEVER_VERSION } from '../recommendation-v3/retriever-v3'\nimport { BATCH_ALLOCATOR_VERSION } from '../recommendation-v3/batch-allocator-v3'\n`
if (!source.includes('CycleCoordinatorV3')) {
    if (!source.includes(importAnchor)) throw new Error('reader-service import anchor not found')
    source = source.replace(importAnchor, imports)
}

const initAnchor = `    const reader = new ReaderService(options.database, options.service.dataDir)\n`
const initBlock = `${initAnchor}    const finalRecommendationCoordinator = new CycleCoordinatorV3(\n        options.database,\n        (cycleId) => options.service.buildFinalRecommendationCycleV3(cycleId),\n        {\n            profileVersion: FINAL_PROFILE_VERSION,\n            registryVersion: 'PICA Registry V3',\n            rankerModelVersion: RANKER_ADAPTER_VERSION,\n            candidatePoolVersion: RETRIEVER_VERSION,\n            allocatorVersion: BATCH_ALLOCATOR_VERSION\n        }\n    )\n`
if (!source.includes('const finalRecommendationCoordinator = new CycleCoordinatorV3')) {
    if (!source.includes(initAnchor)) throw new Error('reader initialization anchor not found')
    source = source.replace(initAnchor, initBlock)
}

const oldRoute = `            if (\n                url.pathname === '/mobile/v1/recommendations' &&\n                request.method === 'GET'\n            ) {\n                const limit = boundedInt(\n                    url.searchParams.get('limit'),\n                    18,\n                    1,\n                    60\n                )\n                return json(\n                    response,\n                    200,\n                    await options.service.recommendations({ limit })\n                )\n            }\n`

const newRoute = `            if (\n                url.pathname === '/mobile/v1/recommendations' &&\n                request.method === 'GET'\n            ) {\n                const limit = boundedInt(\n                    url.searchParams.get('limit'),\n                    18,\n                    1,\n                    60\n                )\n                // The desktop web UI already owns the authoritative Final V3\n                // cycle/batch. Mobile must read that persisted batch instead of\n                // starting the expensive provider recall pipeline again.\n                const current = finalRecommendationCoordinator.current()\n                const recommendations = current.recommendations.slice(0, limit)\n                return json(response, 200, {\n                    ...current,\n                    recommendations,\n                    source: 'final-v3-current',\n                    cached: true\n                })\n            }\n`

if (source.includes(oldRoute)) source = source.replace(oldRoute, newRoute)
else if (!source.includes("source: 'final-v3-current'"))
    throw new Error('mobile recommendation route anchor not found')

fs.writeFileSync(file, source)
console.log('Applied mobile Final V3 recommendation cache patch')
