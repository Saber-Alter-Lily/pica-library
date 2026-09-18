from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"missing marker: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# 1. Additive migration only. No existing comic foreign keys are rewritten.
# ---------------------------------------------------------------------------
path = "src/storage/sqlite/migrations.ts"
s = read(path)
anchor = """
]

export const latestMigrationVersion"""
if anchor not in s:
    raise RuntimeError("missing migrations array end")
migration12 = """
    ,
    {
        version: 12,
        name: 'canonical_work_identity_foundation',
        up: `
            CREATE TABLE IF NOT EXISTS canonical_series (
                id TEXT PRIMARY KEY,
                preferred_title TEXT NOT NULL DEFAULT '',
                normalized_title TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'CANDIDATE'
                    CHECK (status IN ('CANDIDATE','CONFIRMED','REJECTED')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS canonical_works (
                id TEXT PRIMARY KEY,
                series_id TEXT REFERENCES canonical_series(id)
                    ON DELETE SET NULL,
                preferred_title TEXT NOT NULL,
                normalized_title TEXT NOT NULL,
                canonical_author_key TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'CANDIDATE'
                    CHECK (status IN ('CANDIDATE','CONFIRMED','REJECTED')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_canonical_works_identity
                ON canonical_works(normalized_title, canonical_author_key);

            CREATE TABLE IF NOT EXISTS work_editions (
                id TEXT PRIMARY KEY,
                work_id TEXT NOT NULL REFERENCES canonical_works(id)
                    ON DELETE CASCADE,
                language TEXT,
                edition_kind TEXT NOT NULL DEFAULT 'UNKNOWN',
                label TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_work_editions_work
                ON work_editions(work_id, language, edition_kind);

            CREATE TABLE IF NOT EXISTS work_upload_bindings (
                comic_id TEXT PRIMARY KEY REFERENCES comics(id)
                    ON DELETE CASCADE,
                work_id TEXT NOT NULL REFERENCES canonical_works(id)
                    ON DELETE CASCADE,
                edition_id TEXT REFERENCES work_editions(id)
                    ON DELETE SET NULL,
                binding_status TEXT NOT NULL
                    CHECK (
                        binding_status IN (
                            'AUTO_HIGH_CONFIDENCE',
                            'MANUAL_CONFIRMED',
                            'REVIEW_REQUIRED'
                        )
                    ),
                confidence REAL NOT NULL DEFAULT 0,
                resolver_version TEXT NOT NULL,
                evidence_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_work_upload_bindings_work
                ON work_upload_bindings(work_id, binding_status);

            CREATE TABLE IF NOT EXISTS work_identity_evidence (
                id TEXT PRIMARY KEY,
                left_comic_id TEXT NOT NULL REFERENCES comics(id)
                    ON DELETE CASCADE,
                right_comic_id TEXT NOT NULL REFERENCES comics(id)
                    ON DELETE CASCADE,
                relation TEXT NOT NULL
                    CHECK (
                        relation IN (
                            'PROBABLE_SAME_WORK',
                            'EDITION_VARIANT',
                            'RELATED_WORK',
                            'DISTINCT'
                        )
                    ),
                confidence REAL NOT NULL DEFAULT 0,
                resolver_version TEXT NOT NULL,
                evidence_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                UNIQUE(left_comic_id, right_comic_id, resolver_version)
            );
            CREATE INDEX IF NOT EXISTS idx_work_identity_evidence_pair
                ON work_identity_evidence(left_comic_id, right_comic_id);
            CREATE INDEX IF NOT EXISTS idx_work_identity_evidence_relation
                ON work_identity_evidence(relation, confidence DESC);

            CREATE TABLE IF NOT EXISTS work_identity_decisions (
                id TEXT PRIMARY KEY,
                left_comic_id TEXT NOT NULL REFERENCES comics(id)
                    ON DELETE CASCADE,
                right_comic_id TEXT NOT NULL REFERENCES comics(id)
                    ON DELETE CASCADE,
                decision TEXT NOT NULL
                    CHECK (
                        decision IN (
                            'SAME_WORK',
                            'EDITION_VARIANT',
                            'KEEP_SEPARATE'
                        )
                    ),
                source TEXT NOT NULL DEFAULT 'USER',
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(left_comic_id, right_comic_id)
            );
            CREATE INDEX IF NOT EXISTS idx_work_identity_decisions_pair
                ON work_identity_decisions(left_comic_id, right_comic_id);
        `
    }
"""
s = s.replace(anchor, migration12 + anchor, 1)
write(path, s)


