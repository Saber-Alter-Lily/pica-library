import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'

describe('Recommendation V5 shadow retrieval audit persistence', () => {
    it('reuses candidate-pool storage while isolating V5 shadow model versions', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-v5-shadow-audit-')
        )
        const database = new LibraryDatabase(
            path.join(dir, 'library.sqlite')
        )

        database.saveV3CandidatePool({
            appSessionId: 'session-v3',
            cycleId: 'v3-cycle',
            candidateIds: ['legacy-a'],
            modelVersion: 'v3.2.0-production',
            telemetry: { state: 'READY' }
        })
        const shadow = database.saveV3CandidatePool({
            appSessionId: 'session-shadow',
            cycleId: 'v5-shadow:cycle-1',
            candidateIds: [
                'candidate-a',
                'candidate-a',
                'candidate-b'
            ],
            modelVersion:
                'v5-shadow/planner-v1/compiler-v1/retrieval-v1',
            telemetry: {
                mode: 'SHADOW',
                servingImpact: false,
                persistCandidates: false,
                candidateCount: 2
            }
        })

        expect(shadow.candidateIds).toEqual([
            'candidate-a',
            'candidate-b'
        ])

        const runs =
            database.listCandidatePoolsByModelVersionPrefix(
                'v5-shadow/',
                20
            )
        expect(runs).toHaveLength(1)
        expect(runs[0]).toMatchObject({
            id: shadow.id,
            appSessionId: 'session-shadow',
            cycleId: 'v5-shadow:cycle-1',
            modelVersion:
                'v5-shadow/planner-v1/compiler-v1/retrieval-v1',
            expiresAt: null,
            candidateIds: ['candidate-a', 'candidate-b'],
            telemetry: {
                mode: 'SHADOW',
                servingImpact: false,
                persistCandidates: false,
                candidateCount: 2
            }
        })
        expect(
            database.getComic('candidate-a')
        ).toBeUndefined()

        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('matches model-version prefixes literally rather than treating wildcard characters specially', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-v5-shadow-prefix-')
        )
        const database = new LibraryDatabase(
            path.join(dir, 'library.sqlite')
        )
        database.saveV3CandidatePool({
            cycleId: 'shadow-1',
            candidateIds: [],
            modelVersion: 'v5-shadow/a_b/version'
        })
        database.saveV3CandidatePool({
            cycleId: 'shadow-2',
            candidateIds: [],
            modelVersion: 'v5-shadow/axb/version'
        })
        expect(
            database
                .listCandidatePoolsByModelVersionPrefix(
                    'v5-shadow/a_b',
                    20
                )
                .map((row) => row.cycleId)
        ).toEqual(['shadow-1'])
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })
})
