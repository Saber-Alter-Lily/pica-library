import { describe, expect, it } from 'vitest'
import { serializeLibraryBundle, validateLibraryBundle, type LibraryBundle } from '../../src/types/bundle'

function bundle(): LibraryBundle {
    return {
        schemaVersion: 1,
        kind: 'pica-library-bundle',
        generatedAt: '2026-08-12T00:00:00.000Z',
        library: { comics: [] },
        authors: [],
        profile: null,
        recommendations: [],
        queue: [],
        provenance: { application: 'pica-library', version: '0.1.0-rc.1', source: 'local-export' }
    }
}

describe('library bundle', () => {
    it('round trips a versioned portable bundle', () => {
        const encoded = serializeLibraryBundle(bundle())
        expect(validateLibraryBundle(JSON.parse(encoded))).toEqual(bundle())
    })

    it('rejects secrets and absolute paths at any depth', () => {
        expect(() => validateLibraryBundle({ ...bundle(), token: 'value' })).toThrow('sensitive field')
        expect(() => validateLibraryBundle({ ...bundle(), profile: { output: 'C:\\private\\file' } })).toThrow('absolute path')
    })

    it('rejects unknown schema versions', () => {
        expect(() => validateLibraryBundle({ ...bundle(), schemaVersion: 2 })).toThrow('schemaVersion')
    })
})
