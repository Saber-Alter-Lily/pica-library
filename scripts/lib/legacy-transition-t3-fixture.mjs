import assert from 'node:assert/strict'
import path from 'node:path'
import { FIRST_HOP_BASELINE, createFirstHopFetch } from './old-client-first-hop.mjs'

export const T3_BASELINE = FIRST_HOP_BASELINE
export const T3_KIND = 'SYNTHETIC_LEGACY_TRANSITION_T3_ONLY_NO_DISTRIBUTABLE_TOOL'
export const T3_VERSIONS = Object.freeze(['0.5.1', '0.5.2'])
export const T3_SCENARIOS = Object.freeze(['preview-cancel', 'integrity-rejections', 'running-refusal', 'concurrent-entry', 'success-forward', 'launch-rollback', 'health-rollback'])
export const T3_PTY_VERSION = '1.1.0'
export const T3_PLAYWRIGHT_VERSION = '1.63.0'

export function t3OwnedPath(root, value) {
    const resolved = path.resolve(String(value)), relative = path.relative(root, resolved)
    assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'T3 path escaped owned root')
    return resolved
}
export function checkedT3Descriptor(input) {
    assert.equal(input.schemaVersion, 1); assert.equal(input.kind, T3_KIND)
    assert.ok(T3_SCENARIOS.includes(input.scenario)); assert.match(input.nonce ?? '', /^[a-f0-9]{32}$/)
    assert.match(input.sourceSha ?? '', /^[a-f0-9]{40}$/)
    for (const name of ['root', 'applicationRoot', 'auditFile', 'forwardArchive']) assert.ok(typeof input[name] === 'string' && path.isAbsolute(input[name]))
    for (const name of ['transitionSha256', 'helperSha256', 'desktop1Sha256', 'desktop2Sha256', 'forwardSha256']) assert.match(input[name] ?? '', /^[a-f0-9]{64}$/)
    assert.equal(input.publicationAuthenticated, false); assert.equal(input.syntheticStableAuthorityOnly, true)
    return input
}

/** Reuse the existing exact v0.5.2 inert publisher, not a new network transport.
 * That old fixture's health-rollback name chooses publisher version 0.5.2 only;
 * actual negative health injection is separately scoped in the external preload.
 */
export function t3ForwardTransport({ archiveBytes, allowedDesktop, nativeFetch, observe }) {
    return createFirstHopFetch({ scenario: 'health-rollback', archiveBytes, releasedDesktop: allowedDesktop, nativeFetch, observe })
}
