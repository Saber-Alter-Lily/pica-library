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

    it('adds a shadow behavior evidence layer without changing ranking', () => {
        const evidence = read(
            'src/recommendation-v5/behavior-evidence.ts'
        )
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const ranker = read(
            'src/recommendation-v3/ranker-adapter-v3.ts'
        )
        const coordinator = read(
            'src/recommendation-v3/cycle-coordinator-v3.ts'
        )
        expect(evidence).toContain(
            "BEHAVIOR_EVIDENCE_VERSION = 'behavior-evidence-v1'"
        )
        expect(evidence).toContain("mode: 'SHADOW'")
        expect(evidence).toContain('rankingImpact: false')
        expect(evidence).toContain("'EXPLICIT_NEGATIVE'")
        expect(evidence).toContain("'WEAK_POSITIVE'")
        expect(service).toContain('recommendationV5BehaviorEvidence')
        expect(server).toContain(
            '/api/v1/recommendation-v5/behavior-evidence'
        )
        expect(ranker).not.toContain('behavior-evidence')
        expect(coordinator).not.toContain('behavior-evidence')
    })

    it('adds shadow Lifetime / Recent / Session preference layers without replacing the ranker', () => {
        const timescales = read(
            'src/recommendation-v5/preference-timescales.ts'
        )
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const ranker = read(
            'src/recommendation-v3/ranker-adapter-v3.ts'
        )
        const coordinator = read(
            'src/recommendation-v3/cycle-coordinator-v3.ts'
        )
        expect(timescales).toContain(
            "PREFERENCE_TIMESCALE_VERSION ="
        )
        expect(timescales).toContain("'LIFETIME'")
        expect(timescales).toContain("'7D'")
        expect(timescales).toContain("'30D'")
        expect(timescales).toContain("'90D'")
        expect(timescales).toContain("'SESSION'")
        expect(timescales).toContain("mode: 'SHADOW'")
        expect(timescales).toContain('rankingImpact: false')
        expect(timescales).toContain('persistentControls')
        expect(timescales).toContain('hardConstraints')
        expect(service).toContain(
            'recommendationV5PreferenceTimescales'
        )
        expect(server).toContain(
            '/api/v1/recommendation-v5/preference-timescales'
        )
        expect(ranker).not.toContain('preference-timescales')
        expect(coordinator).not.toContain('preference-timescales')
    })

    it('adds a shadow multi-channel candidate planner with provider-isolated budgets', () => {
        const channels = read(
            'src/recommendation-v5/candidate-channels.ts'
        )
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const retriever = read(
            'src/recommendation-v3/retriever-v3.ts'
        )
        const coordinator = read(
            'src/recommendation-v3/cycle-coordinator-v3.ts'
        )
        expect(channels).toContain(
            "CANDIDATE_CHANNEL_PLANNER_VERSION ="
        )
        expect(channels).toContain("mode: 'SHADOW'")
        expect(channels).toContain('servingImpact: false')
        expect(channels).toContain('providerFailureIsolation: true')
        expect(channels).toContain("'REDISCOVERY'")
        expect(channels).toContain("'EXPLORATION'")
        expect(channels).toContain("'VISUAL'")
        expect(channels).toContain('globalRequestCaps')
        expect(service).toContain('recommendationV5CandidateChannels')
        expect(server).toContain(
            '/api/v1/recommendation-v5/candidate-channels'
        )
        expect(retriever).not.toContain('candidate-channels')
        expect(coordinator).not.toContain('candidate-channels')
    })

    it('compiles provider-specific retrieval routes without executing them', () => {
        const compiler = read(
            'src/recommendation-v5/provider-query-compiler.ts'
        )
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const retriever = read(
            'src/recommendation-v3/retriever-v3.ts'
        )
        const coordinator = read(
            'src/recommendation-v3/cycle-coordinator-v3.ts'
        )
        expect(compiler).toContain(
            "PROVIDER_QUERY_COMPILER_V5_VERSION ="
        )
        expect(compiler).toContain("mode: 'SHADOW'")
        expect(compiler).toContain('executionEnabled: false')
        expect(compiler).toContain("'EXACT_CANONICAL'")
        expect(compiler).toContain("'FALLBACK_KEYWORD'")
        expect(compiler).toContain(
            'deriveObservedEhCanonicalBindingsV5'
        )
        expect(service).toContain('recommendationV5ProviderRoutes')
        expect(server).toContain(
            '/api/v1/recommendation-v5/provider-routes'
        )
        expect(retriever).not.toContain(
            'provider-query-compiler'
        )
        expect(coordinator).not.toContain(
            'provider-query-compiler'
        )
    })

    it('runs provider-isolated shadow retrieval only through explicit Desktop authority', () => {
        const shadow = read(
            'src/recommendation-v5/shadow-retrieval.ts'
        )
        const pipeline = read(
            'src/recommendation-v5/shadow-pipeline.ts'
        )
        const provider = read('src/services/provider-service.ts')
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const retriever = read(
            'src/recommendation-v3/retriever-v3.ts'
        )
        const coordinator = read(
            'src/recommendation-v3/cycle-coordinator-v3.ts'
        )
        expect(shadow).toContain(
            "SHADOW_RETRIEVAL_V5_VERSION ="
        )
        expect(shadow).toContain('persistCandidates: false')
        expect(shadow).toContain('providerFailureIsolation: true')
        expect(provider).toContain('options: { persist?: boolean }')
        expect(provider).toContain('if (persist)')
        expect(provider).toContain('relatedPica')
        expect(service).toContain(
            'RECOMMENDATION_V5_SHADOW_RETRIEVAL_CONFIRMATION'
        )
        expect(service).toContain(
            "RUN_RECOMMENDATION_V5_SHADOW_RETRIEVAL"
        )
        expect(service).toContain('{ persist: false }')
        expect(server).toContain(
            '/api/v1/desktop/recommendation-v5/shadow-retrieval'
        )
        expect(server).toContain("request.headers['x-pica-csrf']")
        expect(retriever).not.toContain('shadow-retrieval')
        expect(coordinator).not.toContain('shadow-retrieval')
    })

    it('persists only versioned shadow telemetry and candidate IDs for benchmark history', () => {
        const database = read('src/library/database.ts')
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const shadow = read(
            'src/recommendation-v5/shadow-retrieval.ts'
        )
        const pipeline = read(
            'src/recommendation-v5/shadow-pipeline.ts'
        )
        expect(database).toContain(
            'listCandidatePoolsByModelVersionPrefix'
        )
        expect(database).toContain('modelVersion:')
        expect(service).toContain("cycleId = `v5-shadow:")
        expect(pipeline).toContain("'v5-shadow'")
        expect(service).toContain('saveV3CandidatePool')
        expect(service).toContain('candidateIds: ranking.rows.map')
        expect(service).toContain(
            'recommendationV5ShadowRuns'
        )
        expect(server).toContain(
            '/api/v1/desktop/recommendation-v5/shadow-runs'
        )
        expect(shadow).toContain('persistCandidates: false')
        expect(service).toContain('{ persist: false }')
    })

    it('adds deterministic candidate hygiene before any relevance ranking', () => {
        const hygiene = read(
            'src/recommendation-v5/candidate-hygiene.ts'
        )
        const service = read('src/library/service.ts')
        const ranker = read(
            'src/recommendation-v3/ranker-adapter-v3.ts'
        )
        const coordinator = read(
            'src/recommendation-v3/cycle-coordinator-v3.ts'
        )
        expect(hygiene).toContain(
            "CANDIDATE_HYGIENE_V5_VERSION ="
        )
        expect(hygiene).toContain("mode: 'SHADOW'")
        expect(hygiene).toContain('servingImpact: false')
        expect(hygiene).toContain(
            'tasteNegativeHardFiltered: false'
        )
        expect(hygiene).toContain("'OWNED_WORK'")
        expect(hygiene).toContain("'ALREADY_SEEN'")
        expect(hygiene).toContain("'BLOCK_CONTROL'")
        expect(service).toContain('applyCandidateHygieneV5')
        expect(service).toContain('hygieneTelemetry')
        expect(ranker).not.toContain('candidate-hygiene')
        expect(coordinator).not.toContain('candidate-hygiene')
    })

    it('adds an explainable relevance ranker without enabling serving or Visual', () => {
        const ranker = read(
            'src/recommendation-v5/relevance-ranker.ts'
        )
        const service = read('src/library/service.ts')
        const v3Ranker = read(
            'src/recommendation-v3/ranker-adapter-v3.ts'
        )
        const coordinator = read(
            'src/recommendation-v3/cycle-coordinator-v3.ts'
        )
        expect(ranker).toContain(
            "RELEVANCE_RANKER_V5_VERSION ="
        )
        expect(ranker).toContain("mode: 'SHADOW'")
        expect(ranker).toContain('servingImpact: false')
        expect(ranker).toContain('learningToRank: false')
        expect(ranker).toContain('visualFeatureEnabled: false')
        expect(ranker).toContain(
            "scoreSemantics: 'EXPLAINABLE_LINEAR_BASELINE'"
        )
        expect(ranker).toContain('exactItemEvidence')
        expect(ranker).toContain('sessionAffinity')
        expect(ranker).toContain('explicitAdjustment')
        expect(service).toContain('rankShadowCandidatesV5')
        expect(service).toContain('rankingTelemetry')
        expect(v3Ranker).not.toContain('relevance-ranker')
        expect(coordinator).not.toContain('relevance-ranker')
    })

    it('adds deterministic diversity after relevance ranking without enabling style diversity', () => {
        const diversity = read(
            'src/recommendation-v5/batch-diversity.ts'
        )
        const service = read('src/library/service.ts')
        const coordinator = read(
            'src/recommendation-v3/cycle-coordinator-v3.ts'
        )
        expect(diversity).toContain(
            "BATCH_DIVERSITY_V5_VERSION ="
        )
        expect(diversity).toContain(
            "method: 'GREEDY_SATURATION'"
        )
        expect(diversity).toContain("mode: 'SHADOW'")
        expect(diversity).toContain('servingImpact: false')
        expect(diversity).toContain(
            'visualStyleDiversityEnabled: false'
        )
        expect(diversity).toContain('AUTHOR_SATURATION')
        expect(diversity).toContain('FANDOM_SATURATION')
        expect(diversity).toContain('TAG_SATURATION')
        expect(diversity).toContain('PROVIDER_BALANCE')
        expect(service).toContain('diversifyShadowBatchV5')
        expect(service).toContain('diversityTelemetry')
        expect(service).toContain('diversifiedBatch')
        expect(coordinator).not.toContain('batch-diversity')
    })

    it('versions session modes as retrieval policy instead of separate rankers', () => {
        const channels = read(
            'src/recommendation-v5/candidate-channels.ts'
        )
        const ranker = read(
            'src/recommendation-v5/relevance-ranker.ts'
        )
        const web = read('web/recommendation-v5-beta.js')
        const android = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationControlActivity.java'
        )
        expect(channels).toContain(
            "SESSION_MODE_POLICY_V5_VERSION ="
        )
        expect(channels).toContain('FAMILIAR')
        expect(channels).toContain('RECENT')
        expect(channels).toContain('EXPLORE')
        expect(channels).toContain('TARGET')
        expect(channels).toContain('sessionModePolicy')
        expect(ranker).not.toContain('sessionIntent.mode')
        expect(ranker).not.toContain('SESSION_MODE_POLICY_V5')
        expect(web).not.toContain(
            'data-v5-session-mode="FAMILIAR"'
        )
        expect(android).not.toContain('按平时口味')
    })

    it('adds a read-only P3 promotion gate that cannot activate serving', () => {
        const gate = read(
            'src/recommendation-v5/promotion-gate.ts'
        )
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        expect(gate).toContain(
            "P3_PROMOTION_GATE_V5_VERSION ="
        )
        expect(gate).toContain(
            "'READY_FOR_MANUAL_REVIEW'"
        )
        expect(gate).toContain("'NOT_READY'")
        expect(gate).toContain('autoPromotion: false')
        expect(gate).toContain(
            'servingMutationEnabled: false'
        )
        expect(service).toContain(
            'recommendationV5P3PromotionGate'
        )
        expect(service).toContain(
            'shadowPipelineModelVersionV5()'
        )
        expect(server).toContain(
            '/api/v1/desktop/recommendation-v5/promotion-gate'
        )
        expect(server).not.toContain(
            '/api/v1/desktop/recommendation-v5/promote'
        )
        expect(server).not.toContain(
            '/api/v1/desktop/recommendation-v5/activate'
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

    it('adds read-only Visual V1 representation QC before any P4 activation', () => {
        const qc = read(
            'src/recommendation-v5/visual-representation-qc.ts'
        )
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        expect(qc).toContain(
            "VISUAL_REPRESENTATION_QC_V5_VERSION ="
        )
        expect(qc).toContain("mode: 'READ_ONLY'")
        expect(qc).toContain('rebuildPerformed: false')
        expect(qc).toContain('servingImpact: false')
        expect(qc).toContain('authorSeparation')
        expect(qc).toContain('sameFandomDifferentAuthor')
        expect(qc).toContain('providerEffectProxy')
        expect(qc).toContain('sourceKindEffectProxy')
        expect(qc).toContain('pageCountSensitivityProxy')
        expect(qc).toContain('top5HitRate')
        expect(service).toContain('visualRepresentationQc')
        expect(server).toContain(
            '/api/v1/visual/representation-qc'
        )
        expect(service).not.toContain(
            'buildVisualRepresentationQcV5({\n            embeddings: []'
        )
    })

    it('builds a read-only multi-prototype author atlas before style-family activation', () => {
        const visualCore = read(
            'src/recommendation-v4/visual-style.ts'
        )
        const atlas = read(
            'src/recommendation-v5/visual-author-atlas.ts'
        )
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        expect(visualCore).toContain(
            'export function buildVisualPrototypes'
        )
        expect(visualCore).toContain(
            'export function selectPreferredVisualEmbeddings'
        )
        expect(atlas).toContain(
            "VISUAL_AUTHOR_ATLAS_V5_VERSION ="
        )
        expect(atlas).toContain("mode: 'READ_ONLY'")
        expect(atlas).toContain('rebuildPerformed: false')
        expect(atlas).toContain('servingImpact: false')
        expect(atlas).toContain('visualRecallEnabled: false')
        expect(atlas).toContain(
            'styleFamilyServingEnabled: false'
        )
        expect(atlas).toContain('prototypeCount')
        expect(atlas).toContain('substyleSpread')
        expect(service).toContain('visualAuthorAtlas')
        expect(server).toContain('/api/v1/visual/author-atlas')
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
