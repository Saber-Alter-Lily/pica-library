import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = fs.readFileSync(
    '.github/workflows/v050-release.yml',
    'utf8'
)

describe('v0.5.0 formal publication transaction', () => {
    it('is manual, explicit, draft-first, verified, and retry-safe', () => {
        expect(workflow).toContain('workflow_dispatch:')
        expect(workflow).not.toContain('\n  push:')
        expect(workflow).toContain("test \"$CONFIRM\" = 'PUBLISH v0.5.0'")
        expect(workflow).toContain(
            'uses: ./.github/workflows/v050-release-candidate.yml'
        )
        expect(workflow).toContain('secrets: inherit')
        expect(workflow).toContain('permissions:\n  contents: read')
        expect(workflow).toContain(
            'publish:\n    needs: [validate, candidate]\n    permissions:\n      contents: write'
        )
        expect(workflow).toContain(
            'concurrency:\n  group: v050-formal-release\n  cancel-in-progress: false'
        )

        const draftCreate = workflow.indexOf('--draft')
        const releaseDownload = workflow.indexOf(
            'gh release download "$RELEASE_TAG"'
        )
        const checksumVerify = workflow.indexOf(
            'sha256sum -c SHA256SUMS.txt'
        )
        const publishStable = workflow.indexOf(
            'gh release edit "$RELEASE_TAG" --draft=false --latest'
        )
        const latestVerify = workflow.indexOf(
            'releases/latest" --jq .tag_name'
        )
        const otaUpdate = workflow.indexOf(
            'git tag -f android-preview'
        )

        expect(draftCreate).toBeGreaterThan(0)
        expect(releaseDownload).toBeGreaterThan(draftCreate)
        expect(checksumVerify).toBeGreaterThan(releaseDownload)
        expect(publishStable).toBeGreaterThan(checksumVerify)
        expect(latestVerify).toBeGreaterThan(publishStable)
        expect(otaUpdate).toBeGreaterThan(latestVerify)

        expect(workflow).toContain(
            'Pica-Library-v0.5.0-update-from-v0.4.11.zip'
        )
        expect(workflow).toContain(
            'Pica-Library-v0.5.0-upgrade-assistant-from-v0.4.11.zip'
        )
        expect(workflow).toContain('Pica-Library-Android-v55.apk')
        expect(workflow).toContain('android-update.json')
        expect(workflow).toContain(
            'test "$target" = "$GITHUB_SHA"'
        )
        expect(workflow).toContain(
            'ANDROID_V55_OTA_PUBLICATION=PASS'
        )
        expect(workflow).not.toContain('gh api --method PATCH')
    })
})
