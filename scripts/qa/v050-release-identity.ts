/** CI-only provenance for the publicly published v0.5.0 source checkout.
 * Shared by all synthetic historical fixture jobs; no network, credentials,
 * checkout mutation, DB migration or production installation access.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

export const V050_RELEASE_COMMIT =
    'bec7f9f31828e8c57e0a2c103b6b1206c22c37cf'

const releaseBlobs = {
    'src/library/database.ts': '649f19b65ca67996b934b9e15535135f8889b96f',
    'src/desktop/config.ts': '58792d6f15315b6000cd28db20319132f5bba91b',
    'src/desktop/types.ts': 'e63de26c3a592542ea1b0efc0c06b0fd50c70e72',
    'src/desktop/paths.ts': 'f4cf5e3f6bf3d5b9603dbbcc295d8ff58659ae8d',
    'src/storage/sqlite/migrations.ts': '4a98683fb29feec31970d3958385968f65af6365'
} as const

function fail(reason: string): never {
    throw new Error('V050_TAG_SOURCE_' + reason)
}
function gitBlobSha(bytes: Buffer) {
    return createHash('sha1')
        .update(Buffer.from('blob ' + bytes.length + '\0'))
        .update(bytes)
        .digest('hex')
}

export function verifyPinnedV050Checkout() {
    if (process.env.GITHUB_ACTIONS !== 'true' ||
        process.env.GITHUB_REPOSITORY !== 'Saber-Alter-Lily/pica-library')
        fail('CI_ONLY')
    const root = fs.realpathSync.native(process.cwd())
    const checkout = path.join(root, 'release-v050')
    const stat = fs.lstatSync(checkout, { throwIfNoEntry: false })
    if (!stat?.isDirectory() || stat.isSymbolicLink())
        fail('CHECKOUT_NOT_PRESENT')
    const real = fs.realpathSync.native(checkout)
    if (path.dirname(real).toLowerCase() !== root.toLowerCase())
        fail('CHECKOUT_OUTSIDE_PROJECT')
    const rev = execFileSync('git', ['-C', real, 'rev-parse', 'HEAD'],
        { encoding: 'utf8' }).trim()
    if (rev !== V050_RELEASE_COMMIT)
        fail('COMMIT_IDENTITY_MISMATCH')
    const dirty = execFileSync('git', ['-C', real, 'status', '--porcelain'],
        { encoding: 'utf8' }).trim()
    if (dirty) fail('DIRTY_SOURCE_CHECKOUT')
    for (const [relative, expected] of Object.entries(releaseBlobs)) {
        const actual = gitBlobSha(fs.readFileSync(
            path.join(real, ...relative.split('/'))
        ))
        if (actual !== expected)
            fail('BLOB_IDENTITY_MISMATCH')
    }
    return real
}