# ---------------------------------------------------------------------------
# 2. Pure read-only audit resolver. It reuses the conservative V5 work
#    identity keys; it does not persist or promote candidates.
# ---------------------------------------------------------------------------
module = """import type { StoredComic } from '../library/types'
import type { PortablePolicyStateV5 } from './portable-policy'
import {
    normalizePreferenceKey,
    workIdentityEvidenceV5,
    workIdentityKeys
} from './portable-policy'

export const WORK_IDENTITY_RESOLVER_VERSION =
    'work-identity-v1-title-author-pages'

export interface WorkIdentityAuditCandidateV5 {
    pairKey: string
    leftComicId: string
    rightComicId: string
    leftTitle: string
    rightTitle: string
    author: string
    leftProvider: string
    rightProvider: string
    crossProvider: boolean
    relation: 'PROBABLE_SAME_WORK'
    confidence: number
    evidence: {
        titleMatch: 'STRICT' | 'LOOSE'
        authorMatch: true
        pageCountCompatible: boolean
        leftPages: number
        rightPages: number
    }
    resolverVersion: typeof WORK_IDENTITY_RESOLVER_VERSION
}

function providerId(comic: StoredComic) {
    if (comic.providerId) return comic.providerId
    return comic.comicId.startsWith('eh:') ? 'eh' : 'pica'
}

function stablePair(leftId: string, rightId: string) {
    return [leftId, rightId]
        .map(normalizePreferenceKey)
        .sort()
        .join('\\u0000')
}

function addPairs(
    bucket: StoredComic[],
    selected: Map<string, WorkIdentityAuditCandidateV5>,
    state: PortablePolicyStateV5,
    limit: number
) {
    for (let leftIndex = 0; leftIndex < bucket.length; leftIndex++) {
        for (
            let rightIndex = leftIndex + 1;
            rightIndex < bucket.length;
            rightIndex++
        ) {
            if (selected.size >= limit) return
            const left = bucket[leftIndex]
            const right = bucket[rightIndex]
            const key = stablePair(left.comicId, right.comicId)
            if (selected.has(key)) continue
            const identity = workIdentityEvidenceV5(
                left,
                right,
                state.explicitDistinctPairs
            )
            if (identity.relation !== 'HIGH_CONFIDENCE_WORK') continue
            const a = workIdentityKeys(left)
            const b = workIdentityKeys(right)
            if (!a.author || a.author !== b.author) continue
            const strict = Boolean(
                a.strictTitle &&
                    a.strictTitle === b.strictTitle
            )
            const loose = Boolean(
                a.looseTitle &&
                    a.looseTitle === b.looseTitle
            )
            if (!strict && !loose) continue
            const pageCountCompatible =
                a.pages > 0 &&
                b.pages > 0 &&
                Math.abs(a.pages - b.pages) <=
                    Math.max(
                        4,
                        Math.ceil(Math.max(a.pages, b.pages) * 0.08)
                    )
            const leftProvider = providerId(left)
            const rightProvider = providerId(right)
            selected.set(key, {
                pairKey: key,
                leftComicId: left.comicId,
                rightComicId: right.comicId,
                leftTitle: left.title,
                rightTitle: right.title,
                author: left.canonicalAuthor || left.author || '',
                leftProvider,
                rightProvider,
                crossProvider: leftProvider !== rightProvider,
                relation: 'PROBABLE_SAME_WORK',
                confidence: strict ? 0.99 : 0.94,
                evidence: {
                    titleMatch: strict ? 'STRICT' : 'LOOSE',
                    authorMatch: true,
                    pageCountCompatible,
                    leftPages: a.pages,
                    rightPages: b.pages
                },
                resolverVersion: WORK_IDENTITY_RESOLVER_VERSION
            })
        }
    }
}

export function buildWorkIdentityAuditV5(
    catalog: StoredComic[],
    state: PortablePolicyStateV5,
    requestedLimit = 200
) {
    const limit = Math.max(1, Math.min(1000, Math.floor(requestedLimit)))
    const strictBuckets = new Map<string, StoredComic[]>()
    const looseBuckets = new Map<string, StoredComic[]>()

    for (const comic of catalog) {
        const keys = workIdentityKeys(comic)
        if (!keys.author) continue
        if (keys.strictTitle) {
            const key = keys.author + '\\u0000' + keys.strictTitle
            strictBuckets.set(key, [
                ...(strictBuckets.get(key) || []),
                comic
            ])
        }
        if (keys.looseTitle) {
            const key = keys.author + '\\u0000' + keys.looseTitle
            looseBuckets.set(key, [
                ...(looseBuckets.get(key) || []),
                comic
            ])
        }
    }

    const selected = new Map<string, WorkIdentityAuditCandidateV5>()
    const candidateBuckets = [
        ...strictBuckets.values(),
        ...looseBuckets.values()
    ]
        .filter((items) => items.length > 1)
        .sort((a, b) => b.length - a.length)

    for (const bucket of candidateBuckets) {
        addPairs(bucket, selected, state, limit)
        if (selected.size >= limit) break
    }

    const candidates = [...selected.values()]
        .sort(
            (a, b) =>
                Number(b.crossProvider) - Number(a.crossProvider) ||
                b.confidence - a.confidence ||
                a.pairKey.localeCompare(b.pairKey)
        )
        .slice(0, limit)

    return {
        mode: 'READ_ONLY' as const,
        resolverVersion: WORK_IDENTITY_RESOLVER_VERSION,
        scannedComicCount: catalog.length,
        candidateCount: candidates.length,
        crossProviderCandidateCount: candidates.filter(
            (item) => item.crossProvider
        ).length,
        candidates
    }
}
"""
write("src/recommendation-v5/work-identity-foundation.ts", module)


