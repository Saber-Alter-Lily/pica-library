import { performance } from 'node:perf_hooks'

type Size = 'small' | 'medium' | 'large'
const jobsBySize: Record<Size, number> = { small: 5, medium: 20, large: 100 }
const size = (process.argv[2] ?? 'small') as Size
if (!(size in jobsBySize))
    throw new Error('Size must be small, medium or large')
const jobs = jobsBySize[size]
const start = performance.now()
let bytes = 0
for (let index = 0; index < jobs; index += 1) {
    const payload = Buffer.alloc(64 * 1024, index % 255)
    bytes += payload.byteLength
}
const wallTimeMs = performance.now() - start
console.log(
    JSON.stringify(
        {
            kind: 'scheduler-harness-only',
            size,
            jobs,
            wallTimeMs,
            bytes,
            throughputBytesPerSecond:
                bytes / Math.max(wallTimeMs / 1000, 0.001),
            successRate: 1,
            retryCount: 0,
            failureCount: 0,
            artifactUploadTimeMs: null,
            warning:
                'Synthetic harness. This is not a real Pica download benchmark.'
        },
        null,
        2
    )
)
