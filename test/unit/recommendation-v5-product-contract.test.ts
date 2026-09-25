import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Recommendation V5 portable product contract', () => {
    it('keeps Desktop heavy compute portable without replacing Android runtime cycles', () => {
        const bridge = read('src/mobile/bridge-server.ts')
        const service = read('src/library/service.ts')
        const client = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/BridgeClient.java')
        const engine = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java')
        expect(bridge).toContain('/mobile/v1/recommendation/v5/sync-preview')
        expect(bridge).toContain('/mobile/v1/recommendation/v5/portable-package')
        expect(service).toContain('recommendationPortablePackageV5')
        expect(service).toContain('visualGeneration')
        expect(service).toContain('canonicalGeneration')
        expect(service).toContain('reservoirGeneration')
        expect(client).toContain('recommendationPortablePackage')
        expect(client).toContain('syncRecommendationState')
        expect(client).not.toContain('DESKTOP_SYNCED_V5_PORTABLE')
        expect(engine).toContain('PORTABLE_RESERVOIR')
        expect(engine).toContain('RecommendationEvidenceStore.sessionAdjustment')
        expect(engine).toContain('portable.visualAdjustment')
        expect(engine).toContain('MobileVisualPolicyStore.live(app)')
    })

    it('exposes user-steerable persistent and session policy on Desktop and Android', () => {
        const server = read('src/library/server.ts')
        const index = read('web/index.html')
        const web = read('web/recommendation-v5.js')
        const activity = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationControlActivity.java')
        const store = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationPolicyStore.java')
        expect(server).toContain('/api/v1/recommendation-v5/control')
        expect(server).toContain('/api/v1/recommendation-v5/session')
        expect(index).toContain('recommendation-v5.js')
        expect(web).toContain('你的推荐画像')
        expect(web).toContain('完整画像与微调 · 0–10 档')
        expect(web).toContain('0 = 强烈减少，5 = 中性，10 = 非常喜欢')
        expect(web).toContain('系统未判断 · 5/10 为中性起点')
        expect(web).toContain('恢复系统判断')
        expect(activity).toContain('本次想看')
        expect(activity).toContain('仅本机')
        expect(store).toContain('LOCAL_SESSION')
        expect(store).toContain('syncSchemaVersion')
        expect(store).not.toContain('body.put("sessionIntent"')
    })

    it('renders classified 10-step Desktop controls and explicit feedback acknowledgement', () => {
        const web = read('web/recommendation-v5.js')
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
        const web = read('web/recommendation-v5.js')
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
        const web = read('web/recommendation-v5.js')
        const portable = read('src/recommendation-v5/portable-policy.ts')
        expect(server).toContain(
            '/api/v1/recommendation-v5/taste-exclusion'
        )
        expect(service).toContain('tasteExcludedIds')
        expect(service).toContain('tasteExcluded.has(comicId)')
        expect(service).toContain('.favoriteIds()')
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
        const web = read('web/work-identity-review.js')
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
        const web = read('web/work-identity-review.js')
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
        const web = read('web/recommendation-v5.js')
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

    it('uses the same portable policy to re-rank the independent Android runtime offline', () => {
        const home = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java')
        const store = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationPolicyStore.java')
        const cache = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationStore.java')
        const engine = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java')
        expect(home).toContain('RecommendationPolicyStore.applyLocalPolicy')
        expect(home).toContain('手机独立排序')
        expect(home).toContain('Android 本机')
        expect(home).not.toContain('DESKTOP_SYNCED')
        expect(store).toContain('applyLocalPolicy')
        expect(store).toContain('adjustment(current,item)-adjustment(baseline,item)')
        expect(store).toContain('moveVisibleBatch')
        expect(cache).toContain('final List<String> tags,categories')
        expect(engine).toContain('PORTABLE_RESERVOIR')
        expect(engine).toContain('RecommendationEvidenceStore.sessionAdjustment')
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

    it('derives provisional style families from author prototypes without enabling Visual serving', () => {
        const families = read(
            'src/recommendation-v5/visual-style-families.ts'
        )
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        expect(families).toContain(
            "VISUAL_STYLE_FAMILY_V5_VERSION ="
        )
        expect(families).toContain(
            "method: 'MUTUAL_KNN_CONNECTED_COMPONENTS'"
        )
        expect(families).toContain('provisional: true')
        expect(families).toContain('servingImpact: false')
        expect(families).toContain('visualRecallEnabled: false')
        expect(families).toContain('styleDiversityEnabled: false')
        expect(families).toContain('multiFamilyAuthorCount')
        expect(service).toContain('visualStyleFamilies')
        expect(server).toContain(
            '/api/v1/visual/style-families'
        )
    })

    it('audits Visual coverage for shadow candidates without persisting or generating embeddings', () => {
        const coverage = read(
            'src/recommendation-v5/visual-candidate-coverage.ts'
        )
        const service = read('src/library/service.ts')
        expect(coverage).toContain(
            "VISUAL_CANDIDATE_COVERAGE_V5_VERSION ="
        )
        expect(coverage).toContain("mode: 'PLAN_ONLY'")
        expect(coverage).toContain('servingImpact: false')
        expect(coverage).toContain(
            'embeddingGenerationEnabled: false'
        )
        expect(coverage).toContain(
            'candidatePersistenceEnabled: false'
        )
        expect(coverage).toContain(
            "'SHADOW_CANDIDATE_NOT_PERSISTED'"
        )
        expect(coverage).toContain("'DIVERSIFIED_BATCH'")
        expect(service).toContain(
            'buildVisualCandidateCoverageV5'
        )
        expect(service).toContain('visualCandidateCoverage')
        expect(service).toContain('visualCoverage')
        expect(service).not.toContain(
            'visualCoverage.selectedForAnalysis.forEach'
        )
    })

    it('adds a read-only Visual activation gate that can only authorize shadow review', () => {
        const gate = read(
            'src/recommendation-v5/visual-activation-gate.ts'
        )
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        expect(gate).toContain(
            "VISUAL_ACTIVATION_GATE_V5_VERSION ="
        )
        expect(gate).toContain(
            "'READY_FOR_SHADOW_REVIEW'"
        )
        expect(gate).toContain("'NOT_READY'")
        expect(gate).toContain('autoActivation: false')
        expect(gate).toContain('servingMutationEnabled: false')
        expect(gate).toContain('embeddingGenerationEnabled: false')
        expect(gate).toContain(
            'visualRecallActivationEnabled: false'
        )
        expect(gate).toContain(
            'styleDiversityActivationEnabled: false'
        )
        expect(service).toContain(
            'recommendationV5VisualActivationGate'
        )
        expect(server).toContain(
            '/api/v1/desktop/recommendation-v5/visual-activation-gate'
        )
        expect(server).not.toContain(
            '/api/v1/desktop/recommendation-v5/visual-activate'
        )
        expect(server).not.toContain(
            '/api/v1/desktop/recommendation-v5/visual-promote'
        )
    })

    it('adds a fixed read-only evaluation framework before any advanced learning decision', () => {
        const metrics = read(
            'src/recommendation-v5/evaluation-metrics.ts'
        )
        const correctness = read(
            'src/recommendation-v5/correctness-audit.ts'
        )
        const retrospective = read(
            'src/recommendation-v5/retrospective-benchmark.ts'
        )
        const steerability = read(
            'src/recommendation-v5/steerability-audit.ts'
        )
        const framework = read(
            'src/recommendation-v5/evaluation-framework.ts'
        )
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        expect(metrics).toContain('precision12')
        expect(metrics).toContain('recall12')
        expect(metrics).toContain('ndcg12')
        expect(metrics).toContain('hit12')
        expect(correctness).toContain(
            'CORRECTNESS_AUDIT_V5_VERSION'
        )
        expect(retrospective).toContain(
            'FUTURE_LIKE_FAVORITE_OR_READER_COMPLETE'
        )
        expect(retrospective).toContain(
            'NOT_YET_IDENTIFIABLE_WITH_CURRENT_LOGS'
        )
        expect(steerability).toContain(
            'STEERABILITY_AUDIT_V5_VERSION'
        )
        expect(steerability).toContain('blockLeakage')
        expect(framework).toContain(
            'BASELINE_EVALUATION_READY'
        )
        expect(framework).toContain('BASELINE_BUILDING')
        expect(framework).toContain('autoPromotion: false')
        expect(framework).toContain(
            'modelEscalationEnabled: false'
        )
        expect(framework).toContain('learningToRank: false')
        expect(framework).toContain(
            'contextualBandit: false'
        )
        expect(service).toContain(
            'recommendationV5EvaluationSummary'
        )
        expect(server).toContain(
            '/api/v1/desktop/recommendation-v5/evaluation/summary'
        )
        expect(server).not.toContain(
            '/api/v1/desktop/recommendation-v5/evaluation/promote'
        )
    })

    it('adds a manual V5 evaluation dashboard without auto-running providers', () => {
        const dashboard = read(
            'web/recommendation-v5-evaluation.js'
        )
        const beta = read('web/recommendation-v5.js')
        const server = read('src/library/server.ts')
        expect(dashboard).toContain(
            '推荐系统评估 · V5 Development'
        )
        expect(dashboard).toContain(
            '/api/v1/desktop/recommendation-v5/evaluation/summary'
        )
        expect(dashboard).toContain(
            '/api/v1/desktop/recommendation-v5/shadow-runs'
        )
        expect(dashboard).toContain(
            '/api/v1/desktop/recommendation-v5/shadow-retrieval'
        )
        expect(dashboard).toContain(
            'RUN_RECOMMENDATION_V5_SHADOW_RETRIEVAL'
        )
        expect(dashboard).toContain("'x-pica-csrf'")
        expect(dashboard).toContain('Advanced Learning')
        expect(dashboard).toContain('evalInstall()')
        expect(dashboard).toContain(
            "panel.querySelector('#v5-eval-run-shadow').onclick"
        )
        expect(beta).toContain(
            "import('./recommendation-v5-evaluation.js')"
        )
        expect(server).not.toContain(
            '/api/v1/desktop/recommendation-v5/evaluation/promote'
        )
    })

    it('adds explicit version-to-version benchmark comparison without selecting a winner', () => {
        const comparison = read(
            'src/recommendation-v5/benchmark-comparison.ts'
        )
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const dashboard = read(
            'web/recommendation-v5-evaluation.js'
        )
        expect(comparison).toContain(
            "BENCHMARK_COMPARISON_V5_VERSION ="
        )
        expect(comparison).toContain("'COMPARISON_READY'")
        expect(comparison).toContain("'INSUFFICIENT_SUPPORT'")
        expect(comparison).toContain('winner: null')
        expect(comparison).toContain(
            'automaticWinnerSelection: false'
        )
        expect(comparison).toContain(
            'modelEscalationEnabled: false'
        )
        expect(service).toContain(
            'recommendationV5BenchmarkVersions'
        )
        expect(service).toContain(
            'recommendationV5BenchmarkComparison'
        )
        expect(server).toContain(
            '/api/v1/desktop/recommendation-v5/evaluation/versions'
        )
        expect(server).toContain(
            '/api/v1/desktop/recommendation-v5/evaluation/compare'
        )
        expect(dashboard).toContain(
            'Model Version Comparison'
        )
        expect(dashboard).toContain('winner = null')
        expect(server).not.toContain(
            '/api/v1/desktop/recommendation-v5/evaluation/select-winner'
        )
    })

    it('adds an advanced learning decision gate without enabling training or serving mutation', () => {
        const gate = read(
            'src/recommendation-v5/advanced-learning-gate.ts'
        )
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const dashboard = read(
            'web/recommendation-v5-evaluation.js'
        )
        expect(gate).toContain(
            "ADVANCED_LEARNING_GATE_V5_VERSION ="
        )
        expect(gate).toContain(
            "'READY_FOR_EXPERIMENT_DESIGN'"
        )
        expect(gate).toContain(
            "'DEFERRED_MISSING_ONLINE_EXPERIMENT_LOGGING'"
        )
        expect(gate).toContain(
            "'DEFERRED_MISSING_UNCERTAINTY_LOGGING'"
        )
        expect(gate).toContain('trainingEnabled: false')
        expect(gate).toContain(
            'servingMutationEnabled: false'
        )
        expect(gate).toContain(
            'autoExperimentCreation: false'
        )
        expect(gate).toContain('autoModelSelection: false')
        expect(service).toContain(
            'recommendationV5AdvancedLearningGate'
        )
        expect(server).toContain(
            '/api/v1/desktop/recommendation-v5/evaluation/advanced-learning-gate'
        )
        expect(dashboard).toContain(
            'Advanced Learning Decision Gate'
        )
        expect(server).not.toContain(
            '/api/v1/desktop/recommendation-v5/train'
        )
        expect(server).not.toContain(
            '/api/v1/desktop/recommendation-v5/model-activate'
        )
    })

    it('keeps Visual V1 versioned assets untouched by policy integration', () => {
        const visual = read('src/recommendation-v4/visual-style.ts')
        expect(visual).toContain("VISUAL_SAMPLING_POLICY_VERSION = 'v1-spread-6-body-pages'")
        expect(visual).toContain("VISUAL_MODEL_ID = 'onnx-community/dinov2-small'")
    })

    it('uses paired Desktop as a credential-free Pica relay while preserving local-account priority', () => {
        const server = read('src/mobile/bridge-server.ts')
        const client = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaClient.java'
        )
        const bridge = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/BridgeClient.java'
        )
        const browse = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaBrowseActivity.java'
        )
        expect(server).toContain('/mobile/v1/provider/pica/search')
        expect(server).toContain('/mobile/v1/provider/pica/favorite')
        expect(server).toContain("authority: 'desktop'")
        expect(server).toContain('relay: true')
        expect(server).not.toContain('pica_password')
        expect(client).toContain(
            'private boolean useDesktopRelay(){return !localConfigured()&&desktopRelayConfigured();}'
        )
        expect(client).toContain(
            'static boolean available(Context context)'
        )
        expect(client).toContain('BridgeClient.picaRelaySearch')
        expect(client).toContain('BridgeClient.picaRelayFavorite')
        expect(bridge).toContain('/mobile/v1/provider/pica/search')
        expect(bridge).toContain('/mobile/v1/provider/pica/favorite')
        expect(browse).toContain('PicaClient.available(this)')
    })

    it('reuses Desktop E-H and ExH account capabilities without cookie handoff', () => {
        const server = read('src/mobile/bridge-server.ts')
        const client = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/EhClient.java'
        )
        const bridge = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/BridgeClient.java'
        )
        const capability = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/EhCapabilityStore.java'
        )
        expect(server).toContain('/mobile/v1/provider/eh/search')
        expect(server).toContain('/mobile/v1/provider/eh/favorites-snapshot')
        expect(server).toContain('/mobile/v1/provider/eh/page-image')
        expect(server).toContain('/mobile/v1/provider/eh/favorite')
        expect(client).toContain(
            'private boolean useDesktopAccountRelay()'
        )
        expect(client).toContain(
            'static boolean accountAvailable(Context context)'
        )
        expect(client).toContain('BridgeClient.ehRelaySearch')
        expect(client).toContain('BridgeClient.ehRelayPages')
        expect(client).toContain('BridgeClient.ehRelayImage')
        expect(bridge).toContain('/mobile/v1/provider/eh/search')
        expect(bridge).toContain('/mobile/v1/provider/eh/favorites-snapshot')
        expect(bridge).toContain('/mobile/v1/provider/eh/page-image')
        expect(capability).toContain('EhClient.accountAvailable(app)')
        expect(server).not.toContain('ipb_pass_hash')
        expect(server).not.toContain('cf_clearance')
    })

    it('keeps post-pairing sync optional instead of overwriting Android runtime', () => {
        const pairing = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PairingActivity.java'
        )
        const sync = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationSyncActivity.java'
        )
        const prefs = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationSyncPreferences.java'
        )
        const saved = pairing.indexOf('BridgeStore.save(this,h,token,name)')
        const accountState = pairing.indexOf(
            'DesktopAccountStatusStore.save(this,BridgeClient.accountStatus(this))'
        )
        const success = pairing.indexOf('配对成功 · 内容同步均为可选')
        expect(saved).toBeGreaterThanOrEqual(0)
        expect(accountState).toBeGreaterThan(saved)
        expect(success).toBeGreaterThan(accountState)
        expect(pairing).toContain('RecommendationSyncActivity.offerAfterPairing(this)')
        expect(pairing).toContain('同步书架')
        expect(pairing).not.toContain('offerFavoriteImport')
        expect(pairing).not.toContain(
            'try{ShelfStore.syncWithDesktop(this);}catch'
        )
        expect(pairing).not.toContain(
            'BridgeClient.syncRecommendationState(this,false)'
        )
        expect(sync).toContain('电脑和手机各自拥有独立推荐周期')
        expect(sync).toContain('同步始终由你主动执行')
        expect(sync).toContain('全部用电脑')
        expect(sync).toContain('全部用手机')
        expect(prefs).toContain('getBoolean(ALERT_PORTABLE_CHANGES,false)')
    })

    it('makes work-identity review visual, detail-capable and undecided-first', () => {
        const web = read('web/work-identity-review.js')
        const app = read('web/app.js')
        expect(web).toContain('/api/v1/covers/')
        expect(web).toContain('data-v5-id-detail')
        expect(web).toContain('data-v5-id-read-online')
        expect(web).toContain(
            'Number(Boolean(a.decision)) - Number(Boolean(b.decision))'
        )
        expect(web).toContain("'pica-open-reader'")
        expect(app).toContain("'pica-open-reader'")
    })

    it('makes Visual QC detail reading independent of the current page DOM', () => {
        const qc = read('web/visual-qc.js')
        expect(qc).toContain("'pica-open-reader'")
        expect(qc).not.toContain(
            '当前页面没有可直接复用的在线阅读入口'
        )
        expect(qc).not.toContain(
            'current page has no reusable online reader'
        )
    })

    it('queues mobile evidence and clears it only after explicit sync acknowledgement', () => {
        const feedback = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationFeedbackStore.java')
        const evidence = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationEvidenceStore.java')
        const bridge = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/BridgeClient.java')
        const sync = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationSyncActivity.java')
        const store = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationPolicyStore.java')
        expect(feedback).toContain('dirtyPayload')
        expect(evidence).toContain('dirtyPayload')
        expect(bridge).toContain('syncRecommendationState')
        expect(sync).toContain('BridgeClient.syncRecommendationState')
        expect(store).toContain('电脑未确认本次推荐同步')
        expect(store).toContain('RecommendationEvidenceStore.clearDirty')
    })
})
