import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Recommendation V5 portable product contract', () => {
    it('keeps Desktop as the heavy-compute recommendation authority', () => {
        const bridge = read('src/mobile/bridge-server.ts')
        const client = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/BridgeClient.java')
        expect(bridge).toContain('/mobile/v1/recommendation/v5/sync')
        expect(bridge).toContain('/mobile/v1/recommendations')
        expect(client).toContain('syncRecommendationState')
        expect(client).toContain('DESKTOP_SYNCED')
    })

    it('exposes user-steerable policy on Desktop and Android', () => {
        const server = read('src/library/server.ts')
        const index = read('web/index.html')
        const web = read('web/recommendation-v5-beta.js')
        const activity = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationControlActivity.java')
        expect(server).toContain('/api/v1/recommendation-v5/control')
        expect(server).toContain('/api/v1/recommendation-v5/session')
        expect(index).toContain('recommendation-v5-beta.js')
        expect(web).toContain('多一点')
        expect(web).toContain('恢复系统判断')
        expect(activity).toContain('少一点')
        expect(activity).toContain('多一点')
        expect(activity).toContain('屏蔽')
    })

    it('applies work-level duplicate/owned suppression at ranking and serving', () => {
        const service = read('src/library/service.ts')
        const coordinator = read('src/recommendation-v3/cycle-coordinator-v3.ts')
        expect(service).toContain('filterCandidatesAgainstOwnedV5')
        expect(coordinator).toContain('filterCandidatesAgainstOwnedV5')
        expect(coordinator).toContain('servingFilteredCount')
    })

    it('keeps Visual V1 versioned assets untouched by policy integration', () => {
        const visual = read('src/recommendation-v4/visual-style.ts')
        expect(visual).toContain("VISUAL_SAMPLING_POLICY_VERSION = 'v1-spread-6-body-pages'")
        expect(visual).toContain("VISUAL_MODEL_ID = 'onnx-community/dinov2-small'")
    })

    it('queues mobile feedback for the next pairing sync', () => {
        const feedback = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationFeedbackStore.java')
        const pairing = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PairingActivity.java')
        expect(feedback).toContain('dirtyPayload')
        expect(pairing).toContain('syncRecommendationState')
    })
})