# ---------------------------------------------------------------------------
# 3. Service + GET endpoint. Still read-only: no backfill and no binding.
# ---------------------------------------------------------------------------
path = "src/library/service.ts"
s = read(path)
import_marker = """import { applyIntentPolicyV5 } from '../recommendation-v5/intent-policy'
"""
if import_marker not in s:
    raise RuntimeError("missing service import marker")
s = s.replace(
    import_marker,
    import_marker
    + """import {
    buildWorkIdentityAuditV5,
    WORK_IDENTITY_RESOLVER_VERSION
} from '../recommendation-v5/work-identity-foundation'
""",
    1,
)
method_marker = """    updateRecommendationV5Control(input: Record<string, unknown>) {
"""
if method_marker not in s:
    raise RuntimeError("missing service V5 control marker")
method = """    recommendationV5WorkIdentityAudit(limit = 200) {
        const catalog = this.database.listComics({ limit: 10000 })
        const state = new RecommendationPolicyStoreV5(this.database).state()
        return {
            ...buildWorkIdentityAuditV5(catalog, state, limit),
            resolverVersion: WORK_IDENTITY_RESOLVER_VERSION,
            persistence: 'NONE' as const,
            automaticBinding: false
        }
    }

"""
s = s.replace(method_marker, method + method_marker, 1)
write(path, s)

path = "src/library/server.ts"
s = read(path)
route_marker = """            if (
                url.pathname === '/api/v1/recommendation-v5' &&
                request.method === 'GET'
            )
                return json(response, 200, options.service.recommendationV5Snapshot())

"""
if route_marker not in s:
    raise RuntimeError("missing V5 snapshot route marker")
route = route_marker + """            if (
                url.pathname ===
                    '/api/v1/recommendation-v5/work-identity/audit' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.service.recommendationV5WorkIdentityAudit(
                        Number(url.searchParams.get('limit') ?? 200)
                    )
                )

"""
s = s.replace(route_marker, route, 1)
write(path, s)


