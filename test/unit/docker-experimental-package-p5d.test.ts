import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => fs.readFileSync(file, 'utf8')

describe('experimental Docker headless package P5D', () => {
    it('stays explicitly experimental and outside formal release channels', () => {
        const workflow = read('.github/workflows/docker-experimental.yml')
        const build = read('scripts/build-docker-experimental.sh')

        expect(workflow).toContain('Experimental Docker Headless Package')
        expect(workflow).toContain('actions/upload-artifact@v4')
        expect(workflow).toContain('retention-days: 1')
        expect(workflow).toContain(
            'if: github.event.repository.private == false'
        )
        expect(workflow).not.toContain('gh release')
        expect(workflow).not.toContain('contents: write')
        expect(build).toContain('formal_release:false')
        expect(build).toContain('remote_web_exposed:false')
    })

    it('builds from the verified Linux package and ships no remote port', () => {
        const dockerfile = read(
            'packaging/docker/experimental/Dockerfile'
        )
        const build = read('scripts/build-docker-experimental.sh')

        expect(build).toContain(
            'bash "$ROOT/scripts/build-linux-experimental.sh"'
        )
        expect(build).toContain(
            "name 'Pica-Library-*-linux-x64-experimental.tar.gz'"
        )
        expect(dockerfile).toContain('FROM debian:bookworm-slim')
        expect(dockerfile).toContain('USER 10001:10001')
        expect(dockerfile).toContain(
            'PICA_LIBRARY_DESKTOP_HOME=/config'
        )
        expect(dockerfile).toContain('"--headless"')
        expect(dockerfile).not.toContain('EXPOSE ')
        expect(build).toContain(
            "Experimental Docker image must not expose remote ports"
        )
    })

    it('smokes a non-root, offline, restartable headless lifecycle entirely inside the container', () => {
        const smoke = read('scripts/test-docker-experimental.sh')

        expect(smoke).toContain(
            'docker run --detach --network none'
        )
        expect(smoke).toContain(
            "status.runtime.mode!=='headless'"
        )
        expect(smoke).toContain(
            'status.runtime.mobileBridge!==false'
        )
        expect(smoke).toContain('status.mobileBridge!==null')
        expect(smoke).toContain(
            "status.platform.id!=='linux'"
        )
        expect(smoke).toContain(
            "status.credentialBackend.kind!=='session-memory'"
        )
        expect(smoke).toContain('docker port "$NAME"')
        expect(smoke).toContain("process.getuid?.()")
        expect(smoke).toContain('/config/data/library.db')
        expect(smoke).toContain('docker stop --time 10')
        expect(smoke).toContain('docker start "$NAME"')
        expect(smoke).toContain(
            '"$URL/api/v1/desktop/shutdown"'
        )
    })

    it('records image provenance and base-image identity for the one-day artifact', () => {
        const build = read('scripts/build-docker-experimental.sh')
        expect(build).toContain('SOURCE_SHA')
        expect(build).toContain('BASE_DIGEST')
        expect(build).toContain(
            'DOCKER-EXPERIMENTAL-METADATA.json'
        )
        expect(build).toContain(
            'DOCKER-EXPERIMENTAL-SHA256SUMS.txt'
        )
        expect(build).toContain('docker save "$IMAGE"')
        expect(build).toContain('sha256sum "$ARCHIVE"')
    })
})
