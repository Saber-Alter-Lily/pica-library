import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import { LibraryDatabase } from '../../src/library/database'
import { qualifyV050HistoricalFixtureReadOnly,
    V050_HISTORY_QA_MARKER, V050_HISTORY_QA_MARKER_TEXT
} from '../../src/desktop/v050-historical-fixture-gate'
import { inventoryV050OwnedMediaSyntheticReadOnly } from
    '../../src/desktop/v050-owned-media-inventory-qa'

const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')

const cleanup: string[] = []
afterEach(() => {
    for (const item of cleanup.splice(0))
        fs.rmSync(item, {recursive: true, force: true,
            maxRetries: 15, retryDelay: 100})
})

function fixture() {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(),
        'pica-v050-history-qa-'))
    cleanup.push(sandbox)
    fs.writeFileSync(path.join(sandbox, V050_HISTORY_QA_MARKER),
        V050_HISTORY_QA_MARKER_TEXT, { flag: 'wx' })
    const profile = path.join(sandbox, 'profile')
    const data = path.join(profile, 'data')
    const config = path.join(profile, 'config')
    const cache = path.join(profile, 'cache')
    const downloaded = path.join(data, 'downloaded')
    for(const folder of [config,downloaded,cache])
        fs.mkdirSync(folder,{recursive:true})
    const dbFile = path.join(data,'library.db')
    const mediaFile = path.join(downloaded,'one.png')
    const mediaBytes = Buffer.from('SYNTHETIC_IMAGE_BODY_NOT_USER_CONTENT')
    fs.writeFileSync(mediaFile,mediaBytes)
    fs.writeFileSync(path.join(cache, 'cover.webp'),'SYNTHETIC_COVER')
    const db = new LibraryDatabase(dbFile)
    db.importFavorites([{
        comicId:'synthetic:media-work',title:'Synthetic Media',
        author:'Synthetic Creator',categories:['QA'], tags:['test'],
        finished:false,pagesCount:1,epsCount:1
    }], 'synthetic-import', true, true)
    db.upsertEpisode({id:'synthetic:chapter',comicId:'synthetic:media-work',
        title:'Chapter 1', order:1})
    db.upsertPicture({id:'synthetic:picture',comicId:'synthetic:media-work',
        episodeId:'synthetic:chapter',position:1,originalName:'one.png',
        mediaPath:'synthetic/image',fileServer:'invalid.example'})
    db.markPictureDownloaded('synthetic:picture',mediaFile,mediaBytes.length,
        'b'.repeat(64))
    db.close()
    fs.writeFileSync(path.join(config,'config.json'),JSON.stringify({
        schemaVersion:1,libraryDirectory:data,profile:'balanced',
        openBrowser:true,preferredPort:4789
    }))
    return {sandbox,profile,data,config,cache,downloaded,dbFile,
        mediaFile,mediaBytes}
}
function adjust(file:string, sql:string, params:unknown[]) {
    const connection = new DatabaseSync(file)
    try {
        connection.exec('PRAGMA journal_mode=DELETE')
        connection.prepare(sql).run(...(params as Array<string | number | null>))
    } finally {
        connection.close()
    }
}
const expectedSafety = {
    productionMigrationAuthorized:false,
    externalMediaInspected:false,
    realUserProfileTouched:false,
    fileContentsVerified:false,
    crossFileAtomicityProven:false
}