# ---------------------------------------------------------------------------
# 4. Tests for additive migration + resolver conservatism.
# ---------------------------------------------------------------------------
test = """import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import {
    latestMigrationVersion,
    runMigrations
} from '../../src/storage/sqlite/migrations'
import {
    buildWorkIdentityAuditV5,
    WORK_IDENTITY_RESOLVER_VERSION
} from '../../src/recommendation-v5/work-identity-foundation'
import { defaultPortablePolicyStateV5 } from '../../src/recommendation-v5/portable-policy'

function comic(
    input: Partial<StoredComic> & Pick<StoredComic, 'comicId' | 'title'>
): StoredComic {
    return {
        comicId: input.comicId,
        title: input.title,
        author: input.author ?? '',
        canonicalAuthor: input.canonicalAuthor ?? input.author ?? '',
        circle: input.circle ?? null,
        authorId: input.authorId ?? null,
        tags: input.tags ?? [],
        categories: input.categories ?? [],
        finished: input.finished ?? true,
        isFavorite: input.isFavorite ?? false,
        firstSeenAt: input.firstSeenAt ?? new Date(0).toISOString(),
        lastSeenAt: input.lastSeenAt ?? new Date(0).toISOString(),
        knownEpisodes: input.knownEpisodes ?? 1,
        knownPictures: input.knownPictures ?? input.pagesCount ?? 0,
        downloadedPictures: input.downloadedPictures ?? 0,
        pagesCount: input.pagesCount ?? 0,
        inLibrary: input.inLibrary ?? false,
        providerId: input.providerId
    } as StoredComic
}

describe('Canonical Work Identity foundation', () => {
    it('adds the identity schema without rewriting the comics table', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-work-id-'))
        const file = path.join(dir, 'library.sqlite')
        const database = new DatabaseSync(file)
        runMigrations(database)

        expect(latestMigrationVersion).toBeGreaterThanOrEqual(12)
        const tables = new Set(
            (
                database
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type='table'"
                    )
                    .all() as Array<{ name: string }>
            ).map((row) => row.name)
        )
        for (const name of [
            'canonical_series',
            'canonical_works',
            'work_editions',
            'work_upload_bindings',
            'work_identity_evidence',
            'work_identity_decisions'
        ])
            expect(tables.has(name)).toBe(true)

        const comicColumns = (
            database.prepare('PRAGMA table_info(comics)').all() as Array<{
                name: string
                pk: number
            }>
        )
        expect(
            comicColumns.find((column) => column.name === 'id')?.pk
        ).toBe(1)
        expect(
            Number(
                (
                    database
                        .prepare(
                            'SELECT COUNT(*) AS count FROM work_upload_bindings'
                        )
                        .get() as { count: number }
                ).count
            )
        ).toBe(0)

        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('surfaces conservative same-work candidates without binding them', () => {
        const state = defaultPortablePolicyStateV5()
        const result = buildWorkIdentityAuditV5(
            [
                comic({
                    comicId: 'pica:1',
                    providerId: 'pica',
                    title: 'Work Title',
                    author: 'Artist',
                    pagesCount: 24
                }),
                comic({
                    comicId: 'eh:2',
                    providerId: 'eh',
                    title: '[Chinese] Work Title',
                    author: 'Artist',
                    pagesCount: 25
                }),
                comic({
                    comicId: 'eh:3',
                    providerId: 'eh',
                    title: 'Work Title',
                    author: 'Different Artist',
                    pagesCount: 24
                })
            ],
            state
        )
        expect(result.mode).toBe('READ_ONLY')
        expect(result.resolverVersion).toBe(WORK_IDENTITY_RESOLVER_VERSION)
        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0]).toMatchObject({
            leftComicId: 'pica:1',
            rightComicId: 'eh:2',
            crossProvider: true,
            relation: 'PROBABLE_SAME_WORK'
        })
    })

    it('respects an explicit keep-separate override from the existing policy', () => {
        const state = {
            ...defaultPortablePolicyStateV5(),
            explicitDistinctPairs: ['eh:2\\u0000pica:1']
        }
        const result = buildWorkIdentityAuditV5(
            [
                comic({
                    comicId: 'pica:1',
                    title: 'Same',
                    author: 'Artist',
                    pagesCount: 20
                }),
                comic({
                    comicId: 'eh:2',
                    title: 'Same',
                    author: 'Artist',
                    pagesCount: 20
                })
            ],
            state
        )
        expect(result.candidates).toHaveLength(0)
    })
})
"""
write("test/unit/recommendation-v5-work-identity-foundation.test.ts", test)


# ---------------------------------------------------------------------------
# 5. Product contract + R&D log.
# ---------------------------------------------------------------------------
path = "test/unit/recommendation-v5-product-contract.test.ts"
s = read(path)
marker = """    it('applies work-level duplicate/owned suppression at ranking and serving', () => {"""
if marker not in s:
    raise RuntimeError("missing product contract insertion marker")
contract = """    it('adds a non-destructive canonical work identity foundation', () => {
        const migrations = read('src/storage/sqlite/migrations.ts')
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const identity = read(
            'src/recommendation-v5/work-identity-foundation.ts'
        )
        expect(migrations).toContain(
            "name: 'canonical_work_identity_foundation'"
        )
        expect(migrations).toContain('work_upload_bindings')
        expect(migrations).toContain('work_identity_decisions')
        expect(identity).toContain("mode: 'READ_ONLY'")
        expect(server).toContain(
            '/api/v1/recommendation-v5/work-identity/audit'
        )
        expect(service).toContain('automaticBinding: false')
    })

"""
s = s.replace(marker, contract + marker, 1)
write(path, s)

path = "PROJECT_LOG.md"
s = read(path)
needle = "- 增加“保留收藏但不参与推荐口味画像”：仅移出 preference inference、召回 seed 与 Visual preference prototype，收藏/下载/已拥有过滤和 Visual embedding 均保留。\\n"
if needle in s and "Canonical Work Identity 基础层" not in s:
    s = s.replace(
        needle,
        needle
        + "- P2A 启动 Canonical Work Identity 基础层：新增 Series / Work / Edition / Upload 绑定、身份证据与人工裁决的加法表结构；首轮只提供只读候选审计，不自动绑定、不改写现有 comic_id。\\n",
        1,
    )
write(path, s)

print("Canonical Work Identity foundation patch prepared.")
