import fs from 'node:fs'
import vm from 'node:vm'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
import { SourceDisabledError, SourceRuntime, initialSourcePolicy } from '../../src/sources/source-policy'
import { JmProvider } from '../../src/providers/jm-provider'
import type { JmTransport } from '../../src/providers/jm-worker'

function routingSource() {
    const source = fs.readFileSync('src/library/server.ts', 'utf8')
    const ast = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true)
    const helpers = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && ['json', 'body'].includes(node.name?.text ?? ''))
    const callbacks: ts.ArrowFunction[] = []
    function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && node.expression.getText(ast) === 'http.createServer' && node.arguments.length === 1 && ts.isArrowFunction(node.arguments[0])) callbacks.push(node.arguments[0])
        ts.forEachChild(node, visit)
    }
    visit(ast)
    expect(helpers.map(node => node.name?.text).sort()).toEqual(['body', 'json'])
    expect(callbacks).toHaveLength(1)
    // Execute the unmodified callback/helpers, never startLibraryServer/listen or its setup.
    return ts.transpileModule(helpers.map(node => node.getText(ast)).join('\n') + '\nconst handler = ' + callbacks[0].getText(ast) + '; handler;', {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText
}
const code = routingSource()
const serviceAst = ts.createSourceFile('service.ts', fs.readFileSync('src/library/service.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const serviceClass = serviceAst.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'LibraryService') as ts.ClassDeclaration
const members = serviceClass.members.filter((node): node is ts.MethodDeclaration => ts.isMethodDeclaration(node) && ['jmAccountStatus', 'jmConnectAccount', 'jmRuntimeAvailable'].includes(node.name.getText(serviceAst)))
expect(members).toHaveLength(3)
const adapterCode = ts.transpileModule('const adapter = {' + members.map(node => node.getText(serviceAst)).join(',\n') + '}; adapter;', {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText

class Reply extends EventEmitter {
    statusCode = 0
    headers: Record<string, unknown> = {}
    writableEnded = false
    destroyed = false
    text = ''
    setHeader(name: string, value: string) { this.headers[name] = value; return this }
    writeHead(status: number, headers: Record<string, unknown>) { this.statusCode = status; this.headers = {...this.headers, ...headers}; return this }
    end(value: string) { this.text = value; this.writableEnded = true; this.emit('finish') }
    json() { return JSON.parse(this.text) }
}
interface Command {
    action?: string
    method?: string
    headers?: Record<string, string | undefined>
    input?: unknown
    rawChunks?: Buffer[]
    bodyStream?: Readable
}
function fixture(enabled = true) {
    const sources = new SourceRuntime(enabled ? {...initialSourcePolicy(), enabled: ['jm']} : initialSourcePolicy())
    const transport = {available: true, request: vi.fn(async () => ({configured: true, username: 'synthetic-user'})), close: vi.fn()}
    const provider = new JmProvider(transport as unknown as JmTransport)
    provider.setSourceAccess(sources.acquire)
    provider.setRememberedCredentials('synthetic-user', 'synthetic-password')
    const service = Object.assign(vm.runInNewContext(adapterCode, {}, {timeout: 1000}), {jmProvider: provider, runtimeActiveTaskTypes: () => []})
    const connect = vi.spyOn(service, 'jmConnectAccount')
    const passive = vi.spyOn(service, 'jmAccountStatus')
    const options = {service, desktop: {csrfToken: 'synthetic-csrf', configured: () => true, status: () => ({startupReady: true})}}
    const handler = vm.runInNewContext(code, {options, host: '127.0.0.1', port: 4789, URL, Buffer, Error, SourceDisabledError, httpLatency: {start: () => () => {}}}, {timeout: 1000}) as (request: unknown, response: Reply) => Promise<void>
    async function call(command: Command = {}) {
        const method = command.method ?? 'POST'
        const headers = {host: '127.0.0.1:4789', ...(method === 'POST' ? {'content-type': 'application/json', 'x-pica-csrf': 'synthetic-csrf', origin: 'http://127.0.0.1:4789'} : {}), ...command.headers}
        let readChunks = 0
        const chunks = command.rawChunks ?? [Buffer.from(JSON.stringify(command.input === undefined ? {} : command.input))]
        const iterate = async function* () { for (const chunk of chunks) {readChunks++; yield chunk} }
        const request = Object.assign(command.bodyStream ?? {
            [Symbol.asyncIterator]: iterate,
            iterator(options: {destroyOnReturn: boolean}) { expect(options).toEqual({destroyOnReturn: false}); return iterate() }
        }, {
            url: '/api/v1/desktop/sources/jm/' + (command.action ?? 'connect'), method, headers,
            socket: {remoteAddress: '127.0.0.1'}
        })
        const response = new Reply()
        await handler(request, response)
        return {response, readChunks}
    }
    return {sources, transport, provider, connect, passive, call}
}

describe('actual JM HTTP callback and service adapters over virtual streams only', () => {
    it('GET status stays passive with remembered credentials and a usable enabled transport', async () => {
        const f = fixture()
        for (let index = 0; index < 3; index++) {
            const {response, readChunks} = await f.call({method: 'GET', action: 'status'})
            expect(response.statusCode).toBe(200)
            expect(response.json()).toEqual({available: true, configured: false, enabled: true, remembered: true, verification: 'NOT_CHECKED'})
            expect(response.headers['cache-control']).toBe('no-store')
            expect(readChunks).toBe(0)
        }
        expect(f.passive).toHaveBeenCalledTimes(3)
        expect(f.connect).not.toHaveBeenCalled()
        expect(f.transport.request).not.toHaveBeenCalled()
    })
    it('an explicitly authorized empty JSON command follows the real service adapter and remembered-login path', async () => {
        const f = fixture(), before = f.sources.snapshot()
        const {response} = await f.call()
        expect(response.statusCode).toBe(200)
        expect(response.json().configured).toBe(true)
        expect(f.connect).toHaveBeenCalledTimes(1)
        expect(f.transport.request).toHaveBeenCalledWith('login', {username: 'synthetic-user', password: 'synthetic-password'})
        expect(f.sources.snapshot()).toEqual(before)
    })
    it.each([
        {'x-pica-csrf': undefined}, {'x-pica-csrf': ''}, {'x-pica-csrf': 'wrong'},
        {origin: 'https://unrelated.invalid'}, {host: 'unrelated.invalid:4789'}
    ])('denies unauthorized metadata before consuming a body: %j', async headers => {
        const f = fixture(), {response, readChunks} = await f.call({headers})
        expect(response.statusCode).toBe(403)
        expect(readChunks).toBe(0)
        expect(f.connect).not.toHaveBeenCalled()
        expect(f.transport.request).not.toHaveBeenCalled()
    })
    it.each([[], null, '', false, 0, {enabled: ['jm']}, {username: 'synthetic-user'}, {password: 'synthetic-private'}])('rejects disallowed body without source effects: %j', async input => {
        const f = fixture(), {response} = await f.call({input})
        expect(response.statusCode).toBe(400)
        expect(response.text).not.toContain('synthetic-private')
        expect(f.connect).not.toHaveBeenCalled()
        expect(f.transport.request).not.toHaveBeenCalled()
    })
    it.each(['GET', 'HEAD', 'OPTIONS'])('does not turn %s connect into a state-changing operation', async method => {
        const f = fixture(), {response} = await f.call({method})
        expect(response.statusCode).toBe(404)
        expect(f.connect).not.toHaveBeenCalled()
    })
    it('disabled sources return the actual disabled error without starting transport or changing choices', async () => {
        const f = fixture(false), {response} = await f.call()
        expect(response.statusCode).toBe(409)
        expect(response.json()).toMatchObject({code: 'SOURCE_DISABLED', sourceId: 'jm'})
        expect(f.sources.snapshot().enabled).toEqual([])
        expect(f.transport.request).not.toHaveBeenCalled()
    })
    it('malformed JSON is a bounded generic client error, not reflected parser text or a worker request', async () => {
        const f = fixture(), {response} = await f.call({rawChunks: [Buffer.from('{"password":"synthetic-private"')]})
        expect(response.statusCode).toBe(400)
        expect(response.text).not.toContain('synthetic-private')
        expect(f.connect).not.toHaveBeenCalled()
        expect(f.transport.request).not.toHaveBeenCalled()
    })
    it('rejects non-JSON media types before reading or connecting', async () => {
        const f = fixture(), {response, readChunks} = await f.call({headers: {'content-type': 'text/plain'}})
        expect(response.statusCode).toBe(400)
        expect(readChunks).toBe(0)
        expect(f.connect).not.toHaveBeenCalled()
    })
    it('stops consuming an oversize command at 4096 bytes without a connection', async () => {
        const f = fixture(), {response, readChunks} = await f.call({rawChunks: [Buffer.alloc(4097, ' '), Buffer.from('synthetic-private')]})
        expect(response.statusCode).toBe(400)
        expect(readChunks).toBe(1)
        expect(response.text).not.toContain('synthetic-private')
        expect(f.connect).not.toHaveBeenCalled()
    })
    it('oversize rejection preserves an actual in-memory Node stream until the error reply can finish', async () => {
        const f = fixture(), stream = new Readable({read() {}})
        stream.push(Buffer.alloc(4097, ' '))
        stream.push(Buffer.from('unconsumed-synthetic-tail'))
        try {
            const {response} = await f.call({bodyStream: stream})
            expect(response.statusCode).toBe(400)
            expect(stream.destroyed).toBe(false)
            expect(response.headers.connection).toBe('close')
            expect(f.connect).not.toHaveBeenCalled()
        } finally { stream.destroy() }
    })
    it('the body helper retains its previous default stream-destruction behavior outside this opt-in', async () => {
        const parse = vm.runInNewContext(code + '\nbody;', {Buffer, Error}, {timeout: 1000}) as (input: Readable, limit: number) => Promise<unknown>
        const stream = new Readable({read() {}})
        stream.push(Buffer.from('oversize'))
        try {
            await expect(parse(stream, 1)).rejects.toThrow('too large')
            expect(stream.destroyed).toBe(true)
        } finally { stream.destroy() }
    })
    it('a rejected body does not poison the next explicit valid command', async () => {
        const f = fixture()
        await f.call({rawChunks: [Buffer.from('{broken')]})
        const {response} = await f.call()
        expect(response.statusCode).toBe(200)
        expect(f.transport.request).toHaveBeenCalledTimes(1)
    })
    it('disabling while a synthetic reply is pending rejects the late identity through the actual route', async () => {
        const f = fixture()
        let resolve!: (identity: {configured: boolean; username: string}) => void
        f.transport.request.mockImplementation(() => new Promise(done => {resolve = done}))
        const pending = f.call()
        await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
        f.sources.apply(f.sources.prepare([], 0))
        resolve({configured: true, username: 'late-user'})
        const {response} = await pending
        expect(response.statusCode).toBe(409)
        expect(f.provider.accountSnapshot()).toMatchObject({configured: false, enabled: false})
        expect(f.transport.close).toHaveBeenCalled()
    })
})
