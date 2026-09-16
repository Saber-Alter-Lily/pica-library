import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { sanitizedChildEnv, windowsExecutable } from './child-process'

const LOGIN_URL = 'https://forums.e-hentai.org/index.php?act=Login'

export interface EhCapturedSession {
    memberId: string
    passHash: string
    igneous?: string
    cfClearance?: string
}

export type EhWebLoginState =
    | 'idle'
    | 'opening'
    | 'waiting'
    | 'verifying'
    | 'complete'
    | 'failed'
    | 'cancelled'

export interface EhWebLoginSnapshot {
    state: EhWebLoginState
    message: string
    startedAt?: string
    completedAt?: string
}

interface CdpCookie {
    name?: unknown
    value?: unknown
    domain?: unknown
}

function text(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
}

function relevantDomain(value: unknown) {
    const domain = text(value).replace(/^\./, '').toLowerCase()
    return (
        domain === 'e-hentai.org' ||
        domain.endsWith('.e-hentai.org') ||
        domain === 'exhentai.org' ||
        domain.endsWith('.exhentai.org')
    )
}

/** Extract only the E-H session material needed by the existing provider client. */
export function ehSessionFromCdpCookies(
    input: unknown
): EhCapturedSession | null {
    if (!Array.isArray(input)) return null
    const values = new Map<string, string>()
    for (const raw of input) {
        if (!raw || typeof raw !== 'object') continue
        const cookie = raw as CdpCookie
        if (!relevantDomain(cookie.domain)) continue
        const name = text(cookie.name)
        const value = text(cookie.value)
        if (!name || !value) continue
        if (
            name === 'ipb_member_id' ||
            name === 'ipb_pass_hash' ||
            name === 'igneous'
        )
            values.set(name, value)
    }
    const memberId = values.get('ipb_member_id') ?? ''
    const passHash = values.get('ipb_pass_hash') ?? ''
    if (!memberId || !passHash) return null
    // cf_clearance is intentionally not promoted from the Edge login profile.
    // Cloudflare clearance is browser-environment bound; replaying it from the
    // Node provider with a different user agent/fingerprint can invalidate an
    // otherwise valid E-H identity session.
    return {
        memberId,
        passHash,
        igneous: values.get('igneous') || undefined
    }
}

function sessionSignature(value: EhCapturedSession) {
    return [value.memberId, value.passHash, value.igneous ?? ''].join('|')
}

function findEdgeExecutable() {
    const roots = [
        process.env['ProgramFiles(x86)'],
        process.env.ProgramFiles,
        process.env.LOCALAPPDATA
    ].filter((value): value is string => Boolean(value))
    for (const root of roots) {
        const candidate = path.join(
            root,
            'Microsoft',
            'Edge',
            'Application',
            'msedge.exe'
        )
        if (fs.existsSync(candidate)) return candidate
    }
    try {
        const located = spawnSync(
            windowsExecutable('System32', 'where.exe'),
            ['msedge.exe'],
            {
                encoding: 'utf8',
                windowsHide: true,
                env: sanitizedChildEnv()
            }
        )
        const candidate = String(located.stdout ?? '')
            .split(/\r?\n/)
            .map((item) => item.trim())
            .find((item) => item && fs.existsSync(item))
        return candidate || null
    } catch {
        return null
    }
}

async function reserveLoopbackPort() {
    return await new Promise<number>((resolve, reject) => {
        const server = net.createServer()
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            const port =
                address && typeof address === 'object' ? address.port : 0
            server.close((error) => {
                if (error) reject(error)
                else if (!port) reject(new Error('Could not allocate login port'))
                else resolve(port)
            })
        })
    })
}

class CdpClient {
    private nextId = 1
    private readonly pending = new Map<
        number,
        {
            resolve: (value: Record<string, unknown>) => void
            reject: (error: Error) => void
            timer: ReturnType<typeof setTimeout>
        }
    >()

