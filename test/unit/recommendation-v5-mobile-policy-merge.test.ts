import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { RecommendationPolicyStoreV5 } from '../../src/recommendation-v5/policy-store'

describe('Recommendation V5 mobile policy merge', () => {
    it('keeps Android Session Intent local and gates concurrent explicit conflicts', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v5-mobile-merge-'))
        const database = new LibraryDatabase(path.join(dir, 'library.db'))
        try {
            const store = new RecommendationPolicyStoreV5(database)
            store.setControl({
                targetType: 'TAG',
                key: 'tag-a',
                label: 'Tag A',
                direction: 'MORE',
                levelDelta: 2,
                scope: 'PERSISTENT'
            })
            const base = store.snapshot()

            store.setControl({
                targetType: 'TAG',
                key: 'tag-a',
                label: 'Tag A',
                direction: 'MORE',
                levelDelta: 3,
                scope: 'PERSISTENT'
            })

            const payload = {
                syncSchemaVersion: 1,
                deviceId: 'android-device',
                mutationId: 'mutation-1',
                baseRevision: base.revision,
                baseControls: base.controls,
                controls: [
                    {
                        targetType: 'TAG',
                        key: 'tag-a',
                        label: 'Tag A',
                        direction: 'MORE',
                        levelDelta: 4,
                        scope: 'PERSISTENT'
                    }
                ],
                sessionIntent: {
                    mode: 'TARGET',
                    targetType: 'TAG',
                    key: 'phone-only',
                    label: 'Phone only'
                }
            }

            const conflict = store.mergeMobile(payload)
            expect(conflict).toMatchObject({
                requiresResolution: true,
                acknowledgedMutationId: null
            })
            expect(conflict.conflicts).toHaveLength(1)
            expect(store.state().sessionIntent.mode).toBe('DEFAULT')
            expect(store.state().controls[0].levelDelta).toBe(3)

            const resolved = store.mergeMobile({
                ...payload,
                resolutions: [
                    {
                        identity: 'TAG:tag-a',
                        choice: 'ANDROID'
                    }
                ]
            })
            expect(resolved).toMatchObject({
                requiresResolution: false,
                acknowledgedMutationId: 'mutation-1'
            })
            expect(store.state().controls[0].levelDelta).toBe(4)
            expect(store.state().sessionIntent.mode).toBe('DEFAULT')
        } finally {
            database.close()
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })

    it('keeps legacy Session Intent behavior only for pre-v1 clients', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v5-mobile-legacy-'))
        const database = new LibraryDatabase(path.join(dir, 'library.db'))
        try {
            const store = new RecommendationPolicyStoreV5(database)
            const result = store.mergeMobile({
                deviceId: 'legacy-device',
                mutationId: 'legacy-mutation',
                sessionIntent: {
                    mode: 'TARGET',
                    targetType: 'TAG',
                    key: 'legacy-target',
                    label: 'Legacy target'
                }
            })
            expect(result.acknowledgedMutationId).toBe('legacy-mutation')
            expect(store.state().sessionIntent).toMatchObject({
                mode: 'TARGET',
                key: 'legacy-target',
                source: 'ANDROID'
            })
        } finally {
            database.close()
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })
})
