import { test, expect } from '@playwright/test'
import {
    observeRecommendationBatchNetworkV1,
    collectRecommendationBatchFailureV1
} from '../../scripts/benchmark/recommendation-batch-diagnostics.mjs'

test('J7 diagnostics observe real DOM and HTTP status without identities, payloads or URLs', async ({
    page
}) => {
    await page.route('http://audit.fixture.test/**', async (route) => {
        if (new URL(route.request().url()).pathname === '/')
            return route.fulfill({
                contentType: 'text/html',
                body: '<section id="home"></section><section id="discover" class="active"></section><section id="recommend" class="active"></section><span id="mode">CANARY_ACCOUNT</span><button id="recommend-button"></button><button id="recommend-next-batch" disabled>Next</button><span id="recommend-batch">CANARY_LABEL</span><div id="recommend-results"><div class="result" data-comic-id="CANARY_COMIC"></div></div>'
            })
        return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"private":"CANARY_RESPONSE"}'
        })
    })
    await page.goto('http://audit.fixture.test/')
    const network = observeRecommendationBatchNetworkV1(page)
    try {
        await page.evaluate(async () => {
            await fetch('/api/v1/recommendations?token=CANARY_QUERY', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    action: 'next',
                    password: 'CANARY_BODY'
                })
            })
        })
        const report = await collectRecommendationBatchFailureV1({
            page,
            before: { label: 'CANARY_LABEL', ids: ['CANARY_COMIC'] },
            network: network.snapshot(),
            phase: 'next-batch',
            round: 1,
            timeoutMs: 15000,
            error: { name: 'TimeoutError', message: 'CANARY_ERROR' },
            sourceSha: 'a'.repeat(40),
            harnessValidationOnly: true,
            pageErrorCount: 0
        })
        expect(report.pageStateStatus).toBe('OBSERVED')
        expect(report.pageFlags).toMatchObject({
            discoverActive: true,
            recommendActive: true,
            nextButtonDisabled: true,
            labelChanged: false,
            cardsUnchanged: true
        })
        expect(report.cardCount).toBe(1)
        expect(report.timeoutMs).toBe(15000)
        expect(report.network.events).toContainEqual({
            route: '/api/v1/recommendations',
            event: 'response',
            method: 'POST',
            action: 'next',
            status: 503
        })
        expect(JSON.stringify(report)).not.toContain('CANARY_')
        expect(JSON.stringify(report)).not.toContain('audit.fixture.test')
    } finally {
        network.dispose()
    }
})

test('J7 closed-page state is unavailable rather than fabricated', async ({
    page
}) => {
    await page.close()
    const report = await collectRecommendationBatchFailureV1({
        page,
        before: { label: 'CANARY_LABEL', ids: ['CANARY_ID'] },
        round: 2,
        phase: 'next-batch',
        timeoutMs: 15000,
        error: { name: 'TimeoutError' }
    })
    expect(report.pageStateStatus).toBe('UNAVAILABLE')
    expect(report.pageFlags).toBeNull()
    expect(report.cardCount).toBeNull()
    expect(JSON.stringify(report)).not.toContain('CANARY_')
})
