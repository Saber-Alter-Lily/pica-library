import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => fs.readFileSync(file, 'utf8')

describe('experimental macOS arm64 package P5B', () => {
    it('uses a real Apple Silicon runner but remains outside formal release', () => {
        const workflow = read('.github/workflows/macos-experimental.yml')
        const build = read('scripts/build-macos-experimental.sh')

        expect(workflow).toContain('runs-on: macos-15')
        expect(workflow).toContain('test "$(uname -m)" = "arm64"')
        expect(workflow).toContain(
            "'scripts/test-macos-preview-acceptance.sh'"
        )
        expect(workflow).toContain('actions/upload-artifact@v4')
        expect(workflow).toContain(
            'if: github.event.repository.private == false'
        )
        expect(workflow).toContain('retention-days: 1')
        expect(workflow).not.toContain('gh release')
        expect(workflow).not.toContain('contents: write')
        expect(build).toContain('macos-arm64-experimental')
        expect(build).toContain('formal_release:false')
        expect(build).toContain('signed:false')
        expect(build).toContain('notarized:false')
    })

    it('verifies the official arm64 Node runtime and documents the unsigned boundary', () => {
        const build = read('scripts/build-macos-experimental.sh')
        expect(build).toContain('node-v${NODE_VERSION}-darwin-arm64.tar.gz')
        expect(build).toContain('SHASUMS256.txt')
        expect(build).toContain('shasum -a 256')
        expect(build).toContain(
            'Experimental macOS package must be built on an arm64 macOS runner'
        )
        expect(build).toContain('unsigned experimental CI artifact')
        expect(build).toContain('not notarized')
        expect(build).toContain('Self-update is intentionally disabled')
    })

    it('locks the official Node macOS arm64 runtime baseline', () => {
        const build = read('scripts/build-macos-experimental.sh')

        expect(build).toContain('MIN_MACOS="13.5"')
        expect(build).toContain('otool -l "$STAGE/runtime/bin/node"')
        expect(build).toContain('LC_BUILD_VERSION')
        expect(build).toContain('NODE_MIN_MACOS')
        expect(build).toContain(
            'above the declared $MIN_MACOS baseline'
        )
        expect(build).toContain('PLATFORM_REQUIREMENTS.json')
        expect(build).toContain('"minimumMacOS": "$MIN_MACOS"')
        expect(build).toContain('"observedNodeMinOS": "$NODE_MIN_MACOS"')
    })

    it('tests preview-to-preview application replacement and data rollback', () => {
        const replacement = read('scripts/test-macos-preview-replacement.sh')
        const workflow = read('.github/workflows/macos-experimental.yml')

        expect(workflow).toContain(
            'Build first W4A macOS preview baseline for replacement gate'
        )
        expect(workflow).toContain(
            'Pica-Library-macos-arm64-preview-baseline.tar.gz'
        )
        expect(workflow).toContain(
            'bash scripts/test-macos-preview-replacement.sh "$baseline" "$candidate"'
        )
        expect(workflow).toContain(
            "'scripts/test-macos-preview-replacement.sh'"
        )
        expect(replacement).toContain('ditto "$source" "$INSTALL_ROOT"')
        expect(replacement).toContain('ditto "$DATA_HOME" "$DATA_SNAPSHOT"')
        expect(replacement).toContain('Candidate Marker')
        expect(replacement).toContain('shelves-rolled-back')
        expect(replacement).toContain(
            'schema upgrade did not create the required pre-migration backup'
        )
        expect(replacement).toContain(
            'macOS arm64 preview replacement/rollback acceptance: PASS'
        )
    })

    it('smokes platform identity, Keychain, native picker and external data placement', () => {
        const smoke = read('scripts/test-macos-experimental.sh')
        expect(smoke).toContain('"$PACKAGE_ROOT/pica-library" --headless')
        expect(smoke).toContain("status.runtime.mode!=='headless'")
        expect(smoke).toContain('status.runtime.mobileBridge!==false')
        expect(smoke).toContain('status.mobileBridge!==null')
        expect(smoke).toContain("status.platform.id!=='macos'")
        expect(smoke).toContain("status.platform.arch!=='arm64'")
        expect(smoke).toContain(
            "status.credentialBackend.kind!=='macos-keychain'"
        )
        expect(smoke).toContain(
            "status.nativePicker.backend!=='macos-osascript'"
        )
        expect(smoke).toContain(
            'Boolean(status.platform.managedEhWebLogin)!==hasBrowser'
        )
        expect(smoke).toContain('caps.features.updatePackages!==false')
        expect(smoke).toContain('PICA_LIBRARY_DESKTOP_HOME="$DATA_HOME"')
        expect(smoke).toContain('"$DATA_HOME/data/library.db"')
    })

    it('runs a packaged macOS arm64 vertical flow with real Keychain persistence', () => {
        const preview = read('scripts/test-macos-preview-acceptance.sh')
        const workflow = read('.github/workflows/macos-experimental.yml')

        expect(workflow).toContain(
            'bash scripts/test-macos-preview-acceptance.sh "$archive"'
        )
        expect(workflow).toContain(
            "'scripts/test-macos-preview-acceptance.sh'"
        )
        expect(preview).toContain('macOS arm64 preview acceptance requires')
        expect(preview).toContain('security create-keychain')
        expect(preview).toContain('security default-keychain -d user -s "$KEYCHAIN"')
        expect(preview).toContain('security find-generic-password')
        expect(preview).toContain('macos-preview-keychain-secret')
        expect(preview).toContain(
            'macOS Keychain credential was written into the application data root'
        )
        expect(preview).toContain('/api/v1/library/query')
        expect(preview).toContain('/api/v1/comics/macos-preview-1')
        expect(preview).toContain('/api/v1/shelves/$SHELF_ID/items')
        expect(preview).toContain(
            '/api/v1/reader/comics/macos-preview-1/chapters/macos-preview-ep-1'
        )
        expect(preview).toContain('/api/v1/reader/pictures/macos-preview-pic-1')
        expect(preview).toContain('/api/v1/reader/progress')
        expect(preview).toContain('/api/v1/downloads/$JOB_ID/pause')
        expect(preview).toContain('/api/v1/downloads/$JOB_ID/resume')
        expect(preview).toContain(
            'graceful shutdown did not persist the local job as PAUSED'
        )
        expect(preview).toContain('macOS arm64 preview vertical acceptance: PASS')
    })
})
