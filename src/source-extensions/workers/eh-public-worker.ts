import { EH_PUBLIC_WORKER_ID } from '../eh-public-identity'
import { createEhPublicReaderTransport } from '../eh-public-reader-transport'

/**
 * Standalone OPTIONAL first-party E-H public-read worker.
 *
 * Build as an independently signed, single-file CJS worker; the default
 * Desktop/Android core MUST NOT import or ship this entry. The parent alone
 * owns installation, explicit activation, session, revocation and progress.
 * No login/credentials, favorites, downloads, self-update or arbitrary URLs.
 */
const transport = createEhPublicReaderTransport()
let admittedSession: string | null = null

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function handle(value: unknown) {
    if (!record(value) || value.version !== 1 ||
        !Number.isSafeInteger(value.id) || Number(value.id) < 1 ||
        typeof value.session !== 'string' ||
        !/^[0-9a-f]{32}$/.test(value.session) ||
        typeof value.operation !== 'string')
        return

    const session = value.session
    const id = Number(value.id)
    const reply = (ok: boolean, result: unknown) => {
        if (!process.connected) return
        process.send?.(ok
            ? { version: 1, session, id, ok: true, data: result }
            : { version: 1, session, id, ok: false, error: 'E-H worker operation failed' })
    }
    try {
        if (value.operation === 'hello') {
            if (admittedSession !== null || Object.keys(value).sort().join(',') !==
                'id,operation,session,version')
                throw new Error('Invalid E-H worker handshake')
            admittedSession = session
            reply(true, { apiVersion: 1, sourceId: EH_PUBLIC_WORKER_ID })
            return
        }
        if (session !== admittedSession) throw new Error('Session is not admitted')
        if (value.operation === 'episodes' &&
            Object.keys(value).sort().join(',') === 'comicId,id,operation,session,version') {
            reply(true, await transport.episodes(String(value.comicId)))
            return
        }
        if (value.operation === 'pages' &&
            Object.keys(value).sort().join(',') ===
                'comicId,episodeId,id,operation,session,version') {
            reply(true, await transport.pages(
                String(value.comicId), String(value.episodeId)
            ))
            return
        }
        if (value.operation === 'media' &&
            Object.keys(value).sort().join(',') ===
                'comicId,id,operation,pageKey,session,version') {
            const media = await transport.media(
                String(value.comicId), String(value.pageKey)
            )
            reply(true, {
                base64: Buffer.from(media.bytes).toString('base64'),
                contentType: media.contentType
            })
            return
        }
        throw new Error('Unsupported source operation')
    } catch {
        // Source-specific backend errors and URLs stay out of the IPC contract.
        reply(false, null)
    }
}

process.on('message', (value: unknown) => {
    void handle(value)
})
