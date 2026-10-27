import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Execute the actual small client function against inert ports, not an app/server.
const source = fs.readFileSync('web/app.js', 'utf8')
const tree = ts.createSourceFile('app.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const declaration = tree.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'recordRecommendationEvent')
if (!declaration) throw Error('Actual recommendation-event function missing')
function scene() {
    const requests: { route: string; event: Record<string, any> }[] = []
    const state = { mode: 'connected', appSessionId: 'synthetic-session', recommendationContextId: null, recommendationCycleId: null }
    const context = vm.createContext({ state, post: async (route: string, event: Record<string, any>) => { requests.push({ route, event }) } })
    vm.runInContext(declaration!.getText(tree), context, { timeout: 1000 })
    const record = vm.runInContext('recordRecommendationEvent', context) as (type: string, payload?: Record<string, unknown>) => void
    return { state, requests, record }
}
const batch = { recommendationCycleId: 'synthetic-cycle', recommendationBatchId: 'synthetic-batch', recommendationBatchIndex: 0, metadata: { itemIds: ['synthetic-comic'] }, dedupeKey: 'synthetic-cycle:synthetic-batch' }
describe('actual recommendation-event publication requires an actual batch', () => {
    it('does not submit the empty startup render as a presented batch', () => {
        const app = scene()
        app.record('recommend_batch_presented', { recommendationBatchIndex: 0, recommendationBatchId: null, metadata: { itemIds: [] } })
        expect(app.requests).toEqual([])
    })
    it('does not invent a batch context or submit an empty/invalid batch', () => {
        for (const payload of [{ ...batch, recommendationCycleId: null }, { ...batch, recommendationBatchId: null }, { ...batch, recommendationBatchIndex: -1 }, { ...batch, recommendationBatchIndex: 0.5 }, { ...batch, metadata: { itemIds: [] } }]) {
            const app = scene(); app.record('recommend_batch_presented', payload)
            expect(app.requests).toEqual([])
        }
    })
    it('preserves the exact valid batch and single-event contract', () => {
        const app = scene(); app.record('recommend_batch_presented', batch)
        expect(app.requests).toEqual([{ route: '/api/v1/recommendation-events', event: { eventType: 'recommend_batch_presented', appSessionId: 'synthetic-session', recommendationContextId: null, contextId: null, ...batch } }])
    })
    it('does not suppress ordinary search/feedback events or allow offline writes', () => {
        const app = scene(); app.record('search', { metadata: { query: 'synthetic' } }); app.record('recommend_like', { comicId: 'synthetic-comic' })
        expect(app.requests.map(row => row.event.eventType)).toEqual(['search', 'recommend_like'])
        app.state.mode = 'lite'; app.record('search')
        expect(app.requests).toHaveLength(2)
    })
})
