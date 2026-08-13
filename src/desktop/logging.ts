import fs from 'node:fs'
import path from 'node:path'

export function redactLog(value: string) {
    return value
        .replace(
            /(password|account|authorization|cookie|token)\s*[:=]\s*[^\s,}]+/gi,
            '$1=[REDACTED]'
        )
        .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@')
}

export class DesktopLog {
    readonly file: string
    constructor(directory: string) {
        fs.mkdirSync(directory, { recursive: true })
        this.file = path.join(directory, 'pica-library.log')
    }
    write(message: string) {
        fs.appendFileSync(
            this.file,
            `${new Date().toISOString()} ${redactLog(message)}\n`,
            'utf8'
        )
    }
}
