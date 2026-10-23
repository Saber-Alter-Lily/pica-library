/** Personal configuration only. Provider metadata and the frozen registry stay immutable. */
export const TAG_POLICY_SCHEMA_VERSION = 1
export const PRIVATE_TAG_PREFIX = '@private/'
export type TagProviderV1 = 'pica' | 'eh' | 'jm'
export interface PrivateTagV1 {
    id: string
    name: string
    kind: 'MANUAL' | 'MAPPED'
    comicIds: string[]
    /** Exact, provider-scoped raw tag identities. Multiple mappings mean ANY, not AND. */
    mappings: string[]
}
export interface TagPolicyV1 {
    schemaVersion: 1
    mode: 'ALL' | 'SELECTED'
    selected: string[]
    disabled: string[]
    privateTags: PrivateTagV1[]
}
export type TagPolicyCarrierV1 = { tagPolicy?: TagPolicyV1 }
export interface TagComicV1 {
    comicId: string
    providerId?: TagProviderV1
    tags: string[]
    providerMetadata?: Record<string, unknown>
}
export interface TagCatalogComicV1 extends TagComicV1 {
    isFavorite: boolean
}
export const normalizeTagPolicyKey = (value: unknown) =>
    String(value ?? '')
        .normalize('NFKC')
        .trim()
        .toLocaleLowerCase('und')
        .replace(/\s+/g, ' ')
const providers = new Set(['pica', 'eh', 'jm', 'private'])
const privateIdPattern = /^pt_[a-f0-9]{32}$/
export const privateTagSignalV1 = (id: string) => PRIVATE_TAG_PREFIX + id
export const tagIdentityV1 = (
    provider: TagProviderV1 | 'private',
    raw: string
) => `${provider}|${normalizeTagPolicyKey(raw)}`
export function comicTagProviderV1(
    comic: Pick<TagComicV1, 'comicId' | 'providerId'>
): TagProviderV1 {
    if (comic.providerId === 'eh' || comic.comicId.startsWith('eh:'))
        return 'eh'
    if (comic.providerId === 'jm' || comic.comicId.startsWith('jm:'))
        return 'jm'
    return 'pica'
}
/** EH's display tags omit namespaces; its rawTags sidecar is the authority when present. */
export function providerRawTagFactsV1(comic: TagComicV1): string[] {
    const raw =
        comicTagProviderV1(comic) === 'eh'
            ? comic.providerMetadata?.rawTags
            : undefined
    return Array.isArray(raw) &&
        raw.some((value) => typeof value === 'string' && value.trim())
        ? [
              ...new Set(
                  raw.filter(
                      (value): value is string =>
                          typeof value === 'string' && Boolean(value.trim())
                  )
              )
          ]
        : comic.tags
}
export function semanticTagValueV1(provider: TagProviderV1, raw: string) {
    const split = raw.indexOf(':')
    return provider === 'eh' && split > 0 ? raw.slice(split + 1).trim() : raw
}
export function defaultTagPolicyV1(): TagPolicyV1 {
    return {
        schemaVersion: 1,
        mode: 'ALL',
        selected: [],
        disabled: [],
        privateTags: []
    }
}

