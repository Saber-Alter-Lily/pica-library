import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
    launchBrowser,
    sanitizedChildEnv
} from '../../src/desktop/child-process'
import { connectionCredentials } from '../../src/desktop/connection'
import { assertLibraryChangeAllowed } from '../../src/desktop/lifecycle'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import type { Pica } from '../../src/sdk'

const directories: string[] = []
afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('desktop remediation boundaries', () => {
    it('removes every Pica variable from non-provider child environments', () => {
        const child = sanitizedChildEnv({
            PATH: 'kept',
            PICA_ACCOUNT: 'account',
            pica_password: 'password',
            PICA_PROXY: 'http://secret@127.0.0.1:7890',
            PICA_TOKEN: 'token'
        })
        expect(child).toEqual({ PATH: 'kept' })
        const mainSource = fs.readFileSync(
            path.resolve(import.meta.dirname, '../../src/desktop/main.ts'),
            'utf8'
        )
        const credentialSource = fs.readFileSync(
            path.resolve(
                import.meta.dirname,
                '../../src/desktop/credentials.ts'
            ),
            'utf8'
        )
        expect(mainSource.match(/env: sanitizedChildEnv\(\)/g)).toHaveLength(5)
        expect(mainSource).toContain(
            'if (currentUrl !== previousUrl) browser(currentUrl)'
        )
        expect(
            credentialSource.match(/env: sanitizedChildEnv\(\)/g)
        ).toHaveLength(1)
    })

    it('uses saved credentials for a blank Settings connection test', () => {
        expect(
            connectionCredentials(
                { account: '  ', password: '' },
                { account: 'saved-account', password: 'saved-password' }
            )
        ).toEqual({
            account: 'saved-account',
            password: 'saved-password'
        })
        expect(
            connectionCredentials(
                { account: 'new-account', password: 'new-password' },
                { account: 'saved-account', password: 'saved-password' }
            )
        ).toEqual({ account: 'new-account', password: 'new-password' })
    })

    it('reports an asynchronous browser launcher failure visibly', () => {
        const child = new EventEmitter() as EventEmitter & {
            unref: () => void
        }
        child.unref = () => undefined
        const failures: unknown[] = []
        let childEnvironment: NodeJS.ProcessEnv | undefined
        const started = launchBrowser(
            'http://127.0.0.1:4789',
            (error) => failures.push(error),
            ((
                _command: string,
                _arguments: string[],
                options: { env?: NodeJS.ProcessEnv }
            ) => {
                childEnvironment = options.env
                return child
            }) as never
        )
        expect(started).toBe(true)
        expect(Object.keys(childEnvironment ?? {})).not.toContain(
            'PICA_ACCOUNT'
        )
        child.emit('exit', 1, null)
        expect(failures).toHaveLength(1)
    })

    it('pauses and settles an active download before database close', async () => {
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-stop-'))
        directories.push(dataDir)
        const file = path.join(dataDir, 'library.db')
        const database = new LibraryDatabase(file)
        let releaseSecond!: () => void
        let secondStarted!: () => void
        const secondStart = new Promise<void>((resolve) => {
            secondStarted = resolve
        })
        const secondRelease = new Promise<void>((resolve) => {
            releaseSecond = resolve
        })
        let downloads = 0
        const provider = {
            comicInfo: async () => ({
                _id: 'shutdown-comic',
                title: 'Shutdown comic',
                author: 'Author',
                categories: [],
                tags: [],
                allowDownload: true
            }),
            episodesAll: async () => [
                { id: 'episode-1', _id: 'episode-1', order: 1, title: 'One' }
            ],
            picturesAll: async () => [
                {
                    id: 'picture-1',
                    name: '1.jpg',
                    url: 'https://example.test/1.jpg',
                    media: {
                        path: '1.jpg',
                        fileServer: '',
                        originalName: '1.jpg'
                    }
                },
                {
                    id: 'picture-2',
                    name: '2.jpg',
                    url: 'https://example.test/2.jpg',
                    media: {
                        path: '2.jpg',
                        fileServer: '',
                        originalName: '2.jpg'
                    }
                }
            ],
            downloadToFile: async (_url: string, output: string) => {
                downloads += 1
                if (downloads === 2) {
                    secondStarted()
                    await secondRelease
                }
                fs.mkdirSync(path.dirname(output), { recursive: true })
                fs.writeFileSync(output, 'x')
                return { bytes: 1, sha256: 'hash' }
            }
        }
        const service = new LibraryService(
            database,
            dataDir,
            provider as unknown as Pica
        )
        const job = service.enqueueDownload({ comicId: 'shutdown-comic' })
        const running = service.runDownloadQueue({
            profile: 'custom',
            custom: {
                jobConcurrency: 1,
                globalMediaConcurrency: 1,
                requestIntervalMs: 0,
                maxRetries: 0
            }
        })
        await secondStart
        expect(database.getDownloadJob(job.id).progressCompleted).toBe(1)
        expect(service.hasActiveLocalDownloads()).toBe(true)
        expect(() =>
            assertLibraryChangeAllowed(
                service,
                dataDir,
                path.join(dataDir, 'new-library')
            )
        ).toThrow(
            'Pause or finish active downloads before changing the Library folder.'
        )
        expect(() =>
            assertLibraryChangeAllowed(service, dataDir, dataDir)
        ).not.toThrow()
        const quiescing = service.quiesceLocalDownloads()
        expect(database.getDownloadJob(job.id).status).toBe('PAUSED')
        expect(() =>
            service.enqueueDownload({ comicId: 'new-local-work' })
        ).toThrow('shutting down')
        releaseSecond()
        await quiescing
        await running
        expect(database.getDownloadJob(job.id)).toMatchObject({
            status: 'PAUSED',
            progressCompleted: 2,
            progressTotal: 2
        })
        database.close()

        const reopened = new LibraryDatabase(file)
        const durable = reopened.getDownloadJob(job.id)
        expect(durable.status).toBe('PAUSED')
        reopened.transitionDownloadJob(job.id, 'QUEUED')
        expect(reopened.getDownloadJob(job.id).status).toBe('QUEUED')
        reopened.close()
    })

    it('detects local active jobs before a library directory switch', () => {
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-switch-'))
        directories.push(dataDir)
        const database = new LibraryDatabase(path.join(dataDir, 'library.db'))
        const service = new LibraryService(database, dataDir, {} as Pica)
        service.enqueueDownload({ comicId: 'queued-local' })
        expect(service.hasActiveLocalDownloads()).toBe(true)
        database.close()
    })
})
