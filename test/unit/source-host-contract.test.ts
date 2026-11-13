import { describe, expect, it } from 'vitest'
import { sourceHostEndpoint, sourceHostRequest } from '../../src/source-hosts/contract'
import { sourceHostData, suwayomiServer, suwayomiSourceId, suwayomiSourcePage } from '../../src/source-hosts/suwayomi'

const request = (extra: Record<string, unknown> = {}) => ({ kind: 'suwayomi', endpoint: 'http://127.0.0.1:4567/', consent: true, ...extra })
const page = (extra: Record<string, unknown> = {}) => ({ data: { sources: { nodes: [{ id: '9223372036854775807', name: 'Synthetic source', lang: 'zh', supportsLatest: true }], pageInfo: { hasNextPage: true, hasPreviousPage: false }, totalCount: 200, ...extra } } })

describe('optional host input and upstream query contracts — no network', () => {
    it('normalizes only the selected base path without discovery or unrelated URL parameters', () => {
        expect(sourceHostEndpoint('http://127.0.0.1:4567/reader', false)).toMatchObject({ endpoint: 'http://127.0.0.1:4567/reader/', graphqlUrl: 'http://127.0.0.1:4567/reader/api/graphql', loopback: true })
        expect(sourceHostEndpoint('https://host.example/instance/', false).graphqlUrl).toBe('https://host.example/instance/api/graphql')
        expect(sourceHostEndpoint('http://[::1]:4567', false).loopback).toBe(true)
    })
    it.each(['', ' https://host.example', 'https://host.example/ ', 'https://host.example/\\foo', 'file:///tmp/a', 'ftp://host.example', 'javascript:alert(1)', 'https://user:secret@host.example', 'https://@host.example', 'https://host.example?token=secret', 'https://host.example?', 'https://host.example/#', 'https://host.example/with%2fslash', 'https://host.example/prefix/../other', 'https://host.example/prefix/%2e%2e/other', 'https://169.254.169.254/', 'https://0.0.0.0', 'https://224.1.1.1', 'https://[::]/', 'https://[::ffff:127.0.0.1]/', 'https://[fe80::1]/', 'https://[ff02::1]/', 'https://host.example/\n'])('rejects unsafe or credential-bearing endpoint %j', endpoint => {
        expect(() => sourceHostEndpoint(endpoint, true)).toThrow()
    })
    it('keeps literal private-LAN HTTP opt-in and never sends Basic credentials over it', () => {
        for (const endpoint of ['http://192.168.1.2:4567/', 'http://10.1.2.3/', 'http://172.16.1.2/']) {
            expect(() => sourceHostRequest(request({ endpoint }))).toThrow('SOURCE_HOST_INSECURE')
            expect(sourceHostRequest(request({ endpoint, allowInsecureLan: true })).connection.auth).toEqual({ mode: 'none' })
            expect(() => sourceHostRequest(request({ endpoint, allowInsecureLan: true, auth: { mode: 'basic', username: 'person', password: 'secret' } }))).toThrow('SOURCE_HOST_INSECURE')
        }
        for (const endpoint of ['http://example.test/', 'http://my-server.local/', 'http://127.0.0.1.example/']) expect(() => sourceHostEndpoint(endpoint, true)).toThrow('SOURCE_HOST_INSECURE')
        expect(sourceHostRequest(request({ auth: { mode: 'basic', username: 'person', password: 'secret' } })).connection.auth.mode).toBe('basic')
    })
    it('requires per-request human intent and rejects undeclared permissions, modes and fields', () => {
        expect(() => sourceHostRequest(request({ consent: false }))).toThrow('SOURCE_HOST_CONSENT_REQUIRED')
        for (const value of [null, [], request({ consent: 'true' }), request({ kind: 'other' }), request({ credentialStore: '/outside' }), request({ allowInsecureLan: 1 }), request({ auth: null }), request({ auth: { mode: 'cookie', cookie: 'secret' } }), request({ auth: { mode: 'none', password: 'secret' } }), request({ auth: [] }), request({ auth: { mode: 'basic', username: 'a:b', password: 'c' } }), request({ auth: { mode: 'basic', username: 'a', password: 'b\nc' } })]) expect(() => sourceHostRequest(value)).toThrow()
    })
    it.each([-25, 1, 25.1, 5025, '25', null, NaN, Infinity])('rejects invalid pagination offset %j', offset => {
        expect(() => sourceHostRequest(request({ offset }))).toThrow('INVALID_SOURCE_HOST')
    })
    it('accepts bounded explicit pages without fetching an entire catalogue', () => {
        expect(sourceHostRequest(request()).offset).toBe(0)
        expect(sourceHostRequest(request({ offset: 5000 })).offset).toBe(5000)
        expect(suwayomiSourcePage(page(), 25)).toEqual({ offset: 25, size: 25, total: 200, hasNext: true, hasPrevious: false, sources: [{ id: '9223372036854775807', name: 'Synthetic source', language: 'zh', supportsLatest: true }] })
    })
    it('uses only the inspected 2.4 query surface, not host or extension attestation', () => {
        expect(suwayomiServer({ data: { aboutServer: { name: 'Suwayomi-Server', version: '2.4.2366' } } })).toEqual({ name: 'Suwayomi-Server', version: '2.4.2366' })
        for (const version of ['2.3.2000', '2.5.1', '3.0.0', 'nightly', '2.4.1-dev']) expect(() => suwayomiServer({ data: { aboutServer: { name: 'Suwayomi-Server', version } } })).toThrow('SOURCE_HOST_UNSUPPORTED')
        expect(() => suwayomiServer({ data: { aboutServer: { name: 'Other server', version: '2.4.2366' } } })).toThrow('SOURCE_HOST_UNSUPPORTED')
    })
    it('rejects partial GraphQL errors and malformed data without returning server messages', () => {
        for (const value of [{ data: {}, errors: [{ message: 'remote-secret' }] }, { data: {}, errors: {} }, { data: [] }, { data: null }, {}]) expect(() => sourceHostData(value)).toThrow('SOURCE_HOST_PROTOCOL')
        expect(() => sourceHostData({ errors: [{ message: 'remote-secret' }] })).not.toThrow('remote-secret')
    })
    it.each(['9223372036854775807', '-9223372036854775808', '9007199254740993', '0', '1'])('preserves upstream signed LongString exactly: %s', id => {
        expect(suwayomiSourceId(id)).toBe(id)
    })
    it.each([9223372036854775807, 1, '9223372036854775808', '-9223372036854775809', '-0', '01', '+1', '1e3', '1.0', '', ' 1', 'local:1'])('rejects lossy/noncanonical source identity %j', id => {
        expect(() => suwayomiSourceId(id)).toThrow('SOURCE_HOST_PROTOCOL')
    })
    it('rejects duplicate, oversized, malformed or control-character source rows', () => {
        for (const extra of [
            { nodes: Array(26).fill({ id: '1', name: 'a', lang: 'en', supportsLatest: false }) },
            { nodes: Array(2).fill({ id: '1', name: 'a', lang: 'en', supportsLatest: false }) },
            { nodes: [{ id: '1', name: 'a\nb', lang: 'en', supportsLatest: false }] },
            { nodes: [{ id: '1', name: 'a', lang: 'en', supportsLatest: 'true' }] },
            { nodes: [{ id: '1', name: '', lang: 'en', supportsLatest: false }] },
            { totalCount: -1 }, { totalCount: '200' }, { pageInfo: { hasNextPage: 1, hasPreviousPage: false } }
        ]) expect(() => suwayomiSourcePage(page(extra), 0)).toThrow('SOURCE_HOST_PROTOCOL')
    })
})
