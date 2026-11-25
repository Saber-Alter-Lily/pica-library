import type { LibraryDatabase } from '../library/database'
import { normalizePreferenceKey, type PortablePolicyStateV5, type SessionIntentV5 } from '../recommendation-v5/portable-policy'
import { batchAuthorKey } from './batch-freshness-v3'
import { planReaderRound, readerTaste, readerTerms, readerWorkKey } from './reader-round'
import { readerWorkGroups, SUBSCRIBED_AUTHORS_KEY } from './reader-round-history'
import type { RankedCandidateWithEvidenceV3 } from './ranker-adapter-v3'

export interface FocusHistory { key:string; lane:'lifetime'|'recent' }
export function readerTargetToken(i:SessionIntentV5) {
    return i.mode==='TARGET'&&i.key?JSON.stringify([i.updatedAt,i.targetType,normalizePreferenceKey(i.key)]):null
}
export function policyForReaderRound(state:PortablePolicyStateV5, consumed?:string|null):PortablePolicyStateV5 {
    if(!consumed||readerTargetToken(state.sessionIntent)!==consumed)return state
    return {...state,sessionIntent:{mode:'DEFAULT',source:state.sessionIntent.source,updatedAt:state.sessionIntent.updatedAt}}
}

export function chooseReaderFocus(support:Map<string,number>, recent:Map<string,number>, history:FocusHistory[]):FocusHistory|null{
    if(!support.size)return null
    const recentOnly=[...recent].filter(([key,n])=>n>0&&support.has(key)&&
        n/(support.get(key)??1)>=0.5)
    const strongestRecent=Math.max(0,...recentOnly.map(([,n])=>n))
    const window=strongestRecent<2?7:3
    const useRecent=recentOnly.length>0&&history.length>=window&&!history.slice(-window).some(f=>f.lane==='recent')
    const options=useRecent?recentOnly:[...support]
    // Weighted rotation: repeated support buys frequency, not a permanent first slot.
    const weight=(key:string,n:number)=>Math.sqrt(n)/(1+history.slice(-12).filter(f=>f.key===key).length)
    options.sort(([a,na],[b,nb])=>weight(b,nb)-weight(a,na)||a.localeCompare(b))
    return {key:options[0][0],lane:useRecent?'recent':'lifetime'}
}

export function freezeReaderRound(db:LibraryDatabase, ranked:RankedCandidateWithEvidenceV3[], ordinal:number,
    policy:PortablePolicyStateV5, history:FocusHistory[]) {
    db.prepareReaderReceiptHistory()
    const workByComic=readerWorkGroups(db.listAllWorkIdentityBindings(),db.listAllWorkIdentityDecisions(),policy.explicitDistinctPairs)
    const actualFavorites=new Set(db.favoriteIds()),feedback=db.recommendationFeedback()
    const liked=new Set(feedback.filter(v=>v.sentiment==='like').map(v=>v.comicId))
    const noTaste=new Set([...policy.tasteExcludedComicIds,...feedback.filter(v=>v.sentiment==='dislike').map(v=>v.comicId)])
    const books=db.getComicsByIds([...new Set([...actualFavorites,...liked])])
    const taste=readerTaste(books.filter(b=>!noTaste.has(b.comicId)),actualFavorites,liked,workByComic)
    for(const b of books)if(actualFavorites.has(b.comicId)){const a=batchAuthorKey(b);if(a)taste.familiar.add(a)}
    const recentIds=db.readerRecentPositiveIds(new Date(Date.now()-30*86400000).toISOString())
    const recentByTerm=new Map<string,Set<string>>()
    for(const b of books)if(recentIds.has(b.comicId)&&!noTaste.has(b.comicId)){
        for(const t of readerTerms(b)){
            const works=recentByTerm.get(t)??new Set(); works.add(readerWorkKey(b.comicId,workByComic));recentByTerm.set(t,works)
        }
    }
    const blockedTerms=new Set(policy.controls.filter(c=>c.direction==='BLOCK').map(c=>normalizePreferenceKey(c.key)))
    for(const term of blockedTerms)taste.support.delete(term)
    const target=policy.sessionIntent.mode==='TARGET'?policy.sessionIntent:undefined
    const focus=target?null:chooseReaderFocus(taste.support,new Map([...recentByTerm].map(([k,v])=>[k,v.size])),history)
    const authors=ranked.flatMap(r=>{const a=batchAuthorKey(r.comic);return a?[a]:[]})
    const receipt=db.readerReceiptHistory([...ranked.map(r=>r.comicId),...workByComic.keys()],authors)
    const excluded=new Set([...actualFavorites,...feedback.map(v=>v.comicId),...policy.hardSuppressComicIds,...policy.ownedComicIds,
        ...policy.seenComicIds,...policy.duplicateReportComicIds,...db.recommendationOwnershipState().ownedComicIds])
    const plan=planReaderRound({ordinal,ranked,identity:{...receipt,workByComic},taste,
        excludedIds:excluded,subscribed:new Set(db.getAppState<string[]>(SUBSCRIBED_AUTHORS_KEY)??[]),target,focus:focus?.key})
    return {plan,focus}
}