describe('v0.5 synthetic owned media inventory — no source files read/written', () => {
    it('classifies only owned files and SQLite media references by metadata', () => {
        const f = fixture()
        expect(qualifyV050HistoricalFixtureReadOnly(f.sandbox).status)
            .toBe('QUALIFIED_SYNTHETIC_RELEASE_LAYOUT')
        const before = fs.readFileSync(f.mediaFile)
        const result = inventoryV050OwnedMediaSyntheticReadOnly(f.sandbox)
        expect(result).toMatchObject({
            ...expectedSafety, status:'SYNTHETIC_MEDIA_METADATA_ONLY',
            mediaFileCount:2,
            referencedDownloadedPictures:1,
            metadataTotalBytes:f.mediaBytes.length +
                Buffer.byteLength('SYNTHETIC_COVER')
        })
        expect(fs.readFileSync(f.mediaFile)).toEqual(before)
        expect(JSON.stringify(result)).not.toContain(f.sandbox)
        expect(fs.existsSync(f.dbFile+'-wal')).toBe(false)
        expect(fs.existsSync(f.dbFile+'-shm')).toBe(false)
    })

    it('rejects unconsented outside data references without resolving or opening them', () => {
        const f = fixture()
        const outside = path.join(os.tmpdir(),
            'pica-v050-unconsented-media-never-exists-'+path.basename(f.sandbox))
        expect(fs.existsSync(outside)).toBe(false)
        adjust(f.dbFile,
            "UPDATE pictures SET local_path=? WHERE id='synthetic:picture'",
            [outside])
        expect(inventoryV050OwnedMediaSyntheticReadOnly(f.sandbox))
            .toMatchObject({...expectedSafety,status:'REVIEW_REQUIRED',
                reason:'EXTERNAL_MEDIA_REFERENCE_NEEDS_CONSENT'})
        expect(fs.existsSync(outside)).toBe(false)
    })

    it('reports missing referenced media and metadata size inconsistency', () => {
        const f=fixture()
        fs.unlinkSync(f.mediaFile)
        expect(inventoryV050OwnedMediaSyntheticReadOnly(f.sandbox))
            .toMatchObject({status:'REVIEW_REQUIRED',reason:'MEDIA_REFERENCE_MISSING'})
        fs.writeFileSync(f.mediaFile,f.mediaBytes)
        adjust(f.dbFile,
            "UPDATE pictures SET byte_size=? WHERE id='synthetic:picture'",
            [f.mediaBytes.length+1])
        expect(inventoryV050OwnedMediaSyntheticReadOnly(f.sandbox))
            .toMatchObject({status:'REVIEW_REQUIRED',reason:'MEDIA_SIZE_MISMATCH'})
    })

    it('refuses hardlinked files in owned tree without reading them', () => {
        const f=fixture()
        const second=path.join(f.downloaded,'hardlink.png')
        fs.linkSync(f.mediaFile,second)
        expect(inventoryV050OwnedMediaSyntheticReadOnly(f.sandbox))
            .toMatchObject({status:'BLOCKED',reason:'MEDIA_LINK_OR_HARDLINK_FORBIDDEN'})
        expect(fs.readFileSync(f.mediaFile)).toEqual(f.mediaBytes)
    })

    it('refuses a symbolic-link/junction directory instead of traversing it', () => {
        const f=fixture()
        const external=path.join(f.sandbox,'untrusted-contents')
        fs.mkdirSync(external)
        fs.writeFileSync(path.join(external,'do-not-scan.txt'),
            'PRIVATE_TEST_MARKER')
        const link=path.join(f.downloaded,'dangerous-link')
        fs.symlinkSync(external,link,process.platform==='win32'?'junction':'dir')
        expect(inventoryV050OwnedMediaSyntheticReadOnly(f.sandbox))
            .toMatchObject({status:'BLOCKED',reason:'MEDIA_LINK_OR_HARDLINK_FORBIDDEN'})
        expect(fs.readFileSync(path.join(external,'do-not-scan.txt'),'utf8'))
            .toBe('PRIVATE_TEST_MARKER')
    })

    it('requires review for oversized sparse files instead of reading/copying them', () => {
        const f=fixture()
        const oversize=path.join(f.downloaded,'too-big.bin')
        const handle=fs.openSync(oversize,'wx')
        try {fs.ftruncateSync(handle,64*1024*1024+1)}
        finally {fs.closeSync(handle)}
        expect(inventoryV050OwnedMediaSyntheticReadOnly(f.sandbox))
            .toMatchObject({status:'REVIEW_REQUIRED',
                reason:'MEDIA_BUDGET_REQUIRES_REVIEW'})
        expect(fs.statSync(oversize).size).toBe(64*1024*1024+1)
    })

    it('blocks an unqualified DB/lock before inspecting media metadata', () => {
        const f=fixture()
        const lockFolder=path.join(f.profile,'runtime-state')
        fs.mkdirSync(lockFolder)
        fs.writeFileSync(path.join(lockFolder,'instance.lock'),'synthetic-lock')
        expect(inventoryV050OwnedMediaSyntheticReadOnly(f.sandbox))
            .toMatchObject({status:'BLOCKED',
                reason:'HISTORICAL_GATE_NOT_QUALIFIED',
                ...expectedSafety})
    })

    it('does not import provider SDKs, copy media or use a writable SQLite connection', () => {
        const code=fs.readFileSync(
            'src/desktop/v050-owned-media-inventory-qa.ts','utf8')
        expect(code).not.toMatch(/fs\.(?:writeFile|copyFile|appendFile|rename|unlink|mkdir|rm)Sync\(/)
        expect(code).not.toMatch(/from ['"][^'"]*(?:providers|provider-service|sdk|updater|source-hosts)/)
        expect(code).toContain('readOnly: true')
        expect(code).toContain("immutable")
        expect(code).not.toMatch(/new LibraryDatabase\s*\(/)
    })
})
