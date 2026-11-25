import type { StoredComic } from '../library/types'
import { normalizePreferenceKey, type SessionIntentV5 } from '../recommendation-v5/portable-policy'
import { batchAuthorKey } from './batch-freshness-v3'
import { FINAL_BATCH_SIZE } from './batch-allocator-v3'
import type { RankedCandidateWithEvidenceV3 } from './ranker-adapter-v3'

export const READER_ROUND_VERSION = 'reader-round/1'
export const READER_PAGES = 6
export const READER_AUTHOR_REST = 2

type TasteBook = Pick<StoredComic, 'comicId' | 'authorId' | 'canonicalAuthor' | 'tags' | 'categories'>
export type Target = Pick<SessionIntentV5, 'key' | 'targetType'>
export interface ReaderIdentity {
    workByComic: Map<string,string>
    shown: Set<string>
    authorLastRound: Map<string,number>
}
export function readerWorkKey(id:string, identities:ReadonlyMap<string,string>) {
    return identities.get(id) ?? 'upload:' + id
}
export function readerTerms(comic:Pick<TasteBook,'tags'|'categories'>) {
    return [...new Set([...(comic.tags ?? []), ...(comic.categories ?? [])].map(normalizePreferenceKey).filter(Boolean))]
}
export function readerMatchesTarget(comic:StoredComic, target?:Target) {
    const key = normalizePreferenceKey(target?.key)
    if (!key) return false
    if (target?.targetType === 'AUTHOR') return normalizePreferenceKey(comic.canonicalAuthor ?? comic.author) === key
    const values = target?.targetType === 'CATEGORY' ? comic.categories :
        target?.targetType === 'TAG' || target?.targetType === 'FANDOM' ? comic.tags : []
    return (values ?? []).some(x => normalizePreferenceKey(x) === key)
}

export function readerTaste(books:TasteBook[], favoriteIds:ReadonlySet<string>, likedIds:ReadonlySet<string>, identities:ReadonlyMap<string,string>) {
    const familiar = new Set<string>(), likedByAuthor = new Map<string, Set<string>>()
    const termWorks = new Map<string,Set<string>>(), positiveWorks = new Set<string>()
    for (const book of books) {
        if (!favoriteIds.has(book.comicId) && !likedIds.has(book.comicId)) continue
        const work = readerWorkKey(book.comicId,identities)
        positiveWorks.add(work)
        const author = batchAuthorKey(book)
        if (author) {
            if (favoriteIds.has(book.comicId)) familiar.add(author)
            if (likedIds.has(book.comicId)) {
                const works = likedByAuthor.get(author) ?? new Set<string>()
                works.add(work); likedByAuthor.set(author,works)
                if (works.size >= 2) familiar.add(author)
            }
        }
        for (const term of readerTerms(book)) {
            const works = termWorks.get(term) ?? new Set<string>()
            works.add(work); termWorks.set(term,works)
        }
    }
    return { familiar, positiveWorks, support:new Map([...termWorks].map(([k,v])=>[k,v.size])) }
}

export interface ReaderSlot {
    comicId:string
    authorKey:string
    group:'familiar'|'unfamiliar'
    targetMatch:boolean
}
export interface ReaderRoundPlan {
    version:typeof READER_ROUND_VERSION
    ordinal:number
    focus:string|null
    pages:ReaderSlot[][]
}

