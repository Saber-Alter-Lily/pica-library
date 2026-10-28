'use strict'

// A disposable in-repository worker used ONLY for the S3 process test.
// No third-party protocols, credentials, storage, HTTP or content are used.
process.on('message', (packet) => {
    if (!packet || packet.version !== 1 ||
        typeof packet.session !== 'string' ||
        !Number.isSafeInteger(packet.id))
        return
    const reply = (value) => {
        if (process.connected)
            process.send({
                version: 1, session: packet.session, id: packet.id,
                ok: true, data: value
            })
    }
    if (packet.operation === 'hello') {
        reply({ apiVersion: 1, sourceId: 'demo' })
        return
    }
    if (packet.operation === 'episodes') {
        if (packet.comicId === 'demo:bad-chapters') {
            reply([{ id: 'dup', title: 'A', order: 1 }, { id: 'dup', title: 'B', order: 2 }])
            return
        }
        reply([{ id: 'chapter-1', title: 'Offline QA', order: 1 }])
        return
    }
    if (packet.operation === 'pages') {
        if (packet.comicId === 'demo:bad-pages') {
            reply([{ key: 'p1' }, { key: 'p1' }])
            return
        }
        reply([{ key: 'p1' }, { key: 'slow' }, { key: 'never' },
            { key: 'crash' }, { key: 'invalid' }, { key: 'env' }])
        return
    }
    if (packet.operation === 'media') {
        if (packet.pageKey === 'never') return
        if (packet.pageKey === 'crash') process.exit(17)
        if (packet.pageKey === 'invalid') {
            reply({ base64: '@@@', contentType: 'image/svg+xml' })
            return
        }
        const bytes = packet.pageKey === 'env'
            ? Buffer.from(process.env.PICA_SECRET_FOR_TEST || 'not-inherited', 'utf8')
            : Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
        const send = () => reply({
            base64: bytes.toString('base64'), contentType: 'image/png'
        })
        if (packet.pageKey === 'slow') setTimeout(send, 400)
        else send()
    }
})
