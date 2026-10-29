import { describe, expect, it, vi } from 'vitest'
import {
    coreLocalPlatformMatch, coreLocalPlatformExecute,
    coreLocalDirectoryKind, coreLocalDirectoryPath
} from '../../src/library/core-local-platform'

const port = () => ({
    chooseFolder: vi.fn(async () => 'C:\\Chosen\\Manga'),
    openDirectory: vi.fn(async (_kind: string) => undefined)
})

describe('source-neutral Desktop local folder capabilities', () => {
    it('matches only the existing POST API, not other local/source routes', () => {
        expect(coreLocalPlatformMatch('POST', '/api/v1/desktop/choose-folder'))
            .toBe('choose-folder')
        expect(coreLocalPlatformMatch('POST', '/api/v1/desktop/open-directory'))
            .toBe('open-directory')
        for (const value of [
            ['GET', '/api/v1/desktop/choose-folder'],
            ['POST', '/api/v1/desktop/local-import/preview'],
            ['POST', '/api/v1/desktop/open-directory/other'],
            ['POST', '/api/v1/source-hosts/open']
        ])
            expect(coreLocalPlatformMatch(value[0], value[1])).toBeNull()
    })
    it('resolves only explicitly provided trusted application directory slots', () => {
        const locations = {
            data: 'C:\\Owned\\Library',
            logs: 'C:\\Owned\\Logs',
            personalization: 'C:\\Owned\\Personalization',
            packs: 'C:\\Owned\\Packs',
            'browser-lite-export': undefined
        }
        for (const kind of ['data', 'logs', 'personalization', 'packs'])
            expect(coreLocalDirectoryPath(kind, locations))
                .toBe(locations[kind as keyof typeof locations])
        for (const kind of [
            '', 'random', 'profile', '__proto__', 'constructor', 'toString',
            '../../etc', 'C:\\Windows', '/tmp', 'browser-lite-export'
        ]) {
            expect(coreLocalDirectoryKind(kind)).toBe(false === (kind === 'browser-lite-export')
                ? true : false)
            expect(() => coreLocalDirectoryPath(kind, locations))
                .toThrow('Unknown directory')
        }
        expect(coreLocalDirectoryKind('browser-lite-export')).toBe(true)
        expect(coreLocalDirectoryPath('browser-lite-export', {
            'browser-lite-export': 'C:\\Owned\\Export'
        })).toBe('C:\\Owned\\Export')
    })
    it('delegates just the trusted picker and fixed slots, never arbitrary supplied paths', async () => {
        const host = port()
        expect(await coreLocalPlatformExecute('choose-folder', host)).toEqual({
            status: 200, value: { path: 'C:\\Chosen\\Manga' }
        })
        expect(host.chooseFolder).toHaveBeenCalledTimes(1)
        expect(host.openDirectory).not.toHaveBeenCalled()
        for (const input of [
            {}, { kind: 'source' }, { kind: '../data' },
            { kind: 'data', path: '/root/private' },
            { kind: 'data', command: 'calc.exe' },
            { kind: 'data', providerId: 'eh' },
            { kind: ['data'] }, { kind: '__proto__' },
            { kind: null }
        ]) {
            const result = await coreLocalPlatformExecute('open-directory', host, input)
            expect(result).toMatchObject({
                status: 400, value: { error: 'Unsupported local directory kind' }
            })
        }
        expect(host.openDirectory).not.toHaveBeenCalled()
        expect(await coreLocalPlatformExecute(
            'open-directory', host, { kind: 'logs' }
        )).toEqual({ status: 200, value: { success: true } })
        expect(host.openDirectory).toHaveBeenCalledExactlyOnceWith('logs')
    })
    it('fails closed without a local host and propagates native selection/open failures', async () => {
        expect(await coreLocalPlatformExecute('choose-folder', null)).toMatchObject({
            status: 409
        })
        expect(await coreLocalPlatformExecute('open-directory')).toMatchObject({
            status: 409
        })
        const host = port()
        host.chooseFolder.mockResolvedValueOnce(null as never)
        expect(await coreLocalPlatformExecute('choose-folder', host))
            .toMatchObject({ status: 200, value: { path: null } })
        host.openDirectory.mockRejectedValueOnce(new Error('Desktop opener unavailable'))
        await expect(coreLocalPlatformExecute(
            'open-directory', host, { kind: 'data' }
        )).rejects.toThrow('Desktop opener unavailable')
    })
})
