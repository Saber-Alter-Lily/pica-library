import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sanitizedChildEnv } from '../desktop/child-process'
import { installedRuntimeComposition } from '../runtime/installed-runtime-composition'
import { RUNTIME_COMPOSITION_PATH } from '../modules/runtime-composition'

export interface JmTransport {
    readonly available: boolean
    request<T>(op: string, payload?: Record<string, unknown>): Promise<T>
    close(): void
    sessionKey?(): string
}

export function selectJmApplicationRoot(roots: string[]) {
    if (!roots.length) throw new Error('An application root is required')
    return roots.find(candidate => fs.existsSync(path.join(candidate, 'SOURCE_SHA.txt')) ||
        fs.existsSync(path.join(candidate, RUNTIME_COMPOSITION_PATH))) ??
        roots.find(candidate => fs.existsSync(path.join(candidate, 'runtime/jm/lib/pica-jm-source.jar'))) ?? roots[0]
}

/** The SDK accepts unauthenticated HTTP forward proxies only. Never silently bypass one. */
export function jmProxyConfiguration(value = process.env.PICA_PROXY ?? '') {
    if (!value) return { proxyHost: '', proxyPort: 0 }
    const proxy = new URL(value)
    if (
        proxy.protocol !== 'http:' ||
        proxy.username ||
        proxy.password ||
        (proxy.pathname !== '/' && proxy.pathname !== '') ||
        proxy.search ||
        proxy.hash
    )
        throw new Error(
            'JM 当前仅支持无认证的 HTTP 代理，请使用本机 HTTP 代理端口'
        )
    return {
        proxyHost: proxy.hostname.replace(/^\[|\]$/g, ''),
        proxyPort: Number(proxy.port || 80)
    }
}

export class JmWorkerTransport implements JmTransport {
    private child?: ChildProcessWithoutNullStreams
    private sequence = 0
    private pending = new Map<
        string,
        {
            resolve(value: unknown): void
            reject(error: Error): void
            timer: ReturnType<typeof setTimeout>
        }
    >()
    private buffer = ''
    private configuration?: Promise<unknown>
    private readonly instanceKey = randomUUID()
    private generation = 0
    private readonly java: string
    private readonly jar: string
    readonly available: boolean

    constructor(root?: string) {
        const here = path.dirname(fileURLToPath(import.meta.url))
        const roots = root
            ? [root]
            : path.basename(here) === 'app'
              ? [path.resolve(here, '..')]
              : [
                  path.resolve(here, '..'),
                  path.resolve(here, '../..'),
                  process.cwd()
              ]
        // A packaged core must not borrow another checkout's JVM from cwd.
        const selected = selectJmApplicationRoot(roots)
        this.java = path.join(
            selected,
            'runtime/jm/bin',
            process.platform === 'win32' ? 'java.exe' : 'java'
        )
        this.jar = path.join(selected, 'runtime/jm/lib/pica-jm-source.jar')
        const composition = installedRuntimeComposition(selected)
        this.available = composition.status !== 'invalid' &&
            composition.composition.sourceRuntimes.includes('jm') &&
            fs.existsSync(this.java) && fs.existsSync(this.jar)
    }

    private fail() {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer)
            pending.reject(new Error('JM 来源进程已停止，请重新登录或重试'))
        }
        this.pending.clear()
        this.buffer = ''
        this.configuration = undefined
        this.child?.kill()
        this.child = undefined
    }

    private start() {
        if (!this.available) throw new Error('此应用包未包含有效的 JM 运行组件；普通本地阅读不受影响')
        if (this.child) return
        const child = spawn(
            this.java,
            ['-Xmx128m', '-Dfile.encoding=UTF-8', '-jar', this.jar],
            {
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe'],
                env: sanitizedChildEnv()
            }
        )
        this.child = child
        this.generation++
        // Provider diagnostics may contain URLs; keep them off application logs and HTTP responses.
        child.stderr.resume()
        child.stdout.setEncoding('utf8')
        child.stdout.on('data', (chunk: string) => {
            this.buffer += chunk
            if (this.buffer.length > 32 * 1024 * 1024) {
                this.fail()
                return
            }
            let end: number
            while ((end = this.buffer.indexOf('\n')) >= 0) {
                const line = this.buffer.slice(0, end)
                this.buffer = this.buffer.slice(end + 1)
                try {
                    const message = JSON.parse(line)
                    const pending = this.pending.get(message.id)
                    if (!pending) continue
                    clearTimeout(pending.timer)
                    this.pending.delete(message.id)
                    if (message.ok === true) pending.resolve(message.value)
                    else
                        pending.reject(
                            new Error(
                                'JM 操作未完成，请检查登录状态、网络或重试'
                            )
                        )
                } catch {
                    this.fail()
                    return
                }
            }
        })
        child.on('error', () => this.fail())
        child.on('exit', () => {
            if (this.child === child) this.fail()
        })
    }

    async request<T>(
        op: string,
        payload: Record<string, unknown> = {}
    ): Promise<T> {
        this.start()
        if (op !== 'status' && op !== 'logout') {
            if (!this.configuration)
                this.configuration = this.exchange(
                    'configure',
                    jmProxyConfiguration()
                )
            await this.configuration
        }
        return this.exchange<T>(op, payload)
    }

    private exchange<T>(
        op: string,
        payload: Record<string, unknown> = {}
    ): Promise<T> {
        if (this.pending.size >= 8)
            throw new Error('JM 正在处理其他请求，请稍后重试')
        const id = String(++this.sequence)
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => this.fail(), 65_000)
            this.pending.set(id, {
                resolve: (value) => resolve(value as T),
                reject,
                timer
            })
            this.child!.stdin.write(
                JSON.stringify({ ...payload, id, op }) + '\n',
                (error) => {
                    if (error) this.fail()
                }
            )
        })
    }

    close() {
        this.fail()
    }
    sessionKey() {
        return `${this.instanceKey}:${this.generation}`
    }
}
