import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Pica } from '../../src/sdk'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'

const directories: string[] = []

async function waitFor(predicate: () => boolean, timeoutMs = 2000) {
    const started = Date.now()
    while (!predicate()) {
        if (Date.now() - started > timeoutMs)
            throw new Error('Timed out waiting for V5 shadow task state')
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
}

function setup() {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-shadow-runtime-'))
    directories.push(dataDir)
    const database = new LibraryDatabase(path.join(dataDir, 'library.db'))
    const service = new LibraryService(
        database,
        dataDir,
        {} as unknown as Pica
    )
    return { database, service }
}

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('P2 H2A Recommendation V5 shadow background runtime', () => {
    it('keeps pause/resume state authoritative around a bounded active step', async () => {
        const { database, service } = setup()
        let release!: () => void
        let entered!: () => void
        const enteredPromise = new Promise<void>((resolve) => {
            entered = resolve
        })
        const activeStep = new Promise<void>((resolve) => {
            release = resolve
        })

        service.runRecommendationV5ShadowRetrieval = (async (_input, runtime) => {
            runtime.onProgress?.({
                phase: 'retrieving',
                done: 1,
                total: 7,
                retrievalDone: 0,
                retrievalTotal: 1
            })
            entered()
            await activeStep
            runtime.onProgress?.({
                phase: 'retrieving',
                done: 1,
                total: 7,
                retrievalDone: 1,
                retrievalTotal: 1,
                rawCandidateCount: 4
            })
            await runtime.checkpoint?.()
            return {
                rawCandidateCount: 4,
                candidateCount: 3,
                ranking: { candidateCount: 3 },
                diversity: { selectedCount: 2 },
                audit: {
                    poolId: 'pool-test',
                    cycleId: 'cycle-test',
                    modelVersion: 'model-test',
                    generatedAt: '2026-09-24T00:00:00.000Z',
                    candidateIdCount: 3
                }
            } as never
        }) as typeof service.runRecommendationV5ShadowRetrieval

        expect(
            service.startRecommendationV5ShadowRetrieval({
                confirmation: 'RUN_RECOMMENDATION_V5_SHADOW_RETRIEVAL'
            })
        ).toMatchObject({
            started: true,
            state: 'running',
            phase: 'retrieving'
        })
        await enteredPromise

        expect(service.recommendationV5ShadowControl('pause')).toMatchObject({
            state: 'pausing'
        })
        release()
        await waitFor(
            () => service.recommendationV5ShadowStatus().state === 'paused'
        )
        expect(service.recommendationV5ShadowStatus()).toMatchObject({
            state: 'paused',
            retrievalDone: 1,
            retrievalTotal: 1,
            canResume: true
        })

        expect(service.recommendationV5ShadowControl('resume')).toMatchObject({
            state: 'running',
            phase: 'retrieving'
        })
        await waitFor(
            () => service.recommendationV5ShadowStatus().state === 'complete'
        )
        expect(service.recommendationV5ShadowStatus()).toMatchObject({
            state: 'complete',
            active: false,
            rawCandidateCount: 4,
            candidateCount: 3,
            rankedCandidateCount: 3,
            selectedCount: 2,
            result: {
                audit: {
                    poolId: 'pool-test'
                }
            }
        })
        database.close()
    })

    it('detaches the Desktop endpoint and exposes status/control routes', () => {
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        const service = fs.readFileSync('src/library/service.ts', 'utf8')
        const dashboard = fs.readFileSync(
            'web/recommendation-v5-evaluation.js',
            'utf8'
        )

        expect(server).toContain(
            "'/api/v1/desktop/recommendation-v5/shadow-retrieval/status'"
        )
        expect(server).toContain(
            "'/api/v1/desktop/recommendation-v5/shadow-retrieval/control'"
        )
        expect(server).toContain(
            'options.service.startRecommendationV5ShadowRetrieval('
        )
        expect(server).toContain('response,\n                    202')
        expect(server).not.toContain(
            'await options.service.runRecommendationV5ShadowRetrieval('
        )

        expect(service).toContain('recommendationV5ShadowStatus()')
        expect(service).toContain(
            "recommendationV5ShadowControl(\n        action: 'pause' | 'resume' | 'cancel'"
        )
        expect(service).toContain('recommendationV5ShadowCheckpoint()')
        expect(service).toContain(
            "executionAuthority: 'MANUAL_DESKTOP_ONLY' as const"
        )
        expect(service).toContain("trigger: 'EXPLICIT_CONFIRMATION' as const")

        expect(dashboard).toContain('evalPollShadowTask')
        expect(dashboard).toContain('evalRestoreShadowTask')
        expect(dashboard).toContain('v5-eval-shadow-pause')
        expect(dashboard).toContain('v5-eval-shadow-resume')
        expect(dashboard).toContain('v5-eval-shadow-cancel')
        expect(dashboard).toContain(
            '/api/v1/desktop/recommendation-v5/shadow-retrieval/status'
        )
        expect(dashboard).toContain(
            '/api/v1/desktop/recommendation-v5/shadow-retrieval/control'
        )
    })
})
