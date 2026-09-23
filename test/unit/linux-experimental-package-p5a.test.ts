import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => fs.readFileSync(file, 'utf8')

describe('experimental Linux x64 package P5A', () => {
    it('stays explicitly experimental and outside the formal release channel', () => {
        const build = read('scripts/build-linux-experimental.sh')
        const workflow = read('.github/workflows/linux-experimental.yml')

        expect(build).toContain('linux-x64-experimental')
        expect(build).toContain('formal_release:false')
        expect(build).toContain('Self-update is intentionally disabled')
        expect(workflow).toContain('actions/upload-artifact@v4')
        expect(workflow).toContain('retention-days: 1')
        expect(workflow).toContain(
            'if: github.event.repository.private == false'
        )
        expect(workflow).not.toContain('gh release')
        expect(workflow).not.toContain('releases/latest')
        expect(workflow).not.toContain('contents: write')
    })

    it('ships an official verified Node runtime and excludes user data', () => {
        const build = read('scripts/build-linux-experimental.sh')
        expect(build).toContain('node-v${NODE_VERSION}-linux-x64.tar.xz')
        expect(build).toContain('SHASUMS256.txt')
        expect(build).toContain('Official Node.js runtime checksum mismatch')
        expect(build).toContain('find "$STAGE" -type f')
        expect(build).toContain('node_modules must not be shipped')
        expect(build).toContain('SOURCE_SHA.txt')
    })

    it('smokes the packaged runtime with an external user-data root', () => {
        const smoke = read('scripts/test-linux-experimental.sh')
        expect(smoke).toContain('PICA_LIBRARY_DESKTOP_HOME="$DATA_HOME"')
        expect(smoke).toContain('"$PACKAGE_ROOT/pica-library" --headless')
        expect(smoke).toContain("status.runtime.mode!=='headless'")
        expect(smoke).toContain('status.runtime.mobileBridge!==false')
        expect(smoke).toContain('status.mobileBridge!==null')
        expect(smoke).toContain("status.platform.id!=='linux'")
        expect(smoke).toContain(
            "status.platform.distributionReady!==false"
        )
        expect(smoke).toContain("status.platform.selfUpdate!==false")
        expect(smoke).toContain('caps.features.updatePackages!==false')
        expect(smoke).toContain(
            '"$URL/api/v1/desktop/shutdown"'
        )
        expect(smoke).toContain(
            '"$DATA_HOME/data/library.db"'
        )
    })

    it('runs a packaged Linux user-flow acceptance before artifact publication', () => {
        const preview = read('scripts/test-linux-preview-acceptance.sh')
        const workflow = read('.github/workflows/linux-experimental.yml')

        expect(workflow).toContain(
            'bash scripts/test-linux-preview-acceptance.sh "$archive"'
        )
        expect(preview).toContain('"$PACKAGE_ROOT/app/pica-library.js"')
        expect(preview).toContain('/api/v1/library/query')
        expect(preview).toContain('/api/v1/comics/linux-preview-1')
        expect(preview).toContain('/api/v1/shelves/$SHELF_ID/items')
        expect(preview).toContain(
            '/api/v1/reader/comics/linux-preview-1/chapters/linux-preview-ep-1'
        )
        expect(preview).toContain('/api/v1/reader/pictures/linux-preview-pic-1')
        expect(preview).toContain('/api/v1/reader/progress')
        expect(preview).toContain('/api/v1/downloads/$JOB_ID/pause')
        expect(preview).toContain('/api/v1/downloads/$JOB_ID/resume')
        expect(preview).toContain('download-resumed-after-restart.json')
        expect(preview).toContain('reader progress did not persist across restart')
        expect(preview).toContain('shelf did not persist across restart')
        expect(preview).toContain('graceful shutdown did not persist the local job as PAUSED')
        expect(preview).toContain(
            'preview flow wrote user state into the application package'
        )
    })
})
