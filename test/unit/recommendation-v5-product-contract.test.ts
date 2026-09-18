import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Recommendation V5 portable product contract', () => {
    it('keeps Desktop as the heavy-compute recommendation authority and exports a non-mutating portable cache', () => {
        const bridge = read('src/mobile/bridge-server.ts')
        const coordinator = read('src/recommendation-v3/cycle-coordinator-v3.ts')
        const client = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/BridgeClient.java')
        expect(bridge).toContain('/mobile/v1/recommendation/v5/sync')
        expect(bridge).toContain('/mobile/v1/recommendations/cache')
        expect(coordinator).toContain('portable(limit =')
        expect(client).toContain('syncRecommendationState')
        expect(client).toContain('DESKTOP_SYNCED_V5_PORTABLE')
        expect(client).toContain('policyBaseline')
        expect(coordinator).toContain('portableBaseline')
    })

    it('exposes user-steerable persistent and session policy on Desktop and Android', () => {
        const server = read('src/library/server.ts')
        const index = read('web/index.html')
        const web = read('web/recommendation-v5-beta.js')
        const activity = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationControlActivity.java')
        const store = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationPolicyStore.java')
        expect(server).toContain('/api/v1/recommendation-v5/control')
        expect(server).toContain('/api/v1/recommendation-v5/session')
        expect(index).toContain('recommendation-v5-beta.js')
        expect(web).toContain('多一点')
        expect(web).toContain('恢复系统判断')
        expect(activity).toContain('本次想看这类')
        expect(store).toContain('DIRTY_SESSION')
    })

    it('renders classified 10-step Desktop controls and explicit feedback acknowledgement', () => {
        const web = read('web/recommendation-v5-beta.js')
        const service = read('src/library/service.ts')
        const theme = read('web/alpha8-theme-help.js')
        expect(web).toContain('type="range"')
        expect(web).toContain('系统基准')
        expect(web).toContain('v5-facet-group')
        expect(web).toContain('已记录不喜欢')
        expect(web).toContain('v5-feedback-dislike')
        expect(service).toContain('resolveTagV3(')
        expect(service).toContain("phase: 'providers'")
        expect(theme).toContain('下方仍显示上一轮结果')
        expect(theme).toContain('新一轮推荐已更新')
    })

    it('separates factual recommendation dispositions from taste feedback', () => {
        const policy = read('src/recommendation-v5/policy-store.ts')
        const portable = read('src/recommendation-v5/portable-policy.ts')
        const web = read('web/recommendation-v5-beta.js')
        expect(policy).toContain('setItemDisposition')
        expect(policy).toContain('recommendation_item_disposition')
        expect(portable).toContain('seenComicIds')
        expect(portable).toContain('ownedComicIds')
        expect(portable).toContain('duplicateReportComicIds')
        expect(portable).toContain('temporarySuppressions')
        expect(web).toContain('30 天后自动恢复')
    })

    it('supports keeping a favorite while excluding it from taste inference', () => {
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const web = read('web/recommendation-v5-beta.js')
        const portable = read('src/recommendation-v5/portable-policy.ts')
        expect(server).toContain(
            '/api/v1/recommendation-v5/taste-exclusion'
        )
        expect(service).toContain('tasteExcludedIds')
        expect(service).toContain('tasteExcluded.has(comic.comicId)')
        expect(portable).toContain('tasteExcludedComicIds')
        expect(web).toContain('保留收藏，但不用于推荐口味')
    })

    it('adds a non-destructive canonical work identity foundation', () => {
        const migrations = read('src/storage/sqlite/migrations.ts')
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const identity = read(
            'src/recommendation-v5/work-identity-foundation.ts'
        )
        expect(migrations).toContain(
            "name: 'canonical_work_identity_foundation'"
        )
        expect(migrations).toContain('work_upload_bindings')
        expect(migrations).toContain('work_identity_decisions')
        expect(identity).toContain("mode: 'READ_ONLY'")
        expect(server).toContain(
            '/api/v1/recommendation-v5/work-identity/audit'
        )
        expect(service).toContain('automaticBinding: false')
    })

    it('persists work-identity evidence without promoting work bindings', () => {
        const database = read('src/library/database.ts')
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        expect(database).toContain('saveWorkIdentityEvidence')
        expect(database).toContain('listWorkIdentityEvidence')
        expect(service).toContain("'EVIDENCE_ONLY' as const")
        expect(service).toContain('automaticBinding: false')
        expect(server).toContain(
            '/api/v1/recommendation-v5/work-identity/evidence/refresh'
        )
    })


    it('supports reversible human identity adjudication without automatic binding', () => {
        const database = read('src/library/database.ts')
        const policy = read('src/recommendation-v5/policy-store.ts')
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const web = read('web/work-identity-review-beta.js')
        expect(database).toContain('saveWorkIdentityDecision')
        expect(database).toContain('clearWorkIdentityDecision')
        expect(policy).toContain('setExplicitDistinctPair')
        expect(service).toContain('recommendationV5WorkIdentityReview')
        expect(service).toContain('decision === \'KEEP_SEPARATE\'')
        expect(server).toContain(
            '/api/v1/recommendation-v5/work-identity/decision'
        )
        expect(web).toContain('同一作品')
        expect(web).toContain('不同版本')
        expect(web).toContain('保持分离')
        expect(web).toContain('不会自动创建 Work/Edition 绑定')
        expect(service).toContain('materializationPreview')
        expect(web).toContain('Work 物化预览')
        expect(web).toContain('仅预览，不写入 Work/Edition binding')
    })

    it('exposes a no-write controlled materialization plan before any binding mutation', () => {
        const database = read('src/library/database.ts')
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const identity = read(
            'src/recommendation-v5/work-identity-foundation.ts'
        )
        const web = read('web/work-identity-review-beta.js')
        expect(database).toContain('listWorkIdentityBindings')
        expect(identity).toContain(
            "WORK_IDENTITY_MATERIALIZATION_PLAN_VERSION"
        )
        expect(identity).toContain("mode: 'DRY_RUN'")
        expect(identity).toContain('writeEnabled: false')
        expect(identity).toContain('rollback:')
        expect(service).toContain(
            'recommendationV5WorkIdentityMaterializationPlan'
        )
        expect(server).toContain(
            '/api/v1/recommendation-v5/work-identity/materialization-plan'
        )
        expect(web).toContain('生成 Dry-run 绑定计划')
        expect(web).toContain('writeEnabled=false')
        expect(web).not.toContain('执行绑定')
    })

    it('keeps materialization execution disabled behind a Desktop prepare-only contract', () => {
        const migrations = read('src/storage/sqlite/migrations.ts')
        const database = read('src/library/database.ts')
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        expect(migrations).toContain(
            "name: 'work_identity_materialization_audit'"
        )
        expect(migrations).toContain(
            'work_identity_materialization_runs'
        )
        expect(database).toContain(
            'prepareWorkIdentityMaterializationRun'
        )
        expect(database).toContain('idempotentReplay')
        expect(service).toContain(
            'WORK_IDENTITY_MATERIALIZATION_PREPARE_CONFIRMATION'
        )
        expect(service).toContain("createHash('sha256')")
        expect(service).toContain("mode: 'PREPARED_ONLY'")
        expect(service).toContain('executionEnabled: false')
        expect(service).toContain('applyEndpoint: null')
        expect(server).toContain(
            '/api/v1/desktop/recommendation-v5/work-identity/materialization/prepare'
        )
        expect(server).toContain("request.headers['x-pica-csrf']")
        expect(server).not.toContain(
            '/api/v1/desktop/recommendation-v5/work-identity/materialization/apply'
        )
    })

    it('applies work-level duplicate/owned suppression at ranking and serving', () => {
        const service = read('src/library/service.ts')
        const coordinator = read('src/recommendation-v3/cycle-coordinator-v3.ts')
        expect(service).toContain('filterCandidatesAgainstOwnedV5')
        expect(coordinator).toContain('filterCandidatesAgainstOwnedV5')
        expect(coordinator).toContain('servingFilteredCount')
    })

    it('uses the same portable policy to re-rank cached Android recommendations offline', () => {
        const home = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java')
        const store = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationPolicyStore.java')
        const cache = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationStore.java')
        expect(home).toContain('RecommendationPolicyStore.applyLocalPolicy')
        expect(home).toContain('桌面完整计算结果 · 手机离线轻量重排')
        expect(store).toContain('applyLocalPolicy')
        expect(store).toContain('adjustment(current,item)-adjustment(baseline,item)')
        expect(store).toContain('moveVisibleBatch')
        expect(cache).toContain('final List<String> tags,categories')
    })

    it('keeps Visual V1 versioned assets untouched by policy integration', () => {
        const visual = read('src/recommendation-v4/visual-style.ts')
        expect(visual).toContain("VISUAL_SAMPLING_POLICY_VERSION = 'v1-spread-6-body-pages'")
        expect(visual).toContain("VISUAL_MODEL_ID = 'onnx-community/dinov2-small'")
    })

    it('queues mobile feedback and validates acknowledgement before clearing dirty state', () => {
        const feedback = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationFeedbackStore.java')
        const pairing = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PairingActivity.java')
        const store = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationPolicyStore.java')
        expect(feedback).toContain('dirtyPayload')
        expect(pairing).toContain('syncRecommendationState')
        expect(store).toContain('电脑未确认本次推荐同步')
    })
})
