import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => fs.readFileSync(file, 'utf8')

describe('experimental macOS arm64 package P5B', () => {
    it('uses a real Apple Silicon runner but remains outside formal release', () => {
        const workflow = read('.github/workflows/macos-experimental.yml')
        const build = read('scripts/build-macos-experimental.sh')

        expect(workflow).toContain('runs-on: macos-15')
        expect(workflow).toContain('test "$(uname -m)" = "arm64"')
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
})
