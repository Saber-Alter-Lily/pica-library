import { describe, expect, it } from 'vitest'
import {
    legacyUpdateAssetName,
    scopedUpdateAssetName,
    selectReleaseUpdateAsset,
    updateAssetNamesForChecksums
} from '../../src/update/release-assets'

describe('release update asset selection', () => {
    it('prefers a source-scoped incremental asset over the legacy generic name', () => {
        const target = '0.5.1'
        const source = '0.5.0'
        const scoped = scopedUpdateAssetName(target, source)
        const legacy = legacyUpdateAssetName(target)
        expect(
            selectReleaseUpdateAsset(
                [
                    {
                        name: legacy,
                        browser_download_url: `https://example.invalid/${legacy}`
                    },
                    {
                        name: scoped,
                        browser_download_url: `https://example.invalid/${scoped}`
                    }
                ],
                target,
                source
            )
        ).toEqual({
            kind: 'scoped',
            name: scoped,
            url: `https://example.invalid/${scoped}`
        })
    })

    it('keeps legacy generic update assets as a compatibility fallback', () => {
        const target = '0.5.1'
        const source = '0.5.0'
        const legacy = legacyUpdateAssetName(target)
        expect(
            selectReleaseUpdateAsset(
                [
                    {
                        name: legacy,
                        browser_download_url: `https://example.invalid/${legacy}`
                    }
                ],
                target,
                source
            )
        ).toMatchObject({
            kind: 'legacy',
            name: legacy
        })
    })

    it('returns no incremental asset when a release intentionally exposes only full packages', () => {
        expect(
            selectReleaseUpdateAsset(
                [
                    {
                        name: 'Pica-Library-v0.5.0-windows-x64.zip',
                        browser_download_url:
                            'https://example.invalid/Pica-Library-v0.5.0-windows-x64.zip'
                    }
                ],
                '0.5.0',
                '0.4.0'
            )
        ).toBeNull()
    })

    it('checks scoped names before legacy names in checksum fallback', () => {
        expect(updateAssetNamesForChecksums('0.5.1', '0.5.0')).toEqual([
            'Pica-Library-v0.5.1-update-from-v0.5.0.zip',
            'Pica-Library-v0.5.1-update.zip'
        ])
    })
})
