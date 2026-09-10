import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { resolveUpdatePath } from './path-safety'
import type { UpdateProgress, UpdaterInstruction } from './types'

function writeProgress(file: string, value: Omit<UpdateProgress, 'updatedAt'>) {
    fs.writeFileSync(
        file,
        JSON.stringify({ ...value, updatedAt: new Date().toISOString() }),
        'utf8'
    )
}

function alive(pid: number) {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

async function waitForExit(pid: number, timeoutMs = 30_000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
        if (!alive(pid)) return
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Pica Library did not exit before the update timeout')
}

function copyFile(source: string, destination: string) {
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    const temporary = `${destination}.pica-update-new`
    fs.copyFileSync(source, temporary)
    if (fs.existsSync(destination)) fs.rmSync(destination, { force: true })
    fs.renameSync(temporary, destination)
}

function launch(instruction: UpdaterInstruction) {
    const packaged = fs.existsSync(instruction.launcherPath)
    const child = packaged
        ? spawn(instruction.launcherPath, ['--no-open'], {
              detached: true,
              stdio: 'ignore',
              windowsHide: true
          })
        : spawn(
              instruction.runtimePath,
              [instruction.desktopEntryPath, '--no-open'],
              { detached: true, stdio: 'ignore', windowsHide: true }
          )
    child.unref()
}

async function health(instruction: UpdaterInstruction) {
    const started = Date.now()
    while (Date.now() - started < instruction.healthTimeoutMs) {
        try {
            const instance = JSON.parse(
                fs.readFileSync(instruction.instanceFile, 'utf8')
            ) as { url?: string }
            if (instance.url) {
                const response = await fetch(
                    `${instance.url}/api/v1/capabilities`,
                    {
                        signal: AbortSignal.timeout(1500)
                    }
                )
                const value = (await response.json()) as { appVersion?: string }
                if (
                    response.ok &&
                    value.appVersion === instruction.manifest.targetVersion
                )
                    return true
            }
        } catch {
            // Expected while the replacement app starts.
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return false
}

function backup(instruction: UpdaterInstruction) {
    fs.mkdirSync(instruction.backupRoot, { recursive: true })
    const existing: string[] = []
    for (const item of instruction.manifest.files) {
        const source = resolveUpdatePath(instruction.applicationRoot, item.path)
        if (!fs.existsSync(source)) continue
        const destination = resolveUpdatePath(instruction.backupRoot, item.path)
        copyFile(source, destination)
        existing.push(item.path)
    }
    for (const item of instruction.manifest.deletions) {
        const source = resolveUpdatePath(instruction.applicationRoot, item)
        if (!fs.existsSync(source)) continue
        const destination = resolveUpdatePath(instruction.backupRoot, item)
        copyFile(source, destination)
        existing.push(item)
    }
    fs.writeFileSync(
        path.join(instruction.backupRoot, 'existing.json'),
        JSON.stringify(existing),
        'utf8'
    )
}

function apply(instruction: UpdaterInstruction) {
    for (const item of instruction.manifest.files)
        copyFile(
            resolveUpdatePath(instruction.stagingRoot, item.path),
            resolveUpdatePath(instruction.applicationRoot, item.path)
        )
    for (const item of instruction.manifest.deletions)
        fs.rmSync(resolveUpdatePath(instruction.applicationRoot, item), {
            recursive: true,
            force: true
        })
}

function rollback(instruction: UpdaterInstruction) {
    const existing = new Set(
        JSON.parse(
            fs.readFileSync(
                path.join(instruction.backupRoot, 'existing.json'),
                'utf8'
            )
        ) as string[]
    )
    for (const item of instruction.manifest.files) {
        const destination = resolveUpdatePath(
            instruction.applicationRoot,
            item.path
        )
        if (existing.has(item.path))
            copyFile(
                resolveUpdatePath(instruction.backupRoot, item.path),
                destination
            )
        else fs.rmSync(destination, { recursive: true, force: true })
    }
    for (const item of instruction.manifest.deletions)
        if (existing.has(item))
            copyFile(
                resolveUpdatePath(instruction.backupRoot, item),
                resolveUpdatePath(instruction.applicationRoot, item)
            )
}

async function main() {
    const instructionFile = process.argv[2]
    if (!instructionFile) throw new Error('Updater instruction is required')
    const instruction = JSON.parse(
        fs.readFileSync(instructionFile, 'utf8')
    ) as UpdaterInstruction
    try {
        writeProgress(instruction.progressFile, {
            phase: 'waiting-for-exit',
            targetVersion: instruction.manifest.targetVersion
        })
        await waitForExit(instruction.parentPid)
        writeProgress(instruction.progressFile, {
            phase: 'preparing-backup',
            targetVersion: instruction.manifest.targetVersion
        })
        backup(instruction)
        writeProgress(instruction.progressFile, {
            phase: 'replacing-files',
            current: 0,
            total:
                instruction.manifest.files.length +
                instruction.manifest.deletions.length,
            targetVersion: instruction.manifest.targetVersion
        })
        apply(instruction)
        writeProgress(instruction.progressFile, {
            phase: 'starting',
            targetVersion: instruction.manifest.targetVersion
        })
        launch(instruction)
        writeProgress(instruction.progressFile, {
            phase: 'health-check',
            targetVersion: instruction.manifest.targetVersion
        })
        if (!(await health(instruction)))
            throw new Error('Updated application failed its health check')
        writeProgress(instruction.progressFile, {
            phase: 'complete',
            targetVersion: instruction.manifest.targetVersion
        })
    } catch (error) {
        writeProgress(instruction.progressFile, {
            phase: 'rollback',
            message: error instanceof Error ? error.message : String(error)
        })
        try {
            if (fs.existsSync(instruction.backupRoot)) rollback(instruction)
            launch(instruction)
        } catch (rollbackError) {
            writeProgress(instruction.progressFile, {
                phase: 'failed',
                message: `Update and rollback failed: ${String(rollbackError)}`
            })
            process.exitCode = 1
            return
        }
        writeProgress(instruction.progressFile, {
            phase: 'failed',
            message: error instanceof Error ? error.message : String(error)
        })
        process.exitCode = 1
    }
}

void main()
