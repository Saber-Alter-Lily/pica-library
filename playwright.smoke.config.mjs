import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './test/e2e',
    globalTimeout: 300_000,
    timeout: 45_000,
    workers: 1,
    retries: 0,
    reporter: [['line']],
    use: {
        baseURL:
            process.env.PICA_WEB_SMOKE_URL || 'http://127.0.0.1:4173',
        headless: true,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    }
})
