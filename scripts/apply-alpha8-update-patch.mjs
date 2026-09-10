import fs from 'node:fs'

function replaceOnce(file, before, after) {
    const source = fs.readFileSync(file, 'utf8')
    if (source.includes(after)) return
    if (!source.includes(before))
        throw new Error(`Alpha8 update patch anchor missing in ${file}: ${before.slice(0, 100)}`)
    const first = source.indexOf(before)
    if (source.indexOf(before, first + before.length) >= 0)
        throw new Error(`Alpha8 update patch anchor is not unique in ${file}`)
    fs.writeFileSync(file, source.replace(before, after), 'utf8')
}

replaceOnce(
    'src/library/server.ts',
    `async function downloadUpdateAsset(
    value: string,
    limit = 128 * 1024 * 1024
): Promise<Buffer> {
    const target = new URL(value)
    if (target.protocol !== 'https:')
        throw new Error('Official update URL must use HTTPS')
    const response = await fetch(target, {
        redirect: 'follow',
        headers: { 'user-agent': 'Pica-Library-UpdateDownloader' },
        signal: AbortSignal.timeout(120_000)
    })
    if (!response.ok)
        throw new Error(
            \`Official update download failed: HTTP \${response.status}\`
        )
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (Number.isFinite(declared) && declared > limit)
        throw new Error('Official update package is too large')
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > limit)
        throw new Error('Official update package is too large')
    return buffer
}
`,
    `async function downloadUpdateAsset(
    value: string,
    limit = 128 * 1024 * 1024,
    onProgress?: (current: number, total: number | null) => void,
    signal?: AbortSignal
): Promise<Buffer> {
    const target = new URL(value)
    if (target.protocol !== 'https:')
        throw new Error('Official update URL must use HTTPS')
    const timeout = AbortSignal.timeout(120_000)
    const combinedController = new AbortController()
    const forwardAbort = () => combinedController.abort()
    timeout.addEventListener('abort', forwardAbort, { once: true })
    signal?.addEventListener('abort', forwardAbort, { once: true })
    const response = await fetch(target, {
        redirect: 'follow',
        headers: { 'user-agent': 'Pica-Library-UpdateDownloader' },
        signal: combinedController.signal
    })
    if (!response.ok)
        throw new Error(
            \`Official update download failed: HTTP \${response.status}\`
        )
    const declaredRaw = Number(response.headers.get('content-length') ?? 0)
    const declared = Number.isFinite(declaredRaw) && declaredRaw > 0 ? declaredRaw : null
    if (declared !== null && declared > limit)
        throw new Error('Official update package is too large')
    if (!response.body) {
        const fallback = Buffer.from(await response.arrayBuffer())
        if (fallback.byteLength > limit)
            throw new Error('Official update package is too large')
        onProgress?.(fallback.byteLength, declared)
        return fallback
    }
    const chunks: Buffer[] = []
    let size = 0
    const reader = response.body.getReader()
    while (true) {
        const { done, value: chunk } = await reader.read()
        if (done) break
        const buffer = Buffer.from(chunk)
        size += buffer.byteLength
        if (size > limit) {
            await reader.cancel('Update package is too large')
            throw new Error('Official update package is too large')
        }
        chunks.push(buffer)
        onProgress?.(size, declared)
    }
    return Buffer.concat(chunks)
}
`
)

replaceOnce(
    'src/library/server.ts',
    `    const previewCache = new PreviewCacheManager(
        path.join(options.cacheDir ?? options.service.dataDir, 'previews')
    )
`,
    `    const previewCache = new PreviewCacheManager(
        path.join(options.cacheDir ?? options.service.dataDir, 'previews')
    )
    let updateDownloadController: AbortController | null = null
    let updateDownloadProgress: Record<string, unknown> | null = null
    const writeUpdateDownloadProgress = (value: Record<string, unknown>) => {
        updateDownloadProgress = { ...value, updatedAt: new Date().toISOString() }
    }
`
)

replaceOnce(
    'src/library/server.ts',
    `            if (
                url.pathname === '/api/v1/update/progress' &&
                request.method === 'GET' &&
                options.desktop?.updateProgress
            ) {
                return json(response, 200, options.desktop.updateProgress())
            }
`,
    `            if (
                url.pathname === '/api/v1/update/progress' &&
                request.method === 'GET' &&
                options.desktop?.updateProgress
            ) {
                return json(
                    response,
                    200,
                    updateDownloadProgress ?? options.desktop.updateProgress()
                )
            }
            if (
                url.pathname === '/api/v1/update/cancel' &&
                request.method === 'POST'
            ) {
                if (
                    !options.desktop ||
                    request.headers['x-pica-csrf'] !== options.desktop.csrfToken
                )
                    return json(response, 403, {
                        error: 'This local request could not be verified'
                    })
                if (updateDownloadController) updateDownloadController.abort()
                updateDownloadController = null
                writeUpdateDownloadProgress({ phase: 'cancelled' })
                return json(response, 200, { success: true })
            }
`
)

replaceOnce(
    'src/library/server.ts',
    `                const staged = await options.desktop.stageUpdate(
                    assetName,
                    await downloadUpdateAsset(assetUrl)
                )
                return json(response, 200, staged)
`,
    `                if (updateDownloadController)
                    throw new Error('An update download is already running')
                updateDownloadController = new AbortController()
                writeUpdateDownloadProgress({
                    phase: 'downloading',
                    current: 0,
                    total: 0,
                    targetVersion: available.version
                })
                try {
                    const archive = await downloadUpdateAsset(
                        assetUrl,
                        128 * 1024 * 1024,
                        (current, total) =>
                            writeUpdateDownloadProgress({
                                phase: 'downloading',
                                current,
                                total: total ?? 0,
                                targetVersion: available.version
                            }),
                        updateDownloadController.signal
                    )
                    updateDownloadController = null
                    updateDownloadProgress = null
                    const staged = await options.desktop.stageUpdate(
                        assetName,
                        archive
                    )
                    return json(response, 200, staged)
                } catch (error) {
                    const cancelled =
                        error instanceof Error &&
                        (error.name === 'AbortError' || /abort/i.test(error.message))
                    updateDownloadController = null
                    writeUpdateDownloadProgress({
                        phase: cancelled ? 'cancelled' : 'failed',
                        error: cancelled
                            ? 'Update download was cancelled'
                            : error instanceof Error
                              ? error.message
                              : String(error),
                        targetVersion: available.version
                    })
                    if (cancelled)
                        return json(response, 409, {
                            error: 'Update download was cancelled'
                        })
                    throw error
                }
`
)

console.log('alpha8 desktop updater patch applied')
