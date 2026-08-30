import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import AdmZip from 'adm-zip'
import { createHash } from 'node:crypto'

const root = path.resolve(import.meta.dirname, '..')
const baseZip = path.join(
    root,
    'artifacts',
    'Pica-Library-v0.2.0-windows-x64.zip'
)
const updateZip = path.join(root, 'artifacts', 'Pica-Library-v0.3.0-update.zip')
const rootTemp = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pica-v3-updater-process-')
)

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
function hash(file: string) {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}
function expand(zipFile: string, destination: string) {
    fs.mkdirSync(destination, { recursive: true })
    new AdmZip(zipFile).extractAllTo(destination, true)
}
function parseProgress(file: string) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8')) as {
            phase?: string
            message?: string
        }
    } catch {
        return null
    }
}
async function waitPhase(file: string, phase: string, timeout = 90_000) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
        const progress = parseProgress(file)
        if (progress?.phase === phase) return progress
        await wait(250)
    }
    throw new Error(`updater did not reach ${phase}`)
}
function writeInstruction(input: {
    install: string
    local: string
    broken: boolean
}) {
    const zip = new AdmZip(updateZip)
    const manifest = JSON.parse(
        zip.readAsText('update-manifest.json')
    ) as Record<string, unknown> & {
        files: Array<{ path: string }>
        deletions: string[]
    }
    const stage = path.join(input.local, 'stage')
    fs.mkdirSync(stage, { recursive: true })
    for (const item of manifest.files) {
        if (input.broken && item.path === 'app/pica-library.js') continue
        const entry = zip.getEntry(item.path)
        if (!entry) continue
        const destination = path.join(stage, ...item.path.split('/'))
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        fs.writeFileSync(destination, entry.getData())
    }
    if (input.broken) {
        const broken = path.join(stage, 'app', 'desktop.js')
        fs.writeFileSync(
            broken,
            `throw new Error('synthetic health failure')\n`,
            'utf8'
        )
        const source = manifest.files.find(
            (item) => item.path === 'app/desktop.js'
        )
        if (source) source.path = 'app/desktop.js'
        manifest.files = [{ path: 'app/desktop.js' }]
        manifest.deletions = []
    }
    const progress = path.join(input.local, 'progress.json')
    const instruction = path.join(input.local, 'instruction.json')
    fs.writeFileSync(
        instruction,
        JSON.stringify({
            // The desktop parent is already stopped for this direct updater
            // process-level simulation. A deliberately impossible PID makes the
            // helper proceed without scanning or terminating unrelated processes.
            parentPid: 999999,
            applicationRoot: input.install,
            stagingRoot: stage,
            backupRoot: path.join(input.local, 'backup'),
            manifest,
            launcherPath: path.join(input.install, 'Pica Library.exe'),
            runtimePath: path.join(input.install, 'runtime', 'node.exe'),
            desktopEntryPath: path.join(input.install, 'app', 'desktop.js'),
            instanceFile: path.join(
                input.local,
                'Pica Library',
                'runtime-state',
                'instance.json'
            ),
            progressFile: progress,
            healthTimeoutMs: input.broken ? 5_000 : 30_000
        }),
        'utf8'
    )
    return { instruction, progress }
}
async function runScenario(broken: boolean) {
    const scenario = path.join(rootTemp, broken ? 'rollback' : 'success')
    const install = path.join(scenario, 'install')
    const local = path.join(scenario, 'localappdata')
    expand(baseZip, install)
    fs.mkdirSync(local, { recursive: true })
    const retainedDataFile = path.join(
        local,
        'Pica Library',
        'data',
        'retention-sentinel.txt'
    )
    fs.mkdirSync(path.dirname(retainedDataFile), { recursive: true })
    fs.writeFileSync(retainedDataFile, 'retain-across-update', 'utf8')
    const oldDesktopHash = hash(path.join(install, 'app', 'desktop.js'))
    const { instruction, progress } = writeInstruction({
        install,
        local,
        broken
    })
    const child = spawn(
        path.join(install, 'runtime', 'node.exe'),
        [path.join(install, 'app', 'updater.js'), instruction],
        {
            cwd: install,
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            env: { ...process.env, LOCALAPPDATA: local }
        }
    )
    child.unref()
    const final = await waitPhase(
        progress,
        broken ? 'failed' : 'complete',
        broken ? 45_000 : 90_000
    )
    const restored =
        hash(path.join(install, 'app', 'desktop.js')) === oldDesktopHash
    let atlasCleanUpdate: boolean | null = null
    let recommendationCleanUpdate: boolean | null = null
    let version: string | null = null
    try {
        const instance = JSON.parse(
            fs.readFileSync(
                path.join(
                    local,
                    'Pica Library',
                    'runtime-state',
                    'instance.json'
                ),
                'utf8'
            )
        ) as { url?: string }
        if (instance.url) {
            const status = (await fetch(
                `${instance.url}/api/v1/desktop/status`
            ).then((response) => response.json())) as {
                csrfToken?: string
                version?: string
            }
            version = status.version ?? null
            if (status.csrfToken && !broken) {
                const headers = {
                    'content-type': 'application/json',
                    'x-pica-csrf': status.csrfToken,
                    origin: instance.url
                }
                const atlas = (await fetch(
                    `${instance.url}/api/v1/recommendation/profile/rebuild`,
                    { method: 'POST', headers, body: '{}' }
                ).then((response) => response.json())) as {
                    available?: boolean
                    snapshot?: { snapshotVersion?: number }
                }
                atlasCleanUpdate =
                    atlas.available === true &&
                    atlas.snapshot?.snapshotVersion === 2
                const recommendation = (await fetch(
                    `${instance.url}/api/v1/recommendations`,
                    { method: 'POST', headers, body: '{"limit":12}' }
                ).then((response) => response.json())) as {
                    engine?: unknown
                    recommendations?: unknown
                }
                recommendationCleanUpdate =
                    Boolean(recommendation.engine) &&
                    Array.isArray(recommendation.recommendations)
            }
            if (status.csrfToken)
                await fetch(`${instance.url}/api/v1/desktop/shutdown`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-pica-csrf': status.csrfToken,
                        origin: instance.url
                    },
                    body: '{}'
                })
        }
    } catch {
        /* a deliberately broken app may not expose a healthy endpoint */
    }
    await wait(1500)
    return {
        phase: final.phase,
        rollbackRestored: restored,
        version,
        atlasCleanUpdate,
        recommendationCleanUpdate,
        userDataRetained:
            fs.existsSync(retainedDataFile) &&
            fs.readFileSync(retainedDataFile, 'utf8') ===
                'retain-across-update',
        message: final.message ?? null
    }
}
try {
    const success = await runScenario(false)
    const rollback = await runScenario(true)
    console.log(JSON.stringify({ success, rollback }, null, 2))
} finally {
    await wait(1000)
    try {
        fs.rmSync(rootTemp, {
            recursive: true,
            force: true,
            maxRetries: 8,
            retryDelay: 500
        })
    } catch {
        /* detached Windows handles may release shortly after exit */
    }
}
