import assert from 'node:assert/strict'

/** Real packaged application's existing scheduler/inventory/Reader; synthetic CI host only. */
export async function assertPackagedHostedOfflineChapter({ appOrigin, headers, command, sessionId, comicId, episodeId, png, tables, hostCalls }) {
    if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'win32') throw Error('Hosted offline application gate is CI-only')
    const chapters = await command({ action: 'download-chapters', sessionId, comicId })
    assert.equal(chapters.status, 200); assert.equal(chapters.value.chapters[0].id, episodeId)
    const before = tables(), calls = hostCalls()
    const save = { action: 'download-start', sessionId, comicId, episodeId, consent: true, acceptLocalCopy: true }
    for (const denied of [{ ...save, consent: false }, { ...save, acceptLocalCopy: false }]) assert.equal((await command(denied)).status, 400)
    assert.equal(hostCalls(), calls); assert.deepEqual(tables(), before)
    const started = await command(save); assert.equal(started.status, 200)
    let saved
    for (let attempt = 0; attempt < 200; attempt++) {
        const snapshot = await command({ action: 'downloads', sessionId }); assert.equal(snapshot.status, 200)
        saved = snapshot.value.jobs.find(job => job.id === started.value.id)
        assert.ok(saved); assert.ok(!['FAILED', 'CANCELLED'].includes(saved.status), 'Packaged owned chapter save failed: ' + saved.error)
        if (saved.status === 'COMPLETED') break
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(saved.status, 'COMPLETED'); assert.equal(saved.progressTotal, 2); assert.equal(saved.progressCompleted, 2)
    assert.match(saved.localComicId, /^local:[a-f0-9]{64}$/); assert.ok(saved.localEpisodeId.startsWith(saved.localComicId + ':chapter:'))
    const after = tables(), inventoryKey = 'local-library.inventory.' + saved.localComicId
    assert.equal(before.comics.some(row => row.id === saved.localComicId), false)
    const inventory = JSON.parse(after.app_state.find(row => row.key === inventoryKey).value_json)
    assert.equal(inventory.comicId, saved.localComicId); assert.equal(inventory.pages.length, 2); assert.equal(inventory.chapters.length, 1)
    // Permit exactly this accepted local book's rows and the already-owned Host
    // reference/progress keys; retain every pre-existing book and private state.
    const preserved = value => JSON.stringify(Object.fromEntries(Object.entries(value).map(([name, rows]) => [name, rows.filter(row => {
        if (name === 'app_state') return row.key !== inventoryKey && row.key !== 'host-reader-book-references-v1' && !/^host-reader-progress-v1:[0-9a-f]{64}$/.test(row.key)
        return row.comic_id !== saved.localComicId && !(name === 'comics' && row.id === saved.localComicId)
    }).map(row => JSON.stringify(row)).sort()])))
    assert.equal(preserved(after), preserved(before)); assert.deepEqual(after.download_jobs, before.download_jobs)
    return async function readAfterHostStopped() {
        const beforeRead = tables(), beforeCalls = hostCalls()
        const route = appOrigin + '/api/v1/reader/comics/' + encodeURIComponent(saved.localComicId) + '/chapters/' + encodeURIComponent(saved.localEpisodeId)
        const response = await fetch(route, { headers, signal: AbortSignal.timeout(20000) }); assert.equal(response.status, 200)
        const chapter = await response.json(); assert.equal(chapter.pages.length, 2)
        for (const page of chapter.pages) {
            const image = await fetch(appOrigin + '/api/v1/reader/pictures/' + encodeURIComponent(page.id), { headers, signal: AbortSignal.timeout(20000) })
            assert.equal(image.status, 200); assert.deepEqual(Buffer.from(await image.arrayBuffer()), png)
        }
        assert.equal(hostCalls(), beforeCalls); assert.deepEqual(tables(), beforeRead)
        return { packaged_host_local_copy: 'PASS', explicit_save_consent_required: true, complete_owned_pages: 2,
            same_local_reader_after_session_revoke_and_host_shutdown: true, existing_private_state_preserved: true,
            legacy_provider_download_queue_unchanged: true, credentials_persisted: false, real_provider_or_production_accessed: false }
    }
}
