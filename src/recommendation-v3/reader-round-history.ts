import type { DatabaseSync } from 'node:sqlite'
import type { LibraryDatabase } from '../library/database'
import { batchAuthorKey, PRESENTATION_STATE_KEY, type PresentedBatchV3 } from './batch-freshness-v3'

const shownPrefix = 'reader.round.v1.shown:'
const authorPrefix = 'reader.round.v1.lastAuthor:'
const importedKey = 'reader.round.v1.importedReceipts'
export const SUBSCRIBED_AUTHORS_KEY = 'reader.subscriptions.v1.authors'

// Keep the upload as the raw fact. Resolve identity at read time, so correcting
// a mistaken work binding never permanently blacklists an unrelated edition.
export function readerWorkGroups(bindings:ReturnType<LibraryDatabase['listAllWorkIdentityBindings']>,
    decisions:ReturnType<LibraryDatabase['listAllWorkIdentityDecisions']>,distinctPairs:readonly string[] = []) {
    const parent=new Map<string,string>(), groups=new Map<string,string[]>()
    const find=(id:string):string=>{
        let root=id
        while(parent.has(root)&&parent.get(root)!==root)root=parent.get(root)!
        let p=id
        while(p!==root){const next=parent.get(p)!;parent.set(p,root);p=next}
        return root
    }
    const union=(a:string,b:string)=>{
        const x=find(a),y=find(b)
        if(x!==y)parent.set(x<y?y:x,x<y?x:y)
        if(!parent.has(a))parent.set(a,find(a))
        if(!parent.has(b))parent.set(b,find(b))
    }
    for(const b of bindings){
        if(b.bindingStatus!=='MANUAL_CONFIRMED')continue
        const ids=groups.get(b.workId)??[];ids.push(b.comicId);groups.set(b.workId,ids)
    }
    for(const ids of groups.values())for(const id of ids.slice(1))union(ids[0],id)
    for(const d of decisions)if(d.decision==='SAME_WORK'||d.decision==='EDITION_VARIANT')union(d.leftComicId,d.rightComicId)
    // On contradictory evidence prefer a false negative, never a false merge.
    const ambiguous=new Set<string>()
    const reject=(a:string,b:string)=>{if(find(a)===find(b))ambiguous.add(find(a))}
    for(const d of decisions)if(d.decision==='KEEP_SEPARATE')reject(d.leftComicId,d.rightComicId)
    for(const pair of distinctPairs){ const [a,b]=pair.split('\u0000');if(a&&b)reject(a,b) }
    return new Map([...parent.keys()].filter(id=>!ambiguous.has(find(id))).map(id=>[id,'work:'+find(id)]))
}

type Sql = Pick<DatabaseSync,'prepare'|'exec'>
export function receiptHistory(sql:Sql, ids:Iterable<string>, authors:Iterable<string>) {
    const shown=new Set<string>(), authorLastRound=new Map<string,number>()
    const keys=[...new Set([...Array.from(ids,id=>shownPrefix+id),...Array.from(authors,a=>authorPrefix+a)])]
    if(keys.length){
        const rows=sql.prepare('SELECT key,value_json FROM app_state WHERE key IN (SELECT value FROM json_each(?))').all(JSON.stringify(keys))
        for(const row of rows){
            const k=String(row.key)
            if(k.startsWith(shownPrefix))shown.add(k.slice(shownPrefix.length))
            else authorLastRound.set(k.slice(authorPrefix.length),Number(row.value_json))
        }
    }
    return {shown, authorLastRound}
}

/** Caller owns the receipt transaction. Replays cannot rewind the author clock. */
export function logReaderReceipt(sql:Sql,ids:readonly string[],ordinal:number,authorKeys:Iterable<string>){
    const at=new Date().toISOString()
    const put=sql.prepare('INSERT OR IGNORE INTO app_state(key,value_json,updated_at) VALUES(?,?,?)')
    for(const id of ids)put.run(shownPrefix+id,'true',at)
    if(!Number.isSafeInteger(ordinal)||ordinal<1)return
    const update=sql.prepare(`INSERT INTO app_state(key,value_json,updated_at) VALUES(?,?,?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at
      WHERE CAST(app_state.value_json AS INTEGER)<CAST(excluded.value_json AS INTEGER)`)
    for(const key of new Set(authorKeys))update.run(authorPrefix+key,String(ordinal),at)
}

/** An old allocation alone is never evidence. Only recover the acknowledged
 * subset from the prior receipt ring or a real event matched to its saved page. */
export function importPriorReaderReceipts(sql:Sql){
    if(sql.prepare('SELECT 1 FROM app_state WHERE key=?').get(importedKey))return
    sql.exec('BEGIN IMMEDIATE')
    try{
        const ring=sql.prepare('SELECT value_json FROM app_state WHERE key=?').get(PRESENTATION_STATE_KEY)
        const old=ring?JSON.parse(String(ring.value_json)) as PresentedBatchV3[]:[]
        if(Array.isArray(old))for(const receipt of old)if(Array.isArray(receipt.itemIds))logReaderReceipt(sql,receipt.itemIds,0,[])
        const events=sql.prepare(`SELECT DISTINCT listed.value AS id
            FROM user_events e JOIN recommendation_v3_batches b ON b.id=json_extract(e.metadata_json,'$.batchId')
                AND b.recommendation_cycle_id=e.recommendation_cycle_id AND b.batch_index=e.recommendation_batch_index AND b.context_id=e.context_id
            JOIN json_each(e.metadata_json,'$.itemIds') listed JOIN json_each(b.item_ids_json) allocated ON allocated.value=listed.value
            WHERE e.event_type='recommend_batch_presented' AND e.source='final-v3-visible'
              AND json_extract(b.evidence_json,'$.presentationConfirmedV1')=1 AND listed.type='text'`).all()
        logReaderReceipt(sql,events.map(row=>String(row.id)),0,[])
        sql.prepare('INSERT OR IGNORE INTO app_state(key,value_json,updated_at) VALUES(?,?,?)').run(importedKey,'true',new Date().toISOString())
        sql.exec('COMMIT')
    }catch(e){sql.exec('ROLLBACK');throw e}
}

export function authorKeysForReceipt(sql:Sql,ids:readonly string[]){
    const rows=sql.prepare(`SELECT c.canonical_author_id AS id,a.canonical_name AS name
        FROM comics c JOIN authors a ON a.id=c.canonical_author_id WHERE c.id IN (SELECT value FROM json_each(?))`).all(JSON.stringify(ids))
    return rows.flatMap(row=>{const key=batchAuthorKey({authorId:String(row.id),canonicalAuthor:String(row.name)});return key?[key]:[]})
}
