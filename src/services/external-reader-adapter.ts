import { spawn } from 'node:child_process'
import { sanitizedChildEnv, windowsExecutable } from '../desktop/child-process'

export class ExternalReaderAdapter {
    openDefault(file: string) {
        if (process.platform !== 'win32')
            throw new Error('默认阅读器集成目前仅支持 Windows')
        const child = spawn(windowsExecutable('explorer.exe'), [file], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            env: sanitizedChildEnv()
        })
        child.unref()
        return { opened: true }
    }
}
