/** Frozen NEXT58 Desktop handler body; never calls the replacement builder/exporter. */
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import AdmZip from 'adm-zip'
import type {LibraryDatabase} from '../../src/library/database'
export const EXPORT_ORACLE_SOURCE_V5='fe360d315d53c597042307a47e6e81fc14c9a1ef'
export const EXPORT_ORACLE_BODY_SHA256_V5='4d88623bf1bb55b2970b510e77d923301dca8214d9880cb8494605b1845c0eb8'
export interface FrozenAuditExportServiceV5 {
 recommendationV5Snapshot():unknown
 recommendationV5PreferenceTimescales(session:string|null,limit:number):unknown
 recommendationV5BehaviorEvidence(limit:number):unknown
 recommendationV5CandidateChannels(session:string|null,limit:number):unknown
 recommendationServingCompositionV3():unknown
 recommendationV5ShadowRuns(limit:number):unknown
 recommendationV5EvaluationSummary(limit:number,horizon:number,step:number,targets:number):unknown
}
export async function frozenRecommendationAuditExportV5(database:Pick<LibraryDatabase,'listUserEvents'|'listComics'>|null,service:FrozenAuditExportServiceV5|null,input:Record<string,unknown>,chooseRecommendationAuditPath:(at:string)=>Promise<string|null>,PRODUCT_VERSION:string,currentSourceSha?:string) {
            if (!database || !service) throw new Error('Library is not ready')
            const generatedAt = new Date().toISOString()
            const appSessionId = String(input.appSessionId ?? '').trim() || null
            const events = database.listUserEvents({ limit: 10000 })
            const catalog = database.listComics({ limit: 10000 }).map((comic) => ({
                comicId: comic.comicId,
                title: comic.title,
                author: comic.author,
                canonicalAuthor: comic.canonicalAuthor ?? null,
                tags: comic.tags,
                categories: comic.categories,
                providerId: comic.providerId ?? null,
                isFavorite: comic.isFavorite,
                inLibrary: comic.inLibrary,
                downloadedPictures: comic.downloadedPictures,
                firstSeenAt: comic.firstSeenAt,
                lastSeenAt: comic.lastSeenAt
            }))
            const policy = service.recommendationV5Snapshot()
            const timescales = service.recommendationV5PreferenceTimescales(
                appSessionId,
                10000
            )
            const behavior = service.recommendationV5BehaviorEvidence(10000)
            const channels = service.recommendationV5CandidateChannels(
                appSessionId,
                10000
            )
            const servingComposition =
                service.recommendationServingCompositionV3()
            const shadowRuns = service.recommendationV5ShadowRuns(500)
            const evaluation = service.recommendationV5EvaluationSummary(
                500,
                30,
                3,
                50
            )
            const manifest = {
                schemaVersion: 2,
                kind: 'pica-library-recommendation-audit',
                generatedAt,
                productVersion: PRODUCT_VERSION,
                sourceSha: currentSourceSha ?? null,
                appSessionId,
                includes: [
                    'manifest.json',
                    'policy_snapshot.json',
                    'preference_timescales.json',
                    'candidate_channels.json',
                    'serving_composition.json',
                    'behavior_evidence_v5.json',
                    'user_events.json',
                    'shadow_runs.json',
                    'evaluation_snapshot.json',
                    'catalog_minimal.json',
                    'README.txt'
                ],
                excludes: [
                    'pica_password',
                    'pica_token',
                    'eh_cookies',
                    'github_token',
                    'webdav_credentials',
                    'comic_images',
                    'downloaded_files'
                ]
            }
            const zip = new AdmZip()
            const addJson = (name: string, value: unknown) =>
                zip.addFile(
                    name,
                    Buffer.from(JSON.stringify(value, null, 2), 'utf8')
                )
            addJson('manifest.json', manifest)
            addJson('policy_snapshot.json', policy)
            addJson('preference_timescales.json', timescales)
            addJson('candidate_channels.json', channels)
            addJson('serving_composition.json', servingComposition)
            addJson('behavior_evidence_v5.json', behavior)
            addJson('user_events.json', events)
            addJson('shadow_runs.json', shadowRuns)
            addJson('evaluation_snapshot.json', evaluation)
            addJson('catalog_minimal.json', catalog)
            zip.addFile(
                'README.txt',
                Buffer.from(
                    [
                        'Pica Library Recommendation Audit Export',
                        '',
                        'This package contains allowlisted recommendation and interaction audit data only.',
                        'preference_timescales.json is generated for the appSessionId recorded in manifest.json when the export is requested from the active Web session.',
                        'candidate_channels.json describes the V5 shadow planner and is not the serving recommendation batch.',
                        'serving_composition.json describes the persisted Final V3 serving batch without allocating or regenerating a recommendation batch.',
                        'It intentionally excludes account passwords, provider tokens/cookies, GitHub credentials, WebDAV credentials, comic images, and downloaded manga files.',
                        'Share this ZIP only when you intentionally want another person or analysis tool to review recommendation behavior.',
                        ''
                    ].join('\n'),
                    'utf8'
                )
            )
            const buffer = zip.toBuffer()
            const file = await chooseRecommendationAuditPath(generatedAt)
            if (!file) return { success: false, cancelled: true }
            fs.writeFileSync(file, buffer)
            return {
                success: true,
                fileName: path.basename(file),
                generatedAt,
                sizeBytes: buffer.byteLength,
                sha256: createHash('sha256').update(buffer).digest('hex')
            }
        }
