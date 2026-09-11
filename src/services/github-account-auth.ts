import crypto from 'node:crypto'

const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const USER_URL = 'https://api.github.com/user'
const STAR_URL = 'https://api.github.com/user/starred/Saber-Alter-Lily/pica-library'
const GITHUB_API_VERSION = '2022-11-28'

export const GITHUB_APP_CLIENT_ID = 'Iv23li2rIouPPVGgMoyI'

interface PendingFlow {
    deviceCode: string
    expiresAt: number
    intervalMs: number
    nextPollAt: number
}

export interface GitHubVerifiedIdentity {
    githubUser: string
    githubUserId: number
}

function configuredClientId() {
    const value = GITHUB_APP_CLIENT_ID.trim()
    if (!value)
        throw new Error(
            'GitHub 账号认证尚未配置。需要先为 Pica Library 注册 GitHub App 并填写 Client ID。'
        )
    return value
}

async function responseJson(response: Response) {
    const text = await response.text()
    try {
        return text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
        throw new Error(`GitHub 返回了无法解析的数据（HTTP ${response.status}）`)
    }
}

export class GitHubAccountAuthService {
    private readonly pending = new Map<string, PendingFlow>()

    async start() {
        const clientId = configuredClientId()
        const response = await fetch(DEVICE_CODE_URL, {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/x-www-form-urlencoded',
                'user-agent': 'Pica-Library-GitHub-Auth'
            },
            body: new URLSearchParams({ client_id: clientId }).toString(),
            signal: AbortSignal.timeout(15_000)
        })
        const value = await responseJson(response)
        if (!response.ok)
            throw new Error(
                String(
                    value.error_description ??
                        value.error ??
                        `GitHub 登录启动失败（HTTP ${response.status}）`
                )
            )

        const deviceCode = String(value.device_code ?? '').trim()
        const userCode = String(value.user_code ?? '').trim()
        const verificationUri = String(value.verification_uri ?? '').trim()
        const expiresIn = Number(value.expires_in ?? 900)
        const interval = Math.max(5, Number(value.interval ?? 5))
        if (
            !deviceCode ||
            !userCode ||
            !/^https:\/\/github\.com\//.test(verificationUri)
        )
            throw new Error('GitHub 登录启动响应不完整')

        const flowId = crypto.randomBytes(18).toString('base64url')
        const now = Date.now()
        this.pending.set(flowId, {
            deviceCode,
            expiresAt: now + Math.max(60, expiresIn) * 1000,
            intervalMs: interval * 1000,
            nextPollAt: now
        })
        this.prune()
        return {
            flowId,
            userCode,
            verificationUri,
            expiresAt: new Date(
                now + Math.max(60, expiresIn) * 1000
            ).toISOString(),
            pollAfterMs: interval * 1000
        }
    }

    async poll(
        flowIdInput: unknown
    ): Promise<
        | { state: 'pending'; pollAfterMs: number }
        | { state: 'complete'; identity: GitHubVerifiedIdentity }
    > {
        const flowId = String(flowIdInput ?? '').trim()
        const pending = this.pending.get(flowId)
        if (!pending)
            throw new Error('GitHub 登录会话不存在或已过期，请重新开始')
        const now = Date.now()
        if (now >= pending.expiresAt) {
            this.pending.delete(flowId)
            throw new Error('GitHub 登录验证码已过期，请重新开始')
        }
        if (now < pending.nextPollAt)
            return {
                state: 'pending',
                pollAfterMs: pending.nextPollAt - now
            }

        const response = await fetch(ACCESS_TOKEN_URL, {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/x-www-form-urlencoded',
                'user-agent': 'Pica-Library-GitHub-Auth'
            },
            body: new URLSearchParams({
                client_id: configuredClientId(),
                device_code: pending.deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            }).toString(),
            signal: AbortSignal.timeout(15_000)
        })
        const value = await responseJson(response)
        if (!response.ok)
            throw new Error(
                String(
                    value.error_description ??
                        value.error ??
                        `GitHub 登录失败（HTTP ${response.status}）`
                )
            )

        const error = String(value.error ?? '')
        if (error === 'authorization_pending') {
            pending.nextPollAt = Date.now() + pending.intervalMs
            return { state: 'pending', pollAfterMs: pending.intervalMs }
        }
        if (error === 'slow_down') {
            pending.intervalMs += 5_000
            pending.nextPollAt = Date.now() + pending.intervalMs
            return { state: 'pending', pollAfterMs: pending.intervalMs }
        }
        if (error === 'expired_token') {
            this.pending.delete(flowId)
            throw new Error('GitHub 登录验证码已过期，请重新开始')
        }
        if (error === 'access_denied') {
            this.pending.delete(flowId)
            throw new Error('GitHub 登录授权已取消')
        }
        if (error) throw new Error(String(value.error_description ?? error))

        const token = String(value.access_token ?? '').trim()
        if (!token) throw new Error('GitHub 未返回访问令牌')
        try {
            const identity = await this.verifyAuthenticatedStar(token)
            this.pending.delete(flowId)
            return { state: 'complete', identity }
        } finally {
            // Deliberately do not persist the access token. It exists only in
            // this stack frame long enough to identify the account and verify
            // the authenticated user's Star state.
        }
    }

    private async verifyAuthenticatedStar(
        token: string
    ): Promise<GitHubVerifiedIdentity> {
        const headers = {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${token}`,
            'x-github-api-version': GITHUB_API_VERSION,
            'user-agent': 'Pica-Library-GitHub-Auth'
        }
        const identityResponse = await fetch(USER_URL, {
            headers,
            signal: AbortSignal.timeout(15_000)
        })
        const identity = await responseJson(identityResponse)
        if (!identityResponse.ok)
            throw new Error(
                `GitHub 账号身份读取失败（HTTP ${identityResponse.status}）`
            )
        const githubUser = String(identity.login ?? '').trim()
        const githubUserId = Number(identity.id ?? 0)
        if (
            !githubUser ||
            !Number.isSafeInteger(githubUserId) ||
            githubUserId <= 0
        )
            throw new Error('GitHub 账号身份信息无效')

        const starResponse = await fetch(STAR_URL, {
            headers,
            signal: AbortSignal.timeout(15_000)
        })
        if (starResponse.status === 404)
            throw new Error(
                `已登录 GitHub 账号 ${githubUser}，但该账号尚未 Star Pica Library`
            )
        if (starResponse.status !== 204)
            throw new Error(
                `GitHub Star 身份验证失败（HTTP ${starResponse.status}）`
            )
        return { githubUser, githubUserId }
    }

    private prune() {
        const now = Date.now()
        for (const [id, value] of this.pending)
            if (value.expiresAt <= now) this.pending.delete(id)
        while (this.pending.size > 20)
            this.pending.delete(this.pending.keys().next().value as string)
    }
}
