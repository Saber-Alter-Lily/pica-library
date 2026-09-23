import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
    DesktopNativePicker,
    desktopPickerStatus
} from '../../src/desktop/pickers'

function syncResult(
    status: number | null,
    stdout = '',
    stderr = '',
    error?: Error
) {
    return {
        pid: 1,
        output: [null, stdout, stderr],
        stdout,
        stderr,
        status,
        signal: null,
        error
    } as never
}

function childResult(input: {
    stdout?: string
    stderr?: string
    code?: number
}) {
    const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter
        stderr: EventEmitter
    }
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    queueMicrotask(() => {
        if (input.stdout) child.stdout.emit('data', input.stdout)
        if (input.stderr) child.stderr.emit('data', input.stderr)
        child.emit('exit', input.code ?? 0, null)
    })
    return child as never
}

describe('Desktop native picker P4B-2', () => {
    it('detects Windows/macOS and Linux picker backends without claiming a missing Linux backend', () => {
        expect(desktopPickerStatus('win32')).toEqual({
            backend: 'windows-winforms',
            folderPicker: true,
            savePicker: true
        })
        expect(desktopPickerStatus('darwin')).toEqual({
            backend: 'macos-osascript',
            folderPicker: true,
            savePicker: true
        })
        const zenity = desktopPickerStatus('linux', {
            spawnSyncProcess: ((command: string) =>
                command === 'zenity'
                    ? syncResult(0, '4.0')
                    : syncResult(
                          null,
                          '',
                          '',
                          Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
                      )) as never
        })
        expect(zenity.backend).toBe('linux-zenity')

        const kdialog = desktopPickerStatus('linux', {
            spawnSyncProcess: ((command: string) =>
                command === 'kdialog'
                    ? syncResult(0, '6.0')
                    : syncResult(
                          null,
                          '',
                          '',
                          Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
                      )) as never
        })
        expect(kdialog.backend).toBe('linux-kdialog')

        const unavailable = desktopPickerStatus('linux', {
            spawnSyncProcess: (() =>
                syncResult(
                    null,
                    '',
                    '',
                    Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
                )) as never
        })
        expect(unavailable).toEqual({
            backend: 'unavailable',
            folderPicker: false,
            savePicker: false
        })
    })

    it('uses macOS native folder/save dialogs and treats only explicit user cancellation as cancel', async () => {
        const calls: Array<{ command: string; args: string[] }> = []
        const successSpawn = ((command: string, args: string[]) => {
            calls.push({ command, args })
            return childResult({ stdout: '/Users/test/Library/\n' })
        }) as never
        const picker = new DesktopNativePicker(
            'darwin',
            successSpawn,
            (() => syncResult(0)) as never
        )
        await expect(picker.chooseFolder()).resolves.toBe(
            '/Users/test/Library/'
        )
        expect(calls[0].command).toBe('/usr/bin/osascript')
        expect(calls[0].args.join(' ')).toContain('choose folder')

        const cancel = new DesktopNativePicker(
            'darwin',
            ((command: string, args: string[]) => {
                calls.push({ command, args })
                return childResult({
                    stderr: 'execution error: User canceled. (-128)',
                    code: 1
                })
            }) as never,
            (() => syncResult(0)) as never
        )
        await expect(
            cancel.chooseSaveFile({
                title: 'Save',
                defaultName: 'test.zip',
                extension: 'zip'
            })
        ).resolves.toBeNull()

        const failure = new DesktopNativePicker(
            'darwin',
            (() =>
                childResult({
                    stderr: 'execution error: syntax error',
                    code: 1
                })) as never,
            (() => syncResult(0)) as never
        )
        await expect(failure.chooseFolder()).rejects.toThrow('syntax error')
    })

    it('uses the first available Linux native picker and keeps output parsing generic', async () => {
        const calls: Array<{ command: string; args: string[] }> = []
        const picker = new DesktopNativePicker(
            'linux',
            ((command: string, args: string[]) => {
                calls.push({ command, args })
                return childResult({ stdout: '/home/test/Manga\n' })
            }) as never,
            ((command: string) =>
                command === 'zenity'
                    ? syncResult(0)
                    : syncResult(
                          null,
                          '',
                          '',
                          Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
                      )) as never
        )
        await expect(picker.chooseFolder('Library')).resolves.toBe(
            '/home/test/Manga'
        )
        expect(calls[0].command).toBe('zenity')
        expect(calls[0].args).toContain('--directory')
    })

    it('keeps Windows selection behind the adapter and publishes picker capability truth', () => {
        const main = fs.readFileSync('src/desktop/main.ts', 'utf8')
        expect(main).toContain('const nativePicker = new DesktopNativePicker()')
        expect(main).toContain(
            'nativeFolderPicker: nativePicker.status.folderPicker'
        )
        expect(main).toContain(
            'nativeSavePicker: nativePicker.status.savePicker'
        )
        expect(main).toContain('nativePicker: nativePicker.status')
        expect(main).toContain('return await nativePicker.chooseFolder(')
        expect(main).toContain('return await nativePicker.chooseSaveFile({')
        expect(main).not.toContain('Windows.Forms.FolderBrowserDialog')
        expect(main).not.toContain('Windows.Forms.SaveFileDialog')

        const app = fs.readFileSync('web/app.js', 'utf8')
        expect(app).toContain('function applyDesktopPlatformCapabilities()')
        expect(app).toContain('platform.nativeFolderPicker')
        expect(app).toContain(
            "state.capabilities?.features?.updatePackages === false"
        )
        expect(app).toContain("desktop?.platform?.selfUpdate === false")
        expect(app).toContain(
            "button.hidden = !folderPicker"
        )
    })
})
