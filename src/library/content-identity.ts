/** Catalog identity is broader than an online source. Local files never get an online adapter. */
export type CatalogSourceId = 'pica' | 'eh' | 'jm' | 'local'

export function catalogSourceId(
    comicId: string,
    declared?: CatalogSourceId
): CatalogSourceId {
    const prefix = comicId.includes(':') ? comicId.split(':', 1)[0] : 'pica'
    if (!['pica', 'eh', 'jm', 'local'].includes(prefix))
        throw new Error('Unrecognized catalog source')
    if (declared && declared !== prefix)
        throw new Error('Catalog source identity mismatch')
    return prefix as CatalogSourceId
}
