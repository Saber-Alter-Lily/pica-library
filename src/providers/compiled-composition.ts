import type { Pica } from '../sdk'
import { SourceRuntime } from '../sources/source-policy'
import { EhProvider } from './eh-provider'
import { JmProvider } from './jm-provider'
import { PicaProvider } from './pica-provider'
import { ProviderRegistry } from './provider-registry'

export { picaComic } from './pica-provider'

/**
 * The existing compiled/proprietary-source application composition root.
 *
 * All three historical adapters are still linked by this *legacy* bundle.
 * This is a stable migration seam, NOT a claim of a source-free release.
 * The Reader and portable source contract must never import this factory.
 */
export function createCompiledProviderComposition(
    connectPica: () => Promise<Pica>,
    sources: SourceRuntime,
    overrides: { eh?: EhProvider; jm?: JmProvider } = {}
) {
    const pica = new PicaProvider(connectPica)
    const eh = overrides.eh ?? new EhProvider()
    const jm = overrides.jm ?? new JmProvider()
    eh.setSourceAccess?.(sources.acquire)
    jm.setSourceAccess?.(sources.acquire)
    const registry = new ProviderRegistry([pica, eh, jm])
    return { pica, eh, jm, registry }
}