function strings(value: unknown, maximum: number) {
    if (
        !Array.isArray(value) ||
        value.length > maximum ||
        value.some((v) => typeof v !== 'string')
    )
        throw new Error('Invalid or oversized tag-policy list')
    return [
        ...new Set(value.map((v) => normalizeTagPolicyKey(v)).filter(Boolean))
    ].sort()
}
function identities(value: unknown) {
    const values = strings(value, 4096)
    for (const id of values) {
        const split = id.indexOf('|'),
            provider = id.slice(0, split),
            key = id.slice(split + 1)
        if (
            split < 1 ||
            !providers.has(provider) ||
            !key ||
            key.length > 200 ||
            (provider === 'private' && !privateIdPattern.test(key))
        )
            throw new Error('Invalid provider-scoped tag identity')
    }
    return values
}
/** Missing old-client state means ALL. Unknown/malformed explicit state is rejected, never reset. */
export function normalizeTagPolicyV1(value?: unknown): TagPolicyV1 {
    if (value === undefined || value === null) return defaultTagPolicyV1()
    if (typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid tag policy')
    const raw = value as Record<string, unknown>
    if (
        raw.schemaVersion !== 1 ||
        !['ALL', 'SELECTED'].includes(String(raw.mode)) ||
        !Array.isArray(raw.privateTags) ||
        raw.privateTags.length > 100
    )
        throw new Error('Unsupported or invalid tag policy')
    const seen = new Set<string>()
    let bindings = 0
    const privateTags = raw.privateTags
        .map((input) => {
            if (!input || typeof input !== 'object' || Array.isArray(input))
                throw new Error('Invalid private tag')
            const item = input as Record<string, unknown>,
                id = String(item.id ?? ''),
                name = String(item.name ?? '')
                    .normalize('NFKC')
                    .trim()
            if (
                !privateIdPattern.test(id) ||
                seen.has(id) ||
                !name ||
                name.length > 80 ||
                /[\u0000-\u001f\u007f]/.test(name) ||
                !['MANUAL', 'MAPPED'].includes(String(item.kind))
            )
                throw new Error('Invalid private-tag identity or name')
            seen.add(id)
            const comicIds = strings(item.comicIds, 4096)
            if (comicIds.some((id) => id.length > 200))
                throw new Error('Invalid private-tag comic identity')
            const mappings = identities(item.mappings)
            if (
                mappings.some((id) => id.startsWith('private|')) ||
                (item.kind === 'MANUAL' && mappings.length) ||
                (item.kind === 'MAPPED' && comicIds.length)
            )
                throw new Error(
                    'Private tags cannot reference other private tags or mix binding modes'
                )
            bindings += comicIds.length + mappings.length
            if (bindings > 4096)
                throw new Error('Too many private-tag bindings')
            return {
                id,
                name,
                kind: item.kind as PrivateTagV1['kind'],
                comicIds,
                mappings
            }
        })
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const result: TagPolicyV1 = {
        schemaVersion: 1,
        mode: raw.mode as TagPolicyV1['mode'],
        selected: identities(raw.selected),
        disabled: identities(raw.disabled),
        privateTags
    }
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 128 * 1024)
        throw new Error('Tag policy exceeds 128 KiB')
    return result
}
export const tagPoliciesEqualV1 = (a: unknown, b: unknown) =>
    JSON.stringify(normalizeTagPolicyV1(a)) ===
    JSON.stringify(normalizeTagPolicyV1(b))
// Policy objects are immutable snapshots. Cache validation per object, not per comic/tag.
const validated = new WeakMap<TagPolicyV1, TagPolicyV1>()
const legacyDefault = defaultTagPolicyV1()
export function effectiveTagPolicyV1(state: TagPolicyCarrierV1) {
    if (!state.tagPolicy) return legacyDefault
    let policy = validated.get(state.tagPolicy)
    if (!policy) {
        policy = normalizeTagPolicyV1(state.tagPolicy)
        validated.set(state.tagPolicy, policy)
    }
    return policy
}
export function tagParticipatesV1(policy: TagPolicyV1, identity: string) {
    return policy.mode === 'ALL'
        ? !policy.disabled.includes(identity)
        : policy.selected.includes(identity)
}
export function rawTagParticipatesV1(
    state: TagPolicyCarrierV1,
    provider: TagProviderV1,
    tag: string
) {
    return tagParticipatesV1(
        effectiveTagPolicyV1(state),
        tagIdentityV1(provider, tag)
    )
}
const bindingIndex = new WeakMap<
    PrivateTagV1,
    { comics: Set<string>; mappings: Set<string> }
