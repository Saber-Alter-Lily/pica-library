import assert from 'node:assert/strict'
import path from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

export const REAL_HOST_KIND = 'PINNED_SUWAYOMI_REAL_RUNTIME_SYNTHETIC_LOCAL_SOURCE_ONLY'
export const REAL_HOST_SOURCE = '40bc5da57820324ed0ae724cbbc020cc4673b594'
export const REAL_HOST_TAG = 'v2.4.2366'
export const REAL_HOST_JAR_SHA256 = 'af9feb20af9d7ebe9e30769e6c6ebc7fc7ab1c447388d42e0280b1da5fe07bfd'
export const REAL_HOST_JAR_BYTES = 182952426
export const REAL_HOST_BRANCH = 'refs/heads/codex/source-host-interop-20261026'

/** Must run before argument reads, TS/native loading, files, Java or listeners. */
export function assertRealHostCi(env = process.env, platform = process.platform) {
    if (platform !== 'linux' || env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
        env.GITHUB_REPOSITORY !== 'Saber-Alter-Lily/pica-library' || env.GITHUB_REF !== REAL_HOST_BRANCH || env.GITHUB_EVENT_NAME === 'pull_request')
        throw Error('Real host interop requires the separately authorized exact-branch disposable GitHub-hosted Linux runner')
}
export function checkedOwnedRealHostRoot(parent, root) {
    assert.ok(path.isAbsolute(parent) && path.dirname(parent) !== parent)
    assert.equal(path.dirname(root), parent)
    assert.match(path.basename(root), /^pica-real-host-[a-f0-9]{32}[A-Za-z0-9]{6}$/)
    return root
}
/** Official supported properties; no modified JAR, extension or WebView loader. */
export function realHostJavaArguments(root, jar) {
    assert.ok(path.isAbsolute(root) && path.isAbsolute(jar))
    return [
        '-Djava.awt.headless=true', '-Xmx768m', `-Duser.home=${path.join(root, 'home')}`, `-Djava.io.tmpdir=${path.join(root, 'java-tmp')}`,
        `-Dsuwayomi.tachidesk.config.server.rootDir=${path.join(root, 'host')}`,
        '-Dsuwayomi.tachidesk.config.server.ip=127.0.0.1', '-Dsuwayomi.tachidesk.config.server.port=4567',
        '-Dsuwayomi.tachidesk.config.server.initialOpenInBrowserEnabled=false', '-Dsuwayomi.tachidesk.config.server.systemTrayEnabled=false',
        '-Dsuwayomi.tachidesk.config.server.kcefEnabled=false', '-Dsuwayomi.tachidesk.config.server.webUIChannel=BUNDLED',
        '-Dsuwayomi.tachidesk.config.server.webUIUpdateCheckInterval=0', '-Dsuwayomi.tachidesk.config.server.globalUpdateInterval=0',
        '-Dsuwayomi.tachidesk.config.server.autoDownloadNewChapters=false', '-Dsuwayomi.tachidesk.config.server.extensionStores=[]',
        '-jar', jar
    ]
}

/** Owned synthetic test pixels, not supplied/hosted manga or application assets. */
export function syntheticHostPng(red, green, blue) {
    for (const color of [red, green, blue]) assert.ok(Number.isInteger(color) && color >= 0 && color <= 255)
    const chunk = (type, data) => {
        const tag = Buffer.from(type), size = Buffer.alloc(4), checksum = Buffer.alloc(4)
        size.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([tag, data])))
        return Buffer.concat([size, tag, data, checksum])
    }
    const header = Buffer.alloc(13); header.writeUInt32BE(8, 0); header.writeUInt32BE(8, 4); header[8] = 8; header[9] = 6
    const scanline = Buffer.concat([Buffer.from([0]), ...Array.from({ length: 8 }, () => Buffer.from([red, green, blue, 255]))])
    return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(Array(8).fill(scanline)))), chunk('IEND', Buffer.alloc(0))])
}