/** Author mix is a constraint, not a score bonus. No last-pass author relaxation. */
export function planReaderRound(input:{
    ordinal:number; ranked:RankedCandidateWithEvidenceV3[]
    identity:ReaderIdentity; taste:ReturnType<typeof readerTaste>
    excludedIds:ReadonlySet<string>; subscribed:ReadonlySet<string>
    target?:Target; focus?:string|null
}):ReaderRoundPlan {
    const {identity,taste,ordinal} = input
    const usedWorks = new Set([...taste.positiveWorks,
        ...Array.from(input.excludedIds,id=>readerWorkKey(id,identity.workByComic)),
        ...Array.from(identity.shown,id=>readerWorkKey(id,identity.workByComic))])
    const authorUses = new Map<string,number>()
    const rows = input.ranked.flatMap((row, order) => {
        const author = batchAuthorKey(row.comic)
        if (!author || input.subscribed.has(author)) return []
        const work = readerWorkKey(row.comicId,identity.workByComic)
        if (usedWorks.has(work)) return []
        const familiar = taste.familiar.has(author)
        const last = identity.authorLastRound.get(author) ?? -Infinity
        if (!familiar && last >= ordinal - READER_AUTHOR_REST) return []
        const target = readerMatchesTarget(row.comic,input.target)
        const terms = readerTerms(row.comic)
        const support = terms.map(t=>taste.support.get(t) ?? 0).filter(Boolean).sort((a,b)=>b-a)
        const focus = !!input.focus && terms.includes(input.focus)
        // Do not make a tagless item from an unrelated stranger a discovery just to fill the page.
        const related = (row.evidence.relatedSeedIds ?? []).some(id=>taste.positiveWorks.has(readerWorkKey(id,identity.workByComic)))
        if (!familiar && !target && !support.length && !related) return []
        const fit = support.slice(0,3).reduce((s,n)=>s + Math.min(4,Math.ceil(Math.log2(n+1))),0)
        const likes = row.comic.totalLikes
        return [{id:row.comicId, author, work, familiar, last, target, focus, fit, order,
            provider:row.comic.providerId ?? (row.comicId.startsWith('eh:')?'eh':'pica'),
            popularity:typeof likes === 'number' && Number.isFinite(likes) ? Math.max(0,likes):null}]
    })
    type Row = typeof rows[number]
    const byAuthor = new Map<string,Row[]>()
    for (const row of rows) {
        const group = byAuthor.get(row.author) ?? []
        group.push(row); byAuthor.set(row.author,group)
    }
    const relevance=(a:Row,b:Row)=>Number(b.target)-Number(a.target)||Number(b.focus)-Number(a.focus)||b.fit-a.fit
    // Compare raw popularity only inside the same provider AND author. Merge each provider's
    // best representative via the frozen ranking, not incomparable cross-provider counts.
    function representative(group:Row[]) {
        const available=group.filter(r=>!usedWorks.has(r.work))
        if (available[0]?.familiar) return available.sort((a,b)=>relevance(a,b)||a.order-b.order)[0]
        const providers=new Map<string,Row[]>()
        for(const row of available) { const g=providers.get(row.provider)??[];g.push(row);providers.set(row.provider,g) }
        const choices=Array.from(providers.values(),g=>g.sort((a,b)=>relevance(a,b)||
            (b.popularity??-1)-(a.popularity??-1)||a.order-b.order)[0])
        return choices.sort((a,b)=>relevance(a,b)||a.order-b.order)[0]
    }
    const pages:ReaderSlot[][]=[]
    for(let page=0;page<READER_PAGES;page++){
        const usedAuthors=new Set<string>(), slots:ReaderSlot[]=[]
        const authors=(familiar:boolean)=>Array.from(byAuthor.entries()).flatMap(([key,group])=>{
            if(usedAuthors.has(key)||group[0].familiar!==familiar||(authorUses.get(key)??0)>=(familiar?2:1)) return []
            const rep=representative(group);return rep?[rep]:[]
        }).sort((a,b)=>relevance(a,b)||
            (familiar&&a.last!==b.last?(a.last<b.last?-1:1):0)||a.order-b.order)
        const take=(familiar:boolean,limit:number)=>{
            for(const candidate of authors(familiar)) {
                if(limit===0||slots.length>=FINAL_BATCH_SIZE) break
                const row=usedWorks.has(candidate.work)?representative(byAuthor.get(candidate.author)!):candidate
                if(!row)continue
                slots.push({comicId:row.id,authorKey:row.author,group:familiar?'familiar':'unfamiliar',targetMatch:row.target})
                usedAuthors.add(row.author);usedWorks.add(row.work);authorUses.set(row.author,(authorUses.get(row.author)??0)+1);limit--
            }
        }
        take(true,FINAL_BATCH_SIZE/2);take(false,FINAL_BATCH_SIZE/2)
        if(slots.length<FINAL_BATCH_SIZE){take(true,FINAL_BATCH_SIZE-slots.length);take(false,FINAL_BATCH_SIZE-slots.length)}
        if(!slots.length)break
        // Interleave the two reserved groups on screen as well as in the quota.
        const a=slots.filter(s=>s.group==='familiar'), b=slots.filter(s=>s.group==='unfamiliar')
        pages.push(Array.from({length:Math.max(a.length,b.length)},(_,i)=>[a[i],b[i]].filter((s):s is ReaderSlot=>!!s)).flat())
    }
    return {version:READER_ROUND_VERSION,ordinal,pages,focus:input.focus??null}
}
