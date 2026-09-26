import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'

type ScenarioMode = 'idle' | 'load'

export interface ScenarioOptions {
    baseUrl: string
    mode: ScenarioMode
    tasks: string[]
    rounds: number
    iterations: number
    warmup: number
    intervalMs: number
    waitTimeoutMs: number
}

interface ResourceProfile {
    active?: Array<{ taskType?: string }>
}

interface HttpProfileSummary {
    count: number
}

interface HttpProfile {
    sampleCount: number
    overall: HttpProfileSummary
    idle: HttpProfileSummary
    underLoad: HttpProfileSummary
    byTask: Record<string, HttpProfileSummary>
    [key: string]: unknown
}

interface FrontendRequest {
    method: 'GET' | 'POST'
    path: string
    body?: Record<string, unknown>
}

function parseArguments(args: string[]) {
    const values = new Map<string, string[]>()
    for (let index = 0; index < args.length; index += 1) {
        const token = args[index]
        if (!token.startsWith('--')) continue
        const separator = token.indexOf('=')
        const key =
            separator >= 0 ? token.slice(2, separator) : token.slice(2)
        const inline = separator >= 0 ? token.slice(separator + 1) : null
        const next = args[index + 1]
        const value =
            inline ??
            (next && !next.startsWith('--')
                ? (() => {
                      index += 1
                      return next
                  })()
                : 'true')
        const existing = values.get(key) ?? []
        existing.push(value)
        values.set(key, existing)
    }
    return values
}

function integerOption(
    values: Map<string, string[]>,
    key: string,
    fallback: number,
    minimum = 0
) {
    const raw = values.get(key)?.at(-1)
    if (raw === undefined) return fallback
    const value = Number(raw)
    if (!Number.isInteger(value) || value < minimum)
        throw new Error(`--${key} must be an integer >= ${minimum}`)
    return value
}

function normalizeBaseUrl(value: string) {
    const url = new URL(value)
    const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
    if (url.protocol !== 'http:' || !loopbackHosts.has(url.hostname))
        throw new Error(
            'The J2 scenario harness only accepts a local loopback HTTP Desktop URL'
        )
    if (url.username || url.password)
        throw new Error('Credentials must not be embedded in --base-url')
    return url.origin
}

export function scenarioOptions(args = process.argv.slice(2)): ScenarioOptions {
    const values = parseArguments(args)
    const mode = (values.get('mode')?.at(-1) ?? 'idle') as ScenarioMode
    if (mode !== 'idle' && mode !== 'load')
        throw new Error('--mode must be idle or load')
    const tasks = [
        ...new Set(
            (values.get('task') ?? [])
                .flatMap((value) => value.split(','))
                .map((value) => value.trim())
                .filter(Boolean)
        )
    ]
    if (mode === 'idle' && tasks.length)
        throw new Error('--task is only valid with --mode=load')
    if (mode === 'load' && !tasks.length)
        throw new Error('--mode=load requires at least one --task')

    return {
        baseUrl: normalizeBaseUrl(
            values.get('base-url')?.at(-1) ??
                process.env.PICA_BASE_URL ??
                'http://127.0.0.1:4789'
        ),
        mode,
        tasks,
        rounds: integerOption(values, 'rounds', 3, 1),
        iterations: integerOption(values, 'iterations', 10, 1),
        warmup: integerOption(values, 'warmup', 2, 0),
        intervalMs: integerOption(values, 'interval-ms', 25, 0),
        waitTimeoutMs: integerOption(values, 'wait-timeout-ms', 30_000, 100)
    }
}

async function responseJson<T>(
    baseUrl: string,
    request: FrontendRequest | { method: 'GET'; path: string },
    headers: Record<string, string> = {}
): Promise<T> {
    const response = await fetch(`${baseUrl}${request.path}`, {
        method: request.method,
        headers: {
            accept: 'application/json',
            ...(request.method === 'POST'
                ? { 'content-type': 'application/json' }
                : {}),
            ...headers
        },
        ...(request.method === 'POST'
            ? { body: JSON.stringify(request.body ?? {}) }
            : {})
    })
    const text = await response.text()
    if (!response.ok)
        throw new Error(
            `${request.method} ${request.path} failed with HTTP ${response.status}: ${text.slice(0, 240)}`
        )
    return (text ? JSON.parse(text) : {}) as T
}

