import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const WEBDAV_SERVER_VERSION = '2.6.2'

function command(name) {
    return process.platform === 'win32' ? `${name}.cmd` : name
}

function run(commandName, args, options = {}) {
    const result = spawnSync(commandName, args, {
        cwd: options.cwd ?? process.cwd(),
        env: options.env ?? process.env,
        stdio: 'inherit',
        windowsHide: true
    })
    if (result.status !== 0)
        throw new Error(
            `${commandName} ${args.join(' ')} failed with ${result.status}`
        )
}

function safeEnvironment(extra = {}) {
    const env = { ...process.env, ...extra }
    for (const key of Object.keys(env))
        if (/^PICA_(ACCOUNT|PASSWORD|PROXY|TOKEN|COOKIE|AUTHORIZATION)$/i.test(key))
            delete env[key]
    return env
}

function main() {
    const toolRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-j9-webdav-tool-'))
    fs.writeFileSync(
        path.join(toolRoot, 'package.json'),
        JSON.stringify({ private: true }) + '\n',
        'utf8'
    )

    try {
        run(
            command('pnpm'),
            [
                '--dir',
                toolRoot,
                'add',
                '--save-dev',
                `webdav-server@${WEBDAV_SERVER_VERSION}`
            ],
            { env: safeEnvironment() }
        )
        run(
            command('pnpm'),
            [
                'exec',
                'tsx',
                'scripts/benchmark/desktop-webdav-load-harness.ts',
                ...process.argv.slice(2)
            ],
            {
                env: safeEnvironment({
                    PICA_WEBDAV_TOOL_ROOT: toolRoot
                })
            }
        )
    } finally {
        fs.rmSync(toolRoot, { recursive: true, force: true })
    }
}

try {
    main()
} catch (error) {
    console.error(error)
    process.exitCode = 1
}
