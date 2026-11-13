import fs from 'node:fs'
import vm from 'node:vm'
import { EventEmitter } from 'node:events'
import ts from 'typescript'

/** Reuses the JM virtual-route method. Never invokes server construction/setup/listen. */
export function actualDesktopCallback(context: Record<string, unknown>) {
    const source = fs.readFileSync('src/library/server.ts', 'utf8')
    const ast = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true)
    const helpers = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && ['json', 'body'].includes(node.name?.text ?? ''))
    const callbacks: ts.ArrowFunction[] = []
    function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && node.expression.getText(ast) === 'http.createServer' && node.arguments.length === 1 && ts.isArrowFunction(node.arguments[0])) callbacks.push(node.arguments[0])
        ts.forEachChild(node, visit)
    }
    visit(ast)
    if (helpers.map(node => node.name?.text).sort().join(',') !== 'body,json' || callbacks.length !== 1) throw new Error('Actual Desktop callback/helper identity changed')
    const code = ts.transpileModule(helpers.map(node => node.getText(ast)).join('\n') + '\nconst handler = ' + callbacks[0].getText(ast) + '; handler;', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    return vm.runInNewContext(code, { URL, Buffer, Error, setTimeout, clearTimeout, ...context }, { timeout: 1000 }) as (request: unknown, response: VirtualReply) => Promise<unknown>
}
export class VirtualReply extends EventEmitter {
    statusCode = 0
    headers: Record<string, unknown> = {}
    writableEnded = false
    destroyed = false
    text = ''
    setHeader(name: string, value: string) { this.headers[name] = value; return this }
    writeHead(status: number, headers: Record<string, unknown>) { this.statusCode = status; this.headers = { ...this.headers, ...headers }; return this }
    end(value: string) { this.text = value; this.writableEnded = true; this.emit('finish') }
    json() { return JSON.parse(this.text) }
}
