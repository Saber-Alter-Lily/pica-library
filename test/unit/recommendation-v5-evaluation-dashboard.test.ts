import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) =>
    fs.readFileSync(path.join(root, file), 'utf8')

describe('Recommendation V5 evaluation dashboard', () => {
    it('keeps evaluation lazy on page open and never auto-runs shadow retrieval', () => {
        const dashboard = read(
            'web/recommendation-v5-evaluation.js'
        )
        expect(dashboard).toContain('async function evalLoad(')
        expect(dashboard).toContain('async function evalRunShadow()')
        expect(dashboard).toContain(
            "panel.querySelector('#v5-eval-run-shadow').onclick"
        )
        const installBody =
            /function evalInstall\(\) \{([\s\S]*?)\n\}/.exec(
                dashboard
            )?.[1] ?? ''
        expect(installBody).not.toContain('evalLoad(')
        expect(installBody).not.toContain('evalRunShadow')
        expect(installBody).toContain('打开设置页不会自动执行重计算')
    })

    it('requires Desktop CSRF and explicit shadow confirmation for manual runs', () => {
        const dashboard = read(
            'web/recommendation-v5-evaluation.js'
        )
        expect(dashboard).toContain(
            "evalRequest('/api/v1/desktop/status')"
        )
        expect(dashboard).toContain("'x-pica-csrf'")
        expect(dashboard).toContain(
            "'RUN_RECOMMENDATION_V5_SHADOW_RETRIEVAL'"
        )
        expect(dashboard).toContain(
            '/api/v1/desktop/recommendation-v5/shadow-retrieval'
        )
    })

    it('surfaces the fixed P3/P4/P5 evidence instead of an opaque score', () => {
        const dashboard = read(
            'web/recommendation-v5-evaluation.js'
        )
        expect(dashboard).toContain('运行一次影子推荐')
        expect(dashboard).toContain('正式推荐未改变')
        expect(dashboard).toContain('P3 工程 Gate')
        expect(dashboard).toContain('P4 Visual Gate')
        expect(dashboard).toContain('Batch Precision@12')
        expect(dashboard).toContain('Batch Recall@12')
        expect(dashboard).toContain('Batch NDCG@12')
        expect(dashboard).toContain('安全检查')
        expect(dashboard).toContain('等待数据')
        expect(dashboard).toContain('高级评估详情')
        expect(dashboard).toContain('Catalog Coverage')
        expect(dashboard).toContain('Steerability')
        expect(dashboard).toContain('高级学习')
    })

    it('compares exact model versions only after explicit user action', () => {
        const dashboard = read(
            'web/recommendation-v5-evaluation.js'
        )
        expect(dashboard).toContain(
            '/api/v1/desktop/recommendation-v5/evaluation/versions'
        )
        expect(dashboard).toContain(
            '/api/v1/desktop/recommendation-v5/evaluation/compare'
        )
        expect(dashboard).toContain(
            "button.onclick = () => void evalCompareSelected()"
        )
        expect(dashboard).toContain('winner = null')
        const installBody =
            /function evalInstall\(\) \{([\s\S]*?)\n\}/.exec(
                dashboard
            )?.[1] ?? ''
        expect(installBody).not.toContain('evalCompareSelected')
    })


    it('evaluates advanced learning readiness without exposing training actions', () => {
        const dashboard = read(
            'web/recommendation-v5-evaluation.js'
        )
        expect(dashboard).toContain(
            'Advanced Learning Decision Gate'
        )
        expect(dashboard).toContain('LEARNING_TO_RANK')
        expect(dashboard).toContain('CONTEXTUAL_BANDIT')
        expect(dashboard).toContain('ACTIVE_LEARNING')
        expect(dashboard).toContain(
            '/api/v1/desktop/recommendation-v5/evaluation/advanced-learning-gate'
        )
        expect(dashboard).toContain(
            'trainingEnabled=false'
        )
        expect(dashboard).toContain(
            'servingMutationEnabled=false'
        )
        expect(dashboard).not.toContain('data-v5-train')
        expect(dashboard).not.toContain('/recommendation-v5/train')
    })

})
