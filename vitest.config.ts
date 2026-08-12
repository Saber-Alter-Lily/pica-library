import { defineConfig } from 'vitest/config'

// https://cn.vitest.dev/
export default defineConfig({
    ssr: {
        external: ['node:sqlite']
    },
    test: {
        include: ['test/{unit,integration}/**/*.test.ts'],
        testTimeout: 10000
    }
})
