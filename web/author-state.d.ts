export interface LiteAuthorRecord {
    canonicalAuthor?: string
    author?: string
    [key: string]: unknown
}

export interface LiteDerivedAuthor {
    id: string
    canonicalName: string
    canonicalNameKey?: string
    aliases: string[]
    circles: string[]
    works: number
    confidence: number
    reviewStatus: 'pending' | 'approved'
    evidenceKey: string
}

export function deriveLiteAuthors(
    records: LiteAuthorRecord[],
    normalize: (value: unknown) => string
): LiteDerivedAuthor[]
