import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import {
    buildRecommendationAuditBundleV5,
    type RecommendationAuditExportReadPortV5
} from '../../src/recommendation/audit-export-v5'
import {
    exportRecommendationAuditV5,
    serializeRecommendationAuditV5
} from '../../src/services/recommendation-audit-export'
import {
    frozenRecommendationAuditExportV5,
    EXPORT_ORACLE_BODY_SHA256_V5,
    EXPORT_ORACLE_SOURCE_V5,
    type FrozenAuditExportServiceV5
} from '../fixtures/recommendation-audit-export-legacy'

const roots: string[] = []
const at = '2026-10-24T00:00:00.000Z',
    sourceSha = 'a'.repeat(40),
    version = '0.5.0-audit-fixture'
function directory() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-audit-export-'))
    roots.push(root)
    return root
}
function fixture() {
    const root = directory(),
        database = new LibraryDatabase(path.join(root, 'library.db'))
    database.importCatalog(
        [
            {
                comicId: 'synthetic-a',
                title: '合成 / フィクスチャ',
                author: 'Fixture author',
                tags: ['School'],
                categories: ['Manga'],
                finished: true,
                providerMetadata: {
                    password: 'SECRET-UNEXPORTED-CATALOG-METADATA'
                }
            }
        ],
        'synthetic:audit-export'
    )
    database.recordUserEvent({
        id: 'synthetic-event',
        eventType: 'recommend_like',
        comicId: 'synthetic-a',
        source: 'synthetic',
        metadata: { reason: 'Raw explicit behavior is intentionally retained' }
    })
    const events = database.listUserEvents({ limit: 10000 }),
        catalog = database.listComics({ limit: 10000 })
    database.close()
    const trace: string[] = []
    const read: RecommendationAuditExportReadPortV5 = {
        userEvents: (limit) => {
            trace.push('events:' + limit)
            return events
        },
        catalog: (limit) => {
            trace.push('catalog:' + limit)
            return catalog
        },
        policySnapshot: () => {
            trace.push('policy')
            return { revision: 4, inferred: [{ key: 'School' }] }
        },
        preferenceTimescales: (session, limit) => {
            trace.push('timescales:' + session + ':' + limit)
            return { fixture: 'timescales', session }
        },
        behaviorEvidence: (limit) => {
            trace.push('behavior:' + limit)
            return { fixture: 'behavior' }
        },
        candidateChannels: (session, limit) => {
            trace.push('channels:' + session + ':' + limit)
            return { fixture: 'channels', session }
        },
        servingComposition: () => {
            trace.push('serving')
            return { available: false }
        },
        shadowRuns: (limit) => {
            trace.push('shadow:' + limit)
            return { runs: [] }
        },
        evaluationSummary: (limit, horizon, step, targets) => {
            trace.push(`evaluation:${limit}:${horizon}:${step}:${targets}`)
            return { status: 'WAITING_FOR_DATA' }
        }
    }
    const service: FrozenAuditExportServiceV5 = {
        recommendationV5Snapshot: read.policySnapshot,
        recommendationV5PreferenceTimescales: read.preferenceTimescales,
        recommendationV5BehaviorEvidence: read.behaviorEvidence,
        recommendationV5CandidateChannels: read.candidateChannels,
        recommendationServingCompositionV3: read.servingComposition,
        recommendationV5ShadowRuns: read.shadowRuns,
        recommendationV5EvaluationSummary: read.evaluationSummary
    }
    return {
        root,
        read,
        service,
        trace,
        db: {
            listUserEvents: ({ limit }: { limit: number }) =>
                read.userEvents(limit),
            listComics: ({ limit }: { limit: number }) => read.catalog(limit)
        }
    }
}
function rejectReads() {
    return new Proxy({} as RecommendationAuditExportReadPortV5, {
        get() {
            throw new Error(
                'Cancelled export must not even acquire a read callback'
            )
        }
    })
}
afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('modular recommendation audit export', () => {
    it('freezes the old Desktop handler body instead of comparing the new builder with itself', () => {
        const text = fs.readFileSync(
                'test/fixtures/recommendation-audit-export-legacy.ts',
                'utf8'
            ),
            tree = ts.createSourceFile(
                'oracle.ts',
                text,
                ts.ScriptTarget.Latest,
                true
            )
        const fn = tree.statements.find(
            (node): node is ts.FunctionDeclaration =>
                ts.isFunctionDeclaration(node) &&
                node.name?.text === 'frozenRecommendationAuditExportV5'
        )!
        expect(
            createHash('sha256').update(fn.body!.getText(tree)).digest('hex')
        ).toBe(EXPORT_ORACLE_BODY_SHA256_V5)
        expect(EXPORT_ORACLE_SOURCE_V5).toBe(
            'fe360d315d53c597042307a47e6e81fc14c9a1ef'
        )
        expect(text).not.toContain('buildRecommendationAuditBundleV5')
        expect(text).not.toContain('services/recommendation-audit-export')
    })
    it.each([' session-a ', '', '日本語-session'])(
        'preserves schema2 archive contents, read order and bounds for session %s',
        async (session) => {
            vi.useFakeTimers({ toFake: ['Date'] })
            vi.setSystemTime(new Date(at))
            const old = fixture(),
                next = fixture(),
                oldFile = path.join(old.root, 'old.zip'),
                newFile = path.join(next.root, 'new.zip')
            await frozenRecommendationAuditExportV5(
                old.db,
                old.service,
                { appSessionId: session },
                async () => {
                    old.trace.push('choose')
                    return oldFile
                },
                version,
                sourceSha
            )
            const result = await exportRecommendationAuditV5({
                read: next.read,
                productVersion: version,
                sourceSha,
                appSessionId: session,
                choosePath: async () => {
                    next.trace.push('choose')
                    return newFile
                }
            })
            const oldZip = new AdmZip(oldFile),
                newZip = new AdmZip(newFile)
            expect(newZip.getEntries().map((e) => e.entryName)).toEqual(
                oldZip.getEntries().map((e) => e.entryName)
            )
            for (const entry of oldZip.getEntries())
                expect(
                    newZip.readFile(entry.entryName),
                    entry.entryName
                ).toEqual(oldZip.readFile(entry.entryName))
            expect(next.trace.filter((row) => row !== 'choose')).toEqual(
                old.trace.filter((row) => row !== 'choose')
            )
            expect(next.trace[0]).toBe('choose')
            expect(old.trace.at(-1)).toBe('choose')
            expect(result).toMatchObject({
                success: true,
                fileName: 'new.zip',
                generatedAt: at,
                sizeBytes: fs.statSync(newFile).size,
                sha256: createHash('sha256')
                    .update(fs.readFileSync(newFile))
                    .digest('hex')
            })
            expect(newZip.readAsText('catalog_minimal.json')).not.toContain(
                'SECRET-UNEXPORTED'
            )
            expect(newZip.readAsText('user_events.json')).toContain(
                'Raw explicit behavior is intentionally retained'
            )
        }
    )
    it('cancelled export acquires no read capability and performs no filesystem write', async () => {
        const choose = vi.fn(async () => null),
            write = vi.spyOn(fs, 'writeFileSync')
        const result = await exportRecommendationAuditV5({
            read: rejectReads(),
            productVersion: version,
            choosePath: choose,
            now: () => new Date(at)
        })
        expect(result).toEqual({ success: false, cancelled: true })
        expect(choose).toHaveBeenCalledWith(at)
        expect(write).not.toHaveBeenCalled()
    })
    it('retains the old cancelled-export counterexample: expensive reads happen before the picker', async () => {
        const old = fixture()
        await frozenRecommendationAuditExportV5(
            old.db,
            old.service,
            {},
            async () => null,
            version
        )
        expect(old.trace).toContain('evaluation:500:30:3:50')
    })
    it('picker failure does not acquire report data or create an output file', async () => {
        const write = vi.spyOn(fs, 'writeFileSync')
        await expect(
            exportRecommendationAuditV5({
                read: rejectReads(),
                productVersion: version,
                choosePath: async () => {
                    throw new Error('synthetic picker failure')
                }
            })
        ).rejects.toThrow('synthetic picker failure')
        expect(write).not.toHaveBeenCalled()
    })
    it('serialization failure leaves an existing chosen file intact', async () => {
        const f = fixture(),
            file = path.join(f.root, 'existing.zip')
        fs.writeFileSync(file, 'retain existing output')
        f.read.policySnapshot = () => ({ unsupportedJson: BigInt(1) })
        await expect(
            exportRecommendationAuditV5({
                read: f.read,
                productVersion: version,
                choosePath: async () => file
            })
        ).rejects.toThrow()
        expect(fs.readFileSync(file, 'utf8')).toBe('retain existing output')
    })
    it('file write failure is not reported as a completed export', async () => {
        const f = fixture(),
            file = path.join(f.root, 'output.zip'),
            original = fs.writeFileSync
        vi.spyOn(fs, 'writeFileSync').mockImplementation(
            (target, bytes, options) => {
                if (target === file) throw new Error('synthetic output EACCES')
                return original(target, bytes, options)
            }
        )
        await expect(
            exportRecommendationAuditV5({
                read: f.read,
                productVersion: version,
                choosePath: async () => file
            })
        ).rejects.toThrow('synthetic output EACCES')
        expect(fs.existsSync(file)).toBe(false)
    })
    it('uses only the eleven declared entries and keeps minimal catalog fields explicit', () => {
        const f = fixture(),
            bundle = buildRecommendationAuditBundleV5(f.read, {
                generatedAt: at,
                productVersion: version,
                sourceSha: null,
                appSessionId: null
            }),
            zip = new AdmZip(serializeRecommendationAuditV5(bundle))
        expect(
            zip
                .getEntries()
                .map((e) => e.entryName)
                .sort()
        ).toEqual([...bundle.manifest.includes].sort())
        expect(zip.getEntries()).toHaveLength(11)
        const row = JSON.parse(zip.readAsText('catalog_minimal.json'))[0]
        expect(Object.keys(row).sort()).toEqual(
            [
                'comicId',
                'title',
                'author',
                'canonicalAuthor',
                'tags',
                'categories',
                'providerId',
                'isFavorite',
                'inLibrary',
                'downloadedPictures',
                'firstSeenAt',
                'lastSeenAt'
            ].sort()
        )
    })
})
