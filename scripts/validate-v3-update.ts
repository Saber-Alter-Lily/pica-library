import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { UpdateManager } from '../src/update/manager'

const root = path.resolve(import.meta.dirname, '..')
const updateFile = path.join(
    root,
    'artifacts',
    'Pica-Library-v0.3.0-update.zip'
)
const archive = fs.readFileSync(updateFile)
const zip = new AdmZip(archive)
const manifest = JSON.parse(zip.readAsText('update-manifest.json')) as {
    sourceSha: string
    targetSourceSha: string
}
const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pica-v3-update-validation-')
)
const fetchImplementation = async () =>
    new Response(
        JSON.stringify({
            tag_name: 'v0.3.0',
            draft: false,
            prerelease: false,
            assets: [
                {
                    name: 'Pica-Library-v0.3.0-update.zip',
                    digest: `sha256:${createHash('sha256').update(archive).digest('hex')}`
                }
            ]
        }),
        { status: 200 }
    )
try {
    const manager = new UpdateManager({
        currentVersion: '0.2.0',
        currentSourceSha: manifest.sourceSha,
        applicationRoot: temp,
        stateRoot: path.join(temp, 'state'),
        launcherPath: path.join(temp, 'Pica Library.exe'),
        runtimePath: process.execPath,
        desktopEntryPath: path.join(temp, 'app', 'desktop.js'),
        instanceFile: path.join(temp, 'instance.json'),
        fetchImplementation: fetchImplementation as typeof fetch
    })
    const staged = await manager.stage(
        'Pica-Library-v0.3.0-update.zip',
        archive
    )
    console.log(
        JSON.stringify(
            {
                staged: true,
                targetSourceSha: manifest.targetSourceSha,
                manifest: staged.manifest
            },
            null,
            2
        )
    )
} finally {
    fs.rmSync(temp, { recursive: true, force: true })
}