    constructor(private readonly socket: WebSocket) {
        socket.addEventListener('message', (event) => {
            let payload: {
                id?: number
                result?: Record<string, unknown>
                error?: { message?: string }
            }
            try {
                payload = JSON.parse(String(event.data))
            } catch {
                return
            }
            if (!payload.id) return
            const item = this.pending.get(payload.id)
            if (!item) return
            clearTimeout(item.timer)
            this.pending.delete(payload.id)
            if (payload.error)
                item.reject(
                    new Error(payload.error.message || 'Browser login command failed')
                )
            else item.resolve(payload.result ?? {})
        })
        const rejectAll = () => {
            for (const item of this.pending.values()) {
                clearTimeout(item.timer)
                item.reject(new Error('Browser login window closed'))
            }
            this.pending.clear()
        }
        socket.addEventListener('close', rejectAll)
        socket.addEventListener('error', rejectAll)
    }

    static async connect(url: string) {
        const socket = new WebSocket(url)
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('Browser login connection timed out')),
                8_000
            )
            socket.addEventListener(
                'open',
                () => {
                    clearTimeout(timer)
                    resolve()
                },
                { once: true }
            )
            socket.addEventListener(
                'error',
                () => {
                    clearTimeout(timer)
                    reject(new Error('Could not connect to browser login window'))
                },
                { once: true }
            )
        })
        return new CdpClient(socket)
    }

    async send(method: string, params: Record<string, unknown> = {}) {
        if (this.socket.readyState !== WebSocket.OPEN)
            throw new Error('Browser login window is not available')
        const id = this.nextId++
        return await new Promise<Record<string, unknown>>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id)
                reject(new Error('Browser login command timed out'))
            }, 5_000)
            this.pending.set(id, { resolve, reject, timer })
            this.socket.send(JSON.stringify({ id, method, params }))
        })
    }

    close() {
        try {
            this.socket.close()
        } catch {
            // Best-effort teardown.
        }
    }
}

export class DesktopEhWebLogin {
    private snapshot: EhWebLoginSnapshot = {
        state: 'idle',
        message: '尚未开始网页登录'
    }
    private process: ChildProcess | null = null
    private cdp: CdpClient | null = null
    private generation = 0

    constructor(
        private readonly profileRoot: string,
        private readonly onCaptured: (session: EhCapturedSession) => Promise<void>
    ) {}

    status() {
        return { ...this.snapshot }
    }

    async start() {
        if (
            this.snapshot.state === 'opening' ||
            this.snapshot.state === 'waiting' ||
            this.snapshot.state === 'verifying'
        )
            return this.status()
        if (process.platform !== 'win32')
            throw new Error('受控 E-H 网页登录仅在 Windows Desktop 可用')
        const edge = findEdgeExecutable()
        if (!edge)
            throw new Error('未找到 Microsoft Edge，请使用高级手动会话导入')

        await this.teardown(false)
        const port = await reserveLoopbackPort()
        const startedAt = new Date().toISOString()
        const run = ++this.generation
        fs.rmSync(this.profileRoot, { recursive: true, force: true })
        fs.mkdirSync(this.profileRoot, { recursive: true })
        this.snapshot = {
            state: 'opening',
            message: '正在打开 E-H 官方登录窗口…',
            startedAt
        }
        this.process = spawn(
            edge,
            [
                `--user-data-dir=${this.profileRoot}`,
                `--remote-debugging-port=${port}`,
                '--remote-debugging-address=127.0.0.1',
                '--no-first-run',
                '--no-default-browser-check',
                '--new-window',
                LOGIN_URL
            ],
            {
                windowsHide: false,
                stdio: 'ignore',
                env: sanitizedChildEnv()
            }
        )
        void this.monitor(run, port)
        return this.status()
    }

    async cancel() {
        ++this.generation
        await this.teardown(true)
        this.snapshot = {
            state: 'cancelled',
            message: '网页登录已取消',
            completedAt: new Date().toISOString()
        }
        return this.status()
    }

