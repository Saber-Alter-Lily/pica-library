import { describe, expect, it } from 'vitest'
import {
    legacyUpdateAssetName,
    scopedUpdateAssetName,
    selectReleaseUpdateAsset,
    targetScopedUpdateAssetName,
    updateAssetNamesForChecksums
} from '../../src/update/release-assets'

describe('release update asset selection', () => {
    it('prefers a target-scoped asset when the release provides one', () => {
        const targetVersion = '0.5.1'
        const sourceVersion = '0.5.0'
        const target = { platform: 'windows', arch: 'x64' } as const
        const targetScoped = targetScopedUpdateAssetName(
            targetVersion,
            sourceVersion,
            target
        )
        const genericScoped = scopedUpdateAssetName(
            targetVersion,
            sourceVersion
        )
        expect(
            selectReleaseUpdateAsset(
                [
                    {
                        name: genericScoped,
                        browser_download_url:
                            `https://example.invalid/${genericScoped}`
                    },
                    {
                        name: targetScoped,
                        browser_download_url:
                            `https://example.invalid/${targetScoped}`
                    }
                ],
                targetVersion,
                sourceVersion,
                target
            )
        ).toEqual({
            kind: 'target-scoped',
            name: targetScoped,
            url: `https://example.invalid/${targetScoped}`
        })
    })

    it('preserves source-scoped and legacy names only for historical windows-x64 compatibility', () => {
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

    it('never lets non-Windows targets consume historical generic update assets', () => {
        const targetVersion = '0.5.1'
        const sourceVersion = '0.5.0'
        const generic = scopedUpdateAssetName(targetVersion, sourceVersion)
        const linux = { platform: 'linux', arch: 'x64' } as const
        expect(
            selectReleaseUpdateAsset(
                [
                    {
                        name: generic,
                        browser_download_url:
                            `https://example.invalid/${generic}`
                    }
                ],
                targetVersion,
                sourceVersion,
                linux
            )
        ).toBeNull()

        const targetScoped = targetScopedUpdateAssetName(
            targetVersion,
            sourceVersion,
            linux
        )
        expect(
            selectReleaseUpdateAsset(
                [
                    {
                        name: targetScoped,
                        browser_download_url:
                            `https://example.invalid/${targetScoped}`
                    }
                ],
                targetVersion,
                sourceVersion,
                linux
            )
        ).toMatchObject({
            kind: 'target-scoped',
            name: targetScoped
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

    it('checks target-scoped names before Windows compatibility names in checksum fallback', () => {
        expect(updateAssetNamesForChecksums('0.5.1', '0.5.0')).toEqual([
            'Pica-Library-v0.5.1-windows-x64-update-from-v0.5.0.zip',
            'Pica-Library-v0.5.1-update-from-v0.5.0.zip',
            'Pica-Library-v0.5.1-update.zip'
        ])
        expect(
            updateAssetNamesForChecksums('0.5.1', '0.5.0', {
                platform: 'macos',
                arch: 'arm64'
            })
        ).toEqual([
            'Pica-Library-v0.5.1-macos-arm64-update-from-v0.5.0.zip'
        ])
    })
})
