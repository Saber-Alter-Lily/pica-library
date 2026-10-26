import fs from 'node:fs'
import vm from 'node:vm'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
import { RUNTIME_CHOICE_ROUTES, runtimeChoiceAuthority, runtimeChoiceCommand } from '../../src/update/runtime-choice-http'
import { UpdateDownloadTask } from '../../src/update/download-task'
import { SourceDisabledError } from '../../src/sources/source-policy'

const source = fs.readFileSync('src/library/server.ts', 'utf8'), ast = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true)
const helpers = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && ['body', 'json'].includes(node.name?.text ?? ''))
const callbacks: ts.ArrowFunction[] = []
function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'http.createServer' && node.arguments.length === 1 && ts.isArrowFunction(node.arguments[0])) callbacks.push(node.arguments[0])
    ts.forEachChild(node, visit)
}
visit(ast); expect(helpers).toHaveLength(2); expect(callbacks).toHaveLength(1)
// Execute the actual callback and helpers, not startLibraryServer or any listener/setup.
const code = ts.transpileModule(helpers.map(node => node.getText(ast)).join('\n') + '\nconst handler=' + callbacks[0].getText(ast) + ';handler;', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
class Reply extends EventEmitter {
    statusCode = 0; writableEnded = false; destroyed = false; text = ''; headers: Record<string, unknown> = {}
    setHeader(name: string, value: string) { this.headers[name] = value; return this }
    writeHead(status: number, headers: Record<string, unknown>) { this.statusCode = status; Object.assign(this.headers, headers); return this }
    end(value: string) { this.text = value; this.writableEnded = true; this.emit('finish') }
    json() { return JSON.parse(this.text) }
}
function fixture(download = vi.fn(async (_url: string, _limit: number, _progress: unknown, _signal: AbortSignal) => Buffer.from('synthetic download'))) {
    const plan = vi.fn(async (_choice: unknown, _signal?: AbortSignal) => ({ status: 'preview', id: 'a'.repeat(8) + '-aaaa-aaaa-aaaa-' + 'a'.repeat(12) }))
    const prepare = vi.fn(async (_id: string, get: (url: string) => Promise<Buffer>, _signal?: AbortSignal) => ({ id: 'synthetic-staged', bytes: (await get('synthetic-archive')).length }))
    const downloads = new UpdateDownloadTask(download)
    const options = { service: { runtimeActiveTaskTypes: () => [] }, desktop: { csrfToken: 'synthetic-csrf', planRuntimeChoice: plan, prepareRuntimeChoice: prepare } }
    // JSON and Error must share the product's realm: a VM-intrinsic SyntaxError
    // would fail instanceof Error and accidentally conceal parser excerpts.
    const handler = vm.runInNewContext(code, { options, host: '127.0.0.1', port: 4789, URL, Buffer, Error, JSON, AbortController, setTimeout, clearTimeout, RUNTIME_CHOICE_ROUTES, runtimeChoiceAuthority, runtimeChoiceCommand, updateDownloads: downloads, SourceDisabledError, httpLatency: { start: () => () => {} } }) as (request: unknown, response: Reply) => Promise<void>
    function call(input: { action?: string; body?: unknown; stream?: Readable; headers?: Record<string, string | undefined>; search?: string; method?: string } = {}) {
        const request = Object.assign(input.stream ?? Readable.from([Buffer.from(JSON.stringify(input.body ?? { choice: 'jm' }))]), {
            url: '/api/v1/update/runtime-choice/' + (input.action ?? 'plan') + (input.search ?? ''), method: input.method ?? 'POST',
            headers: { host: '127.0.0.1:4789', origin: 'http://127.0.0.1:4789', 'content-type': 'application/json', 'x-pica-csrf': 'synthetic-csrf', ...input.headers }, socket: { remoteAddress: '127.0.0.1' }
        })
        const response = new Reply(), completed = handler(request, response)
        return { request, response, completed }
    }
    return { call, plan, prepare, downloads, download }
}
describe('actual runtime-choice HTTP callback over virtual Node streams, never a listener', () => {
    it.each([
        { headers: { origin: 'https://untrusted.invalid' } }, { headers: { 'x-pica-csrf': 'wrong' } }, { method: 'GET' }, { search: '?bypass=1' }
    ])('rejects authority before body, preview or download: %j', async input => {
        const f = fixture(), command = f.call(input); await command.completed
        expect(command.response.statusCode).toBe(403); expect(f.plan).not.toHaveBeenCalled(); expect(f.download).not.toHaveBeenCalled()
    })
    it('preserves an oversized actual Node stream until a bounded error reply can finish', async () => {
        const f = fixture(), stream = new Readable({ read() {} }); stream.push(Buffer.alloc(4097, ' ')); stream.push(Buffer.from('unconsumed-synthetic-tail'))
        try {
            const command = f.call({ stream }); await command.completed
            expect(command.response.statusCode).toBe(400)
            expect(stream.destroyed).toBe(false)
            expect(command.response.headers.connection).toBe('close')
            expect(command.response.text).not.toContain('unconsumed-synthetic-tail'); expect(f.plan).not.toHaveBeenCalled(); expect(f.download).not.toHaveBeenCalled()
        } finally { stream.destroy() }
    })
    it('returns a strict command error without echoing malformed body fragments', async () => {
        const f = fixture(), command = f.call({ body: { choice: 'jm', secret: 'synthetic-private-fragment' } }); await command.completed
        expect(command.response.statusCode).toBe(400); expect(command.response.text).not.toContain('synthetic-private-fragment'); expect(f.plan).not.toHaveBeenCalled()
    })
    it('does not reflect Node JSON-parser input excerpts from malformed raw JSON', async () => {
        const f = fixture(), stream = Readable.from([Buffer.from('SENSITIVE: not JSON')])
        const command = f.call({ stream }); await command.completed
        expect(command.response.statusCode).toBe(400)
        expect(command.response.text).not.toContain('SENSITIVE')
        expect(f.plan).not.toHaveBeenCalled(); expect(f.download).not.toHaveBeenCalled()
    })
    it('passes a request-owned signal into the real plan callback and removes its disconnect listener on finish', async () => {
        const f = fixture(), command = f.call(); await command.completed
        expect(command.response.statusCode).toBe(200); expect(f.plan).toHaveBeenCalledWith('jm', expect.any(AbortSignal))
        expect(command.response.listenerCount('close')).toBe(1) // Only ordinary latency observation remains.
    })
    it('propagates actual response disconnect into the shared download task and releases its slot', async () => {
        let reached!: () => void
        const started = new Promise<void>(resolve => { reached = resolve })
        const download = vi.fn(async (_url: string, _limit: number, _progress: unknown, signal: AbortSignal) => {
            if (download.mock.calls.length > 1) return Buffer.from('synthetic retry')
            reached(); return new Promise<Buffer>((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('synthetic cancelled'), { name: 'AbortError' })), { once: true }))
        })
        const f = fixture(download), id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', command = f.call({ action: 'prepare', body: { id } })
        await started; command.response.emit('close'); await command.completed
        expect(command.response.statusCode).toBe(409); expect(f.downloads.progress()?.phase).toBe('cancelled')
        const next = f.call({ action: 'prepare', body: { id } }); await next.completed
        expect(next.response.statusCode).toBe(200); expect(download).toHaveBeenCalledTimes(2)
    })
})