>()
export function privateTagMatchesV1(tag: PrivateTagV1, comic: TagComicV1) {
    let index = bindingIndex.get(tag)
    if (!index) {
        index = {
            comics: new Set(tag.comicIds),
            mappings: new Set(tag.mappings)
        }
        bindingIndex.set(tag, index)
    }
    if (tag.kind === 'MANUAL')
        return index.comics.has(normalizeTagPolicyKey(comic.comicId))
    const provider = comicTagProviderV1(comic)
    return providerRawTagFactsV1(comic).some((raw) =>
        index!.mappings.has(tagIdentityV1(provider, raw))
    )
}
export function privateTagForSignalV1(state: TagPolicyCarrierV1, key: string) {
    const normalized = normalizeTagPolicyKey(key)
    return normalized.startsWith(PRIVATE_TAG_PREFIX)
        ? effectiveTagPolicyV1(state).privateTags.find(
              (tag) => privateTagSignalV1(tag.id) === normalized
          )
        : undefined
}
/** Raw safety checks MUST use the original comic, not this taste-only projection. */
export function projectComicTagSignalsV1<T extends TagComicV1>(
    comic: T,
    state: TagPolicyCarrierV1,
    includePrivate = true
): T {
    const policy = effectiveTagPolicyV1(state),
        provider = comicTagProviderV1(comic)
    const tags = providerRawTagFactsV1(comic)
        .filter(
            (raw) =>
                !normalizeTagPolicyKey(raw).startsWith(PRIVATE_TAG_PREFIX) &&
                tagParticipatesV1(policy, tagIdentityV1(provider, raw))
        )
        .map((raw) => semanticTagValueV1(provider, raw))
    if (includePrivate)
        for (const tag of policy.privateTags)
            if (
                tagParticipatesV1(policy, tagIdentityV1('private', tag.id)) &&
                privateTagMatchesV1(tag, comic)
            )
                tags.push(privateTagSignalV1(tag.id))
    return { ...comic, tags: [...new Set(tags)] }
}
/** Controls without a comic context are eligible only if some selected provider permits the raw key. */
export function tagControlParticipatesV1(
    state: TagPolicyCarrierV1,
    key: string,
    comic?: TagComicV1
) {
    const policy = effectiveTagPolicyV1(state),
        normalized = normalizeTagPolicyKey(key)
    if (normalized.startsWith(PRIVATE_TAG_PREFIX)) {
        const tag = privateTagForSignalV1(state, normalized)
        return Boolean(
            tag && tagParticipatesV1(policy, tagIdentityV1('private', tag.id))
        )
    }
    if (comic) {
        const provider = comicTagProviderV1(comic)
        const facts = providerRawTagFactsV1(comic).filter(
            (raw) =>
                normalizeTagPolicyKey(raw) === normalized ||
                normalizeTagPolicyKey(semanticTagValueV1(provider, raw)) ===
                    normalized
        )
        return facts.length
            ? facts.some((raw) =>
                  tagParticipatesV1(policy, tagIdentityV1(provider, raw))
              )
            : tagParticipatesV1(policy, tagIdentityV1(provider, normalized))
    }
    return (
        (['pica', 'eh', 'jm'] as const).some((provider) =>
            tagParticipatesV1(policy, tagIdentityV1(provider, normalized))
        ) ||
        (policy.mode === 'SELECTED' &&
            policy.selected.some(
                (identity) =>
                    identity.startsWith('eh|') &&
                    normalizeTagPolicyKey(
                        semanticTagValueV1('eh', identity.slice(3))
                    ) === normalized
            ))
    )
}
export function providerTagSignalParticipatesV1(
    state: TagPolicyCarrierV1,
    provider: TagProviderV1,
    key: string,
    catalog: TagCatalogComicV1[]
) {
    const normalized = normalizeTagPolicyKey(key)
    const observed = catalog.filter(
        (comic) =>
            comicTagProviderV1(comic) === provider &&
            providerRawTagFactsV1(comic).some(
                (raw) =>
                    normalizeTagPolicyKey(raw) === normalized ||
                    normalizeTagPolicyKey(semanticTagValueV1(provider, raw)) ===
                        normalized
            )
    )
    if (observed.length)
        return observed.some((comic) =>
            tagControlParticipatesV1(state, key, comic)
        )
    return rawTagParticipatesV1(state, provider, key)
}

