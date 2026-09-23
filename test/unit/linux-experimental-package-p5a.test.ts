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
            'Credential capability disagrees with live backend status'
        )
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
        expect(preview).toContain('credentialSessionConfigured')
        expect(preview).toContain('credentialSessionCleared')
        expect(preview).toContain('session-only Linux credential was written to disk')
        expect(preview).toContain('linux-preview-session-secret')
    })
    it('runs the packaged runtime on a real glibc 2.28 userspace', () => {
        const baseline = read('scripts/test-linux-glibc228-container.sh')
        const workflow = read('.github/workflows/linux-experimental.yml')

        expect(baseline).toContain('rockylinux:8.9')
        expect(baseline).toContain('expected Rocky Linux 8.9 glibc 2.28')
        expect(baseline).toContain('--platform linux/amd64')
        expect(baseline).toContain('--user "$(id -u):$(id -g)"')
        expect(baseline).toContain('-e HOME=/data/home')
        expect(baseline).toContain('dst=/opt/pica,readonly')
        expect(baseline).toContain('/opt/pica/pica-library --headless')
        expect(baseline).toContain('/api/v1/capabilities')
        expect(baseline).toContain('/api/v1/desktop/shutdown')
        expect(baseline).toContain('Linux glibc 2.28 packaged runtime gate: PASS')
        expect(workflow).toContain(
            'bash scripts/test-linux-glibc228-container.sh "$archive"'
        )
        expect(workflow).toContain(
            "'scripts/test-linux-glibc228-container.sh'"
        )
    })

    it('tests application replacement and rollback against the first W4A preview baseline', () => {
        const replacement = read('scripts/test-linux-preview-replacement.sh')
        const workflow = read('.github/workflows/linux-experimental.yml')

        expect(workflow).toContain(
            'BASE_SHA: 9104ed6774b33d903becf73ee1f16168c9bc5f3d'
        )
        expect(workflow).toContain('git worktree add --detach')
        expect(workflow).toContain(
            'artifacts/Pica-Library-linux-x64-preview-baseline.tar.gz'
        )
        expect(workflow).toContain(
            'bash scripts/test-linux-preview-replacement.sh "$baseline" "$candidate"'
        )
        expect(workflow).toContain(
            "'scripts/test-linux-preview-replacement.sh'"
        )
        expect(replacement).toContain('replacement gate requires distinct preview builds')
        expect(replacement).toContain('cp -a "$DATA_HOME" "$DATA_SNAPSHOT"')
        expect(replacement).toContain('candidate application replacement did not take effect')
        expect(replacement).toContain('schema upgrade did not create the required pre-migration backup')
        expect(replacement).toContain('rollback did not restore the pre-upgrade data snapshot')
        expect(replacement).toContain('baseline application rollback did not take effect')
        expect(replacement).toContain('Linux preview replacement/rollback acceptance: PASS')
    })

    it('locks the GNU/Linux x64 runtime compatibility baseline', () => {
        const build = read('scripts/build-linux-experimental.sh')
        const preflight = read('scripts/linux-runtime-preflight.sh')
        const smoke = read('scripts/test-linux-experimental.sh')
        const workflow = read('.github/workflows/linux-experimental.yml')

        expect(build).toContain('MIN_GLIBC="2.28"')
        expect(build).toContain('MIN_GLIBCXX="3.4.25"')
        expect(build).toContain('SUPPORT_KERNEL="4.18"')
        expect(build).toContain("readelf --version-info")
        expect(build).toContain('above the declared $MIN_GLIBC baseline')
        expect(build).toContain('PLATFORM_REQUIREMENTS.json')
        expect(build).toContain('Alpine/musl is not supported')
        expect(preflight).toContain('getconf GNU_LIBC_VERSION')
        expect(preflight).toContain('requires GNU glibc >= $MIN_GLIBC')
        expect(preflight).toContain('requires an x86-64 system')
        expect(preflight).toContain('Continuing outside the tested baseline')
        expect(smoke).toContain('Linux glibc baseline mismatch')
        expect(smoke).toContain('Linux kernel support baseline mismatch')
        expect(workflow).toContain("'scripts/linux-runtime-preflight.sh'")
    })

})
