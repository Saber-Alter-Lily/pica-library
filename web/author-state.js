export function deriveLiteAuthors(records, normalize) {
    const groups = new Map()
    for (const comic of records) {
        const raw = String(comic.canonicalAuthor || comic.author || '').trim()
        const match = raw.match(/^(.+?)\s*\(([^()]+)\)$/)
        const name = match ? match[2].trim() : raw
        const nameKey = name ? undefined : 'common.unknownAuthor'
        const key = normalize(name || nameKey)
        const group = groups.get(key) || {
            id: `lite_${key}`,
            canonicalName: name,
            canonicalNameKey: nameKey,
            aliases: new Set(),
            circles: new Set(),
            works: 0,
            confidence: match ? 0.8 : 1,
            reviewStatus: match ? 'pending' : 'approved',
            evidenceKey: match
                ? 'author.evidence.circlePattern'
                : 'author.evidence.normalized'
        }
        group.works += 1
        if (raw) group.aliases.add(raw)
        if (match) group.circles.add(match[1].trim())
        groups.set(key, group)
        comic.canonicalAuthor = name
    }
    return [...groups.values()]
        .map((group) => ({
            ...group,
            aliases: [...group.aliases],
            circles: [...group.circles]
        }))
        .sort((left, right) => right.works - left.works)
}
