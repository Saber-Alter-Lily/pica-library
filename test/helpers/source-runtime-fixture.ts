import { initialSourcePolicy, SourceRuntime } from '../../src/sources/source-policy'

/** Historical online fixtures explicitly request their old enabled-source context. */
export function enabledFixtureSources() {
    return new SourceRuntime(initialSourcePolicy(true))
}