    private async monitor(run: number, port: number) {
        try {
            const debuggerUrl = await this.waitForDebugger(run, port)
            if (run !== this.generation) return
            this.cdp = await CdpClient.connect(debuggerUrl)
            this.snapshot = {
                ...this.snapshot,
                state: 'waiting',
                message: '请在打开的 E-H 官方窗口完成登录；成功后会自动验证。'
            }
            const deadline = Date.now() + 10 * 60 * 1000
            let lastSignature = ''
            while (run === this.generation && Date.now() < deadline) {
                const result = await this.cdp.send('Storage.getCookies')
                const session = ehSessionFromCdpCookies(result.cookies)
                if (session) {
                    const signature = sessionSignature(session)
                    if (signature !== lastSignature) {
                        lastSignature = signature
                        this.snapshot = {
                            ...this.snapshot,
                            state: 'verifying',
                            message: '已检测到 E-H 登录会话，正在验证…'
                        }
                        try {
                            await this.onCaptured(session)
                            if (run !== this.generation) return
                            this.snapshot = {
                                state: 'complete',
                                message: 'E-H 登录成功，会话已加密保存。',
                                startedAt: this.snapshot.startedAt,
                                completedAt: new Date().toISOString()
                            }
                            ++this.generation
                            await this.teardown(true)
                            return
                        } catch (error) {
                            this.snapshot = {
                                ...this.snapshot,
                                state: 'waiting',
                                message: `已检测到登录，但验证失败：${
                                    error instanceof Error
                                        ? error.message
                                        : String(error)
                                }`
                            }
                        }
                    }
                }
                await delay(800)
            }
            if (run !== this.generation) return
            this.snapshot = {
                state: 'failed',
                message: '网页登录已超时，请重新开始。',
                startedAt: this.snapshot.startedAt,
                completedAt: new Date().toISOString()
            }
            ++this.generation
            await this.teardown(true)
        } catch (error) {
            if (run !== this.generation) return
            this.snapshot = {
                state: 'failed',
                message:
                    error instanceof Error
                        ? error.message
                        : '无法启动 E-H 网页登录',
                startedAt: this.snapshot.startedAt,
                completedAt: new Date().toISOString()
            }
            ++this.generation
            await this.teardown(true)
        }
    }

    private async waitForDebugger(run: number, port: number) {
        for (let attempt = 0; attempt < 60; attempt++) {
            if (run !== this.generation)
                throw new Error('网页登录已取消')
            try {
                const response = await fetch(
                    `http://127.0.0.1:${port}/json/version`,
                    { signal: AbortSignal.timeout(1_000) }
                )
                if (response.ok) {
                    const value = (await response.json()) as {
                        webSocketDebuggerUrl?: unknown
                    }
                    const url = text(value.webSocketDebuggerUrl)
                    if (url) return url
                }
            } catch {
                // Browser is still starting.
            }
            await delay(250)
        }
        throw new Error('E-H 登录窗口启动失败，请检查 Microsoft Edge')
    }

    private async teardown(removeProfile: boolean) {
        this.cdp?.close()
        this.cdp = null
        const pid = this.process?.pid
        this.process = null
        if (pid && process.platform === 'win32') {
            try {
                spawnSync(
                    windowsExecutable('System32', 'taskkill.exe'),
                    ['/PID', String(pid), '/T', '/F'],
                    {
                        windowsHide: true,
                        stdio: 'ignore',
                        env: sanitizedChildEnv()
                    }
                )
            } catch {
                // Browser may already be closed by the user.
            }
        }
        if (removeProfile) {
            for (let attempt = 0; attempt < 5; attempt++) {
                try {
                    fs.rmSync(this.profileRoot, {
                        recursive: true,
                        force: true
                    })
                    break
                } catch {
                    await delay(200)
                }
            }
        }
    }
}
