/** Pure display/key normalization shared with ranking; hashing stays in storage. */
export function normalizeDisplay(value: unknown): string {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

export function normalizeAuthorKey(value: unknown): string {
    return normalizeDisplay(value).toLocaleLowerCase('und')
}
