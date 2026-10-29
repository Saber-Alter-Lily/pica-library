/**
 * A conservative, source-neutral *presentation* check for the authenticated
 * signed-reader route. It does not grant access: Desktop verifies the session,
 * publisher and work ownership on every request.
 *
 * v1 external sources use "source:opaque". Historical owned catalogue records
 * can use a second opaque component (for example a gallery ID plus token).
 * Neither shape is a URL, path, Host identifier or extension loader.
 */
const SOURCE = /^[a-z][a-z0-9-]{1,31}$/
const OPAQUE = /^[A-Za-z0-9_-]{1,128}$/
const RESERVED = new Set([
    'local', 'hosted', 'http', 'https', 'file', 'data', 'javascript'
])

export function isSignedReaderComicId(value) {
    if (typeof value !== 'string' || value.length > 290) return false
    const segments = value.split(':')
    if (segments.length !== 2 && segments.length !== 3) return false
    const source = segments[0]
    return SOURCE.test(source) && !RESERVED.has(source) &&
        segments.slice(1).every(segment => OPAQUE.test(segment))
}
