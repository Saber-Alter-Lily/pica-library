import {
    CANDIDATE_CHANNEL_PLANNER_VERSION,
    SESSION_MODE_POLICY_V5_VERSION
} from './candidate-channels'
import { PROVIDER_QUERY_COMPILER_V5_VERSION } from './provider-query-compiler'
import { SHADOW_RETRIEVAL_V5_VERSION } from './shadow-retrieval'
import { CANDIDATE_HYGIENE_V5_VERSION } from './candidate-hygiene'
import { RELEVANCE_RANKER_V5_VERSION } from './relevance-ranker'
import { BATCH_DIVERSITY_V5_VERSION } from './batch-diversity'

export const SHADOW_PIPELINE_CONTRACT_V5_VERSION =
    'shadow-pipeline-contract-v1'

export function shadowPipelineModelVersionV5() {
    return [
        'v5-shadow',
        CANDIDATE_CHANNEL_PLANNER_VERSION,
        SESSION_MODE_POLICY_V5_VERSION,
        PROVIDER_QUERY_COMPILER_V5_VERSION,
        SHADOW_RETRIEVAL_V5_VERSION,
        CANDIDATE_HYGIENE_V5_VERSION,
        RELEVANCE_RANKER_V5_VERSION,
        BATCH_DIVERSITY_V5_VERSION
    ].join('/')
}

export function shadowPipelineVersionsV5() {
    return {
        contractVersion: SHADOW_PIPELINE_CONTRACT_V5_VERSION,
        plannerVersion: CANDIDATE_CHANNEL_PLANNER_VERSION,
        sessionModePolicyVersion: SESSION_MODE_POLICY_V5_VERSION,
        compilerVersion: PROVIDER_QUERY_COMPILER_V5_VERSION,
        retrievalVersion: SHADOW_RETRIEVAL_V5_VERSION,
        hygieneVersion: CANDIDATE_HYGIENE_V5_VERSION,
        rankerVersion: RELEVANCE_RANKER_V5_VERSION,
        allocatorVersion: BATCH_DIVERSITY_V5_VERSION,
        modelVersion: shadowPipelineModelVersionV5()
    }
}