function activeTaskTypes(profile: ResourceProfile) {
    return [
        ...new Set(
            (profile.active ?? [])
                .map((item) => String(item.taskType ?? '').trim())
                .filter(Boolean)
        )
    ].sort()
}

async function resourceProfile(baseUrl: string) {
    return await responseJson<ResourceProfile>(baseUrl, {
        method: 'GET',
        path: '/api/v1/desktop/runtime/resources'
    })
}

async function waitForExpectedState(options: ScenarioOptions) {
    const started = performance.now()
    while (true) {
        const active = activeTaskTypes(await resourceProfile(options.baseUrl))
        if (options.mode === 'idle') {
            if (active.length === 0) return active
        } else if (options.tasks.every((task) => active.includes(task))) {
            return active
        }
        if (performance.now() - started >= options.waitTimeoutMs) {
            const expectation =
                options.mode === 'idle'
                    ? 'no active observed task'
                    : `active tasks: ${options.tasks.join(', ')}`
            throw new Error(
                `Timed out waiting for ${expectation}; current active tasks: ${active.join(', ') || 'none'}`
            )
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
    }
}

async function discoverLocalTargets(baseUrl: string) {
    const comics = await responseJson<Array<Record<string, unknown>>>(baseUrl, {
        method: 'GET',
        path: '/api/v1/comics?limit=1&offset=0&sort=latest'
    })
    const comicId =
        comics.length && typeof comics[0].comicId === 'string'
            ? comics[0].comicId
            : null
    if (!comicId) return { comicId: null, episodeId: null }

    try {
        const chapters = await responseJson<Array<Record<string, unknown>>>(
            baseUrl,
            {
                method: 'GET',
                path: `/api/v1/reader/comics/${encodeURIComponent(comicId)}/chapters`
            }
        )
        const episodeId =
            chapters.length && typeof chapters[0].id === 'string'
                ? chapters[0].id
                : null
        return { comicId, episodeId }
    } catch {
        return { comicId, episodeId: null }
    }
}

function foregroundRequests(target: {
    comicId: string | null
    episodeId: string | null
}): FrontendRequest[] {
    const requests: FrontendRequest[] = [
        { method: 'GET', path: '/api/v1/status' },
        {
            method: 'POST',
            path: '/api/v1/library/query',
            body: {
                scope: 'library',
                sort: 'latest',
                limit: 48,
                offset: 0
            }
        },
        { method: 'GET', path: '/api/v1/shelves' },
        { method: 'GET', path: '/api/v1/downloaded' },
        { method: 'GET', path: '/api/v1/reader/progress' }
    ]
    if (target.comicId) {
        const comic = encodeURIComponent(target.comicId)
        requests.push(
            { method: 'GET', path: `/api/v1/comics/${comic}` },
            {
                method: 'GET',
                path: `/api/v1/reader/comics/${comic}/chapters`
            }
        )
        if (target.episodeId)
            requests.push({
                method: 'GET',
                path: `/api/v1/reader/comics/${comic}/chapters/${encodeURIComponent(target.episodeId)}`
            })
    }
    return requests
}

async function runForegroundSet(
    baseUrl: string,
    requests: FrontendRequest[]
) {
    for (const request of requests)
        await responseJson<unknown>(baseUrl, request)
}

async function resetProfile(baseUrl: string, csrfToken: string) {
    await responseJson(baseUrl, {
        method: 'POST',
        path: '/api/v1/desktop/runtime/http-profile/reset',
        body: {}
    }, {
        'x-pica-csrf': csrfToken
    })
}

async function httpProfile(baseUrl: string) {
    return await responseJson<HttpProfile>(baseUrl, {
        method: 'GET',
        path: '/api/v1/desktop/runtime/http-profile'
    })
}

function validateWindow(
    options: ScenarioOptions,
    profile: HttpProfile
) {
    if (profile.overall.count === 0)
        return {
            valid: false,
            reason: 'no foreground samples were recorded',
            taskCoverage: {}
        }

    if (options.mode === 'idle') {
        const valid =
            profile.idle.count === profile.overall.count &&
            profile.underLoad.count === 0
        return {
            valid,
            reason: valid
                ? null
                : 'one or more samples overlapped an observed background task',
            taskCoverage: {}
        }
    }

    const taskCoverage = Object.fromEntries(
        options.tasks.map((task) => [
            task,
            {
                samples: profile.byTask[task]?.count ?? 0,
                total: profile.overall.count,
                fraction:
                    (profile.byTask[task]?.count ?? 0) /
                    Math.max(1, profile.overall.count)
            }
        ])
    )
    const valid = options.tasks.every(
        (task) => (profile.byTask[task]?.count ?? 0) === profile.overall.count
    )
    return {
        valid,
        reason: valid
            ? null
            : 'one or more expected tasks did not cover every foreground sample',
        taskCoverage
    }
}

export async function runHttpLatencyScenario(options: ScenarioOptions) {
    const desktop = await responseJson<{ csrfToken?: string }>(options.baseUrl, {
        method: 'GET',
        path: '/api/v1/desktop/status'
    })
    if (!desktop.csrfToken)
        throw new Error('Desktop status did not expose a CSRF token')

    await waitForExpectedState(options)
    const target = await discoverLocalTargets(options.baseUrl)
    const requests = foregroundRequests(target)

    for (let index = 0; index < options.warmup; index += 1)
        await runForegroundSet(options.baseUrl, requests)

    const rounds = []
    for (let round = 1; round <= options.rounds; round += 1) {
        const activeBefore = await waitForExpectedState(options)
        await resetProfile(options.baseUrl, desktop.csrfToken)
        const started = performance.now()
        for (
            let iteration = 0;
            iteration < options.iterations;
            iteration += 1
        ) {
            await runForegroundSet(options.baseUrl, requests)
            if (options.intervalMs)
                await new Promise((resolve) =>
                    setTimeout(resolve, options.intervalMs)
                )
        }
        const wallTimeMs =
            Math.round((performance.now() - started) * 1000) / 1000
        const profile = await httpProfile(options.baseUrl)
        const validation = validateWindow(options, profile)
        const activeAfter = activeTaskTypes(
            await resourceProfile(options.baseUrl)
        )
        rounds.push({
            round,
            valid: validation.valid,
            invalidReason: validation.reason,
            wallTimeMs,
            requestSetSize: requests.length,
            iterations: options.iterations,
            expectedTaskTypes: options.tasks,
            activeTaskTypesBefore: activeBefore,
            activeTaskTypesAfter: activeAfter,
            taskCoverage: validation.taskCoverage,
            profile
        })
    }

    const output = {
        benchmark: 'desktop-http-latency-scenario-p2-j2',
        warning:
            'Real local runtime observation only. No latency threshold or release budget is selected by this harness.',
        environment: {
            node: process.version,
            platform: process.platform,
            arch: process.arch
        },
        scenario: {
            mode: options.mode,
            expectedTaskTypes: options.tasks,
            rounds: options.rounds,
            iterations: options.iterations,
            warmupSets: options.warmup,
            intervalMs: options.intervalMs,
            requestSetSize: requests.length,
            localComicDetailAvailable: Boolean(target.comicId),
            localReaderChapterAvailable: Boolean(target.episodeId)
        },
        rounds,
        validWindows: rounds.filter((round) => round.valid).length
    }
    return output
}

async function main() {
    const output = await runHttpLatencyScenario(scenarioOptions())
    console.log(JSON.stringify(output, null, 2))
    if (output.rounds.some((round) => !round.valid)) process.exitCode = 2
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
)
    main().catch((error) => {
        console.error(
            error instanceof Error ? error.message : String(error)
        )
        process.exitCode = 1
    })
