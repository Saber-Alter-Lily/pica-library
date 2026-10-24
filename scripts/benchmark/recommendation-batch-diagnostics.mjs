import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const routes = new Set([
    '/api/v1/recommendations',
    '/api/v1/recommendation-sessions'
])
const actions = new Set(['current', 'next', 'resume_or_create', 'force_new'])
const phases = new Set([
    'shell',
    'navigation',
    'current-batch',
    'next-batch',
    'postconditions'
])
const flagKeys = [
    'homeActive',
    'discoverActive',
    'recommendActive',
    'modePresent',
    'currentButtonDisabled',
    'nextButtonPresent',
    'nextButtonDisabled',
    'nextButtonHidden',
    'labelChanged',
    'cardsUnchanged'
]
const count = (value) =>
    Number.isInteger(value) && value >= 0 ? Math.min(value, 10000) : 0
const action = (value) => (actions.has(value) ? value : 'OTHER')
function requestView(request) {
    try {
        const route = new URL(request.url()).pathname
        if (!routes.has(route)) return null
        let requestedAction = 'OTHER'
        try {
            requestedAction = action(request.postDataJSON()?.action)
        } catch {
            /* No payload/body is retained. */
        }
        return {
            route,
            method: ['GET', 'POST'].includes(request.method())
                ? request.method()
                : 'OTHER',
            action: requestedAction
        }
    } catch {
        return null
    }
}

/** Reuse Playwright events, retaining only endpoint/action/status enums, at most32 events. */
export function observeRecommendationBatchNetworkV1(page) {
    const events = []
    let dropped = 0
    const push = (value) => {
        if (!value) return
        events.push(value)
        if (events.length > 32) {
            events.shift()
            dropped++
        }
    }
    const onRequest = (request) => {
        const view = requestView(request)
        if (view) push({ ...view, event: 'request', status: null })
    }
    const onResponse = (response) => {
        const view = requestView(response.request())
        if (view)
            push({ ...view, event: 'response', status: response.status() })
    }
    const onFailed = (request) => {
        const view = requestView(request)
        if (view) push({ ...view, event: 'failed', status: null })
    }
    page.on('request', onRequest)
    page.on('response', onResponse)
    page.on('requestfailed', onFailed)
    return {
        snapshot: () => ({
            events: events.map((row) => ({ ...row })),
            dropped
        }),
        dispose: () => {
            page.removeListener('request', onRequest)
            page.removeListener('response', onResponse)
            page.removeListener('requestfailed', onFailed)
        }
    }
}

/** Never returns text, identities, DOM/HTML, URLs/queries, headers or request/response bodies. */
export async function collectRecommendationBatchFailureV1(options) {
    let pageStateStatus = 'UNAVAILABLE',
        raw = null,
        timer
    try {
        if (options.page && !options.page.isClosed()) {
            raw = await Promise.race([
                options.page.evaluate(
                    ({ previousIds, previousLabel }) => {
                        const element = (id) => document.querySelector(id),
                            active = (id) =>
                                Boolean(
                                    element(id)?.classList.contains('active')
                                )
                        const current = element('#recommend-button'),
                            next = element('#recommend-next-batch'),
                            label = String(
                                element('#recommend-batch')?.textContent || ''
                            ).trim()
                        const ids = [
                            ...document.querySelectorAll(
                                '#recommend-results .result[data-comic-id]'
                            )
                        ].map((row) => row.getAttribute('data-comic-id') || '')
                        return {
                            homeActive: active('#home'),
                            discoverActive: active('#discover'),
                            recommendActive: active('#recommend'),
                            modePresent: Boolean(element('#mode')),
                            currentButtonDisabled: Boolean(current?.disabled),
                            nextButtonPresent: Boolean(next),
                            nextButtonDisabled: Boolean(next?.disabled),
                            nextButtonHidden:
                                !next ||
                                next.hidden ||
                                getComputedStyle(next).display === 'none',
                            cardCount: ids.length,
                            labelChanged:
                                previousLabel === null
                                    ? null
                                    : label !== previousLabel,
                            cardsUnchanged:
                                previousIds === null
                                    ? null
                                    : ids.join('\n') === previousIds.join('\n')
                        }
                    },
                    {
                        previousIds: Array.isArray(options.before?.ids)
                            ? options.before.ids
                            : null,
                        previousLabel:
                            typeof options.before?.label === 'string'
                                ? options.before.label
                                : null
                    }
                ),
                new Promise((_, reject) => {
                    timer = setTimeout(
                        () =>
                            reject(
                                new Error('Bounded DOM observation expired')
                            ),
                        1500
                    )
                })
            ])
            pageStateStatus = 'OBSERVED'
        }
    } catch {
        /* A frozen/closed page is unknown, never fabricated as a successful observation. */
    } finally {
        clearTimeout(timer)
    }
    const flags =
        pageStateStatus === 'OBSERVED'
            ? Object.fromEntries(
                  flagKeys.map((key) => [
                      key,
                      typeof raw?.[key] === 'boolean' ? raw[key] : null
                  ])
              )
            : null
    const events = (
        Array.isArray(options.network?.events) ? options.network.events : []
    )
        .slice(-32)
        .filter(
            (row) =>
                routes.has(row?.route) &&
                ['request', 'response', 'failed'].includes(row?.event)
        )
        .map((row) => ({
            route: row.route,
            event: row.event,
            method: ['GET', 'POST'].includes(row.method) ? row.method : 'OTHER',
            action: action(row.action),
            status:
                Number.isInteger(row.status) &&
                row.status >= 100 &&
                row.status <= 599
                    ? row.status
                    : null
        }))
    return {
        schemaVersion: 1,
        kind: 'pica-j7-batch-failure-diagnostics',
        sourceSha: /^[a-f0-9]{40}$/.test(options.sourceSha || '')
            ? options.sourceSha
            : null,
        round: Math.max(1, Math.min(5, count(options.round))),
        phase: phases.has(options.phase) ? options.phase : 'UNKNOWN',
        timeoutMs:
            Number.isSafeInteger(options.timeoutMs) && options.timeoutMs > 0
                ? options.timeoutMs
                : null,
        harnessValidationOnly: options.harnessValidationOnly === true,
        errorKind: ['TimeoutError', 'TypeError', 'Error'].includes(
            options.error?.name
        )
            ? options.error.name
            : 'OTHER',
        pageErrorCount: count(options.pageErrorCount),
        pageStateStatus,
        pageFlags: flags,
        cardCount:
            pageStateStatus === 'OBSERVED' ? count(raw?.cardCount) : null,
        network: { events, dropped: count(options.network?.dropped) },
        excludes: [
            'comic/query/session identities',
            'label or mode text',
            'DOM and screenshots',
            'full URLs and query parameters',
            'headers and credentials',
            'request/response bodies',
            'raw error messages/stacks'
        ]
    }
}

export async function writeRecommendationBatchFailureV1(options) {
    const report = await collectRecommendationBatchFailureV1(options),
        file = path.resolve(
            options.output +
                '.failure-round-' +
                report.round +
                '-' +
                randomUUID() +
                '.json'
        )
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n', {
        encoding: 'utf8',
        flag: 'wx'
    })
    return file
}