export interface TagDirectoryRowV1 {
    identity: string
    provider: TagProviderV1 | 'private'
    key: string
    label: string
    facet: string
    supportCount: number
    catalogCount: number
    enabled: boolean
    kind: 'PROVIDER_RAW' | 'PRIVATE_MANUAL' | 'PRIVATE_MAPPED'
}
export function buildTagDirectoryV1(
    catalog: TagCatalogComicV1[],
    state: TagPolicyCarrierV1,
    classify: (provider: TagProviderV1, raw: string) => string = () => 'OTHER',
    extraPicaTags: string[] = []
): TagDirectoryRowV1[] {
    const policy = normalizeTagPolicyV1(state.tagPolicy)
    const rows = new Map<
        string,
        TagDirectoryRowV1 & { favorites: Set<string>; catalog: Set<string> }
    >()
    const add = (
        provider: TagProviderV1,
        raw: string,
        comic?: TagCatalogComicV1
    ) => {
        const key = normalizeTagPolicyKey(raw)
        if (!key) return
        const identity = tagIdentityV1(provider, key)
        const row = rows.get(identity) ?? {
            identity,
            provider,
            key,
            label: raw,
            facet: classify(provider, raw),
            supportCount: 0,
            catalogCount: 0,
            enabled: tagParticipatesV1(policy, identity),
            kind: 'PROVIDER_RAW' as const,
            favorites: new Set<string>(),
            catalog: new Set<string>()
        }
        if (comic) {
            row.catalog.add(comic.comicId)
            if (comic.isFavorite) row.favorites.add(comic.comicId)
        }
        rows.set(identity, row)
    }
    for (const raw of extraPicaTags) add('pica', raw)
    for (const comic of catalog)
        for (const raw of providerRawTagFactsV1(comic))
            add(comicTagProviderV1(comic), raw, comic)
    const values: TagDirectoryRowV1[] = [...rows.values()].map(
        ({ favorites, catalog: ids, ...row }) => ({
            ...row,
            supportCount: favorites.size,
            catalogCount: ids.size
        })
    )
    for (const tag of policy.privateTags) {
        const matched = catalog.filter((comic) =>
            privateTagMatchesV1(tag, comic)
        )
        values.push({
            identity: tagIdentityV1('private', tag.id),
            provider: 'private',
            key: privateTagSignalV1(tag.id),
            label: tag.name,
            facet: 'PRIVATE',
            supportCount: new Set(
                matched
                    .filter((comic) => comic.isFavorite)
                    .map((c) => c.comicId)
            ).size,
            catalogCount: new Set(matched.map((c) => c.comicId)).size,
            enabled: tagParticipatesV1(
                policy,
                tagIdentityV1('private', tag.id)
            ),
            kind: tag.kind === 'MANUAL' ? 'PRIVATE_MANUAL' : 'PRIVATE_MAPPED'
        })
    }
    return values.sort(
        (a, b) =>
            a.facet.localeCompare(b.facet) ||
            b.supportCount - a.supportCount ||
            a.identity.localeCompare(b.identity)
    )
}

/** Whole-scheme three-way merge: no clock wins or silent cross-device overwrite. */
export function previewTagPolicyMergeV1(
    current: unknown,
    base: unknown,
    requested: unknown,
    resolution?: unknown
) {
    const desktop = normalizeTagPolicyV1(current)
    if (requested === undefined)
        return { next: desktop, changed: false, conflict: null }
    const android = normalizeTagPolicyV1(requested),
        baseline = normalizeTagPolicyV1(base)
    const conflict =
        !tagPoliciesEqualV1(desktop, baseline) &&
        !tagPoliciesEqualV1(android, baseline) &&
        !tagPoliciesEqualV1(android, desktop)
    if (conflict && resolution !== 'ANDROID' && resolution !== 'DESKTOP')
        return {
            next: desktop,
            changed: false,
            conflict: {
                identity: 'TAG_POLICY_V1',
                base: baseline,
                desktop,
                android
            }
        }
    const next =
        (conflict && resolution === 'DESKTOP') ||
        tagPoliciesEqualV1(android, baseline)
            ? desktop
            : android
    return { next, changed: !tagPoliciesEqualV1(next, desktop), conflict: null }
}
