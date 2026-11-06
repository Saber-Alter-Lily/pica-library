import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import original from '../fixtures/recommendation-pending-original.json'

const source = fs.readFileSync('web/app.js', 'utf8'), tree = ts.createSourceFile('app.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
function actualHandler(name: string) {
    const stmt = tree.statements.find(statement => ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression) && statement.expression.left.getText(tree) === `$('#${name}').onclick`)
    if (!stmt || !ts.isExpressionStatement(stmt) || !ts.isBinaryExpression(stmt.expression)) throw Error('Missing actual app handler')
    return stmt.expression.right.getText(tree)
}
const helper = tree.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'setRecommendationPending')?.getText(tree)
function scene(old: boolean) {
    let resolveResume!: (value: { activeCycleId: string }) => void
    const held = new Promise<{ activeCycleId: string }>(resolve => { resolveResume = resolve })
    const elements = new Map(['#recommend-button', '#recommend-next-batch', '#recommend-restart', '#recommend-message'].map(key => [key, { disabled: false, textContent: '' }]))
    const requests: string[] = [], state = { mode: 'connected', recommendationManagedV3: true, recommendationPending: false, appSessionId: 'synthetic', recommendations: [{}] }
    const context = vm.createContext({ state, $: (id: string) => elements.get(id), post: async (_path: string, input: { action: string }) => { requests.push(input.action); return input.action === 'resume_or_create' ? await held : { exhausted: false } }, recommendationRequestId: () => 'synthetic-request', applyManagedRecommendationBatch: () => {}, renderPreparedRecommendations: () => {}, t: (key: string) => key, localizeError: () => 'synthetic-error', language: 'en', requestRecommendationStatusWatch: () => {}, waitForFinalCycle: async () => {} })
    // Only these inspected pure handlers execute against fake ports. No DOM/browser/app/network process.
    if (!old) vm.runInContext(helper!, context, { timeout: 1000 })
    const current = vm.runInContext('(' + (old ? original.handlers['recommend-button'].code : actualHandler('recommend-button')) + ')', context) as () => Promise<void>
    const next = vm.runInContext('(' + (old ? original.handlers['recommend-next-batch'].code : actualHandler('recommend-next-batch')) + ')', context) as () => Promise<void>
    return { elements, requests, state, current, next, release: () => resolveResume({ activeCycleId: 'synthetic-cycle' }) }
}

describe('actual managed-recommendation UI busy ownership — pure injected event-state reproduction', () => {
    it('reproduces the frozen old enabled-next/lost-click counterexample rather than hiding the CI timeout', async () => {
        expect(original.sourceSha).toBe('15c56be9e7382349cc3455993d6b81ef2f4f494f')
        for (const row of Object.values(original.handlers)) expect(createHash('sha256').update(row.code).digest('hex')).toBe(row.sha256)
        const old = scene(true), pending = old.current()
        expect(old.state.recommendationPending).toBe(true)
        expect(old.elements.get('#recommend-button')?.disabled).toBe(true)
        expect(old.elements.get('#recommend-next-batch')?.disabled).toBe(false)
        await old.next()
        expect(old.requests).toEqual(['resume_or_create'])
        old.release(); await pending
        expect(old.requests).toEqual(['resume_or_create', 'current'])
    })
    it('locks all related controls until the real current handler completes, then permits the actual next request', async () => {
        expect(helper).toBeTruthy()
        const app = scene(false), pending = app.current()
        for (const id of ['#recommend-button', '#recommend-next-batch', '#recommend-restart']) expect(app.elements.get(id)?.disabled).toBe(true)
        await app.next(); expect(app.requests).toEqual(['resume_or_create'])
        app.release(); await pending
        for (const id of ['#recommend-button', '#recommend-next-batch', '#recommend-restart']) expect(app.elements.get(id)?.disabled).toBe(false)
        await app.next(); expect(app.requests).toEqual(['resume_or_create', 'current', 'next'])
        expect(app.state.recommendationPending).toBe(false)
    })
})
