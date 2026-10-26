import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { updaterSelfReplacement } from '../../src/update/path-safety'
import {
    auditReleasedUpgradePaths,
    observeLegacyLaunch,
    RELEASED_INCREMENTAL_SHA256
} from '../../scripts/audit-released-upgrade-paths.mjs'

const argument = {
    launcherPath: 'X:\\inert\\Pica Library.exe',
    runtimePath: 'X:\\inert\\node.exe',
    desktopEntryPath: 'X:\\inert\\desktop.js'
}
const options = {
    name: 'launch',
    fsAlias: 'files',
    spawnAlias: 'spawn',
    packaged: true,
    argument
}

describe('legacy audit is a counterexample, not a current-source/installed-upgrade PASS', () => {
    it.each([true, false])(
        'observes unsafe packaged=%s launch without a real child or filesystem',
        async (packaged) => {
            const result = await observeLegacyLaunch(
                'function launch(input){const child=spawn(files.existsSync(input.launcherPath)?input.launcherPath:input.runtimePath,[],{detached:true,windowsHide:true});child.unref()}',
                { ...options, packaged }
            )
            expect(result).toMatchObject({
                returnedPromise: false,
                childErrorListenersAfterReturn: 0,
                asynchronousErrorEscapedFunction: true,
                promiseOutcomeAfterError: null
            })
            expect(result.launches).toEqual([
                {
                    executable: packaged ? 'Pica Library.exe' : 'node.exe',
                    argumentCount: 0,
                    detached: true,
                    windowsHide: true
                }
            ])
        }
    )
    it('distinguishes an awaited asynchronous startup rejection from an unhandled error', async () => {
        const result = await observeLegacyLaunch(
            'function launch(input){return new Promise((resolve,reject)=>{const child=spawn(input.launcherPath,[],{detached:true,windowsHide:true});child.once("error",reject);child.unref()})}',
            options
        )
        expect(result).toMatchObject({
            returnedPromise: true,
            childErrorListenersAfterReturn: 1,
            asynchronousErrorEscapedFunction: false,
            promiseOutcomeAfterError: 'EACCES'
        })
    })
    it('does not mistake a swallowed child error for an awaited startup contract', async () => {
        const result = await observeLegacyLaunch(
            'function launch(input){const child=spawn(input.launcherPath,[],{detached:true,windowsHide:true});child.once("error",()=>{});child.unref()}',
            options
        )
        expect(result).toMatchObject({
            returnedPromise: false,
            childErrorListenersAfterReturn: 1,
            asynchronousErrorEscapedFunction: false,
            promiseOutcomeAfterError: null
        })
    })
    it('pins the incremental helper identity separately from the full helper', () => {
        expect(RELEASED_INCREMENTAL_SHA256).toBe(
            'daee49a07795b985820e9bf1cf53050b256026bd2feff3a1d4573348ba896dfa'
        )
    })
    it.each(['app/updater.js', 'app/UPDATER.js', 'app\\Updater.JS'])(
        'keeps the current updater self-replacement guard case-insensitive: %s',
        (file) => {
            expect(updaterSelfReplacement([file])).toBe(true)
        }
    )
    it('rejects malformed extraction names instead of evaluating an injected suffix', async () => {
        await expect(
            observeLegacyLaunch('function launch(){}', {
                ...options,
                name: 'launch;throw Error()'
            })
        ).rejects.toThrow()
    })
    it('rejects different archive bytes before parsing or evaluating their contents', async () => {
        const root = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-legacy-audit-')
        )
        try {
            const archive = path.join(root, 'not-the-pinned-release.zip')
            fs.writeFileSync(
                archive,
                'not a ZIP; no source should be evaluated'
            )
            await expect(auditReleasedUpgradePaths(archive)).rejects.toThrow(
                /Reject any different release/
            )
        } finally {
            fs.rmSync(root, { recursive: true, force: true })
        }
    })
})
