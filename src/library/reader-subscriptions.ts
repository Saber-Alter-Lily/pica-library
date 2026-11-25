import type { LibraryDatabase } from './database'
import { authorIdForKey, parseAuthorIdentity } from './author'
import { SUBSCRIBED_AUTHORS_KEY } from '../recommendation-v3/reader-round-history'
import type { FavoriteRecord } from './types'

type Book=Pick<FavoriteRecord,'comicId'|'title'|'author'|'createdAt'|'epsCount'|'providerId'> & {knownEpisodes?:number;canonicalAuthor?:string|null}
type Follow={id:string;label:string;since:number;known:Record<string,number>;pending:Record<string,{title:string;chapters:number[]}>}
type State={authors:Follow[];cursor:number}
const KEY='reader.subscriptions.v1.inbox'
export function authorOf(b:Book){
    const a=parseAuthorIdentity(b.canonicalAuthor||b.author)
    return a.normalizedKey&&!a.multiCreator&&!a.genericLabel?{id:authorIdForKey(a.normalizedKey),label:a.display}:null
}
export function observe(f:Follow,b:Book){
    if(authorOf(b)?.id!==f.id || !b.comicId || ['__proto__','constructor','prototype'].includes(b.comicId))return
    const count=Math.min(10000,Math.max(0,Math.trunc(b.epsCount||0),Math.trunc(b.knownEpisodes||0)))
    const previous=Object.hasOwn(f.known,b.comicId)?f.known[b.comicId]:undefined
    // A title newly seen in a partial index is not necessarily a new publication.
    const fresh=previous===undefined&&Date.parse(b.createdAt||'')>f.since
    const start=previous===undefined?(fresh?1:Infinity):previous>0?previous+1:Infinity
    f.known[b.comicId]=Math.max(previous??0,count,fresh?1:0)
    if(start>f.known[b.comicId])return
    const item=f.pending[b.comicId]??{title:b.title,chapters:[]}
    for(let n=start;n<=f.known[b.comicId];n++)item.chapters.push(n)
    f.pending[b.comicId]=item
}
export class ReaderSubscriptions {
    private flight?:Promise<void>
    private last=0
    private partial=false
    constructor(private db:LibraryDatabase,private search:(name:string)=>Promise<Book[]>){}
    private state():State{return this.db.getAppState<State>(KEY)??{authors:[],cursor:0}}
    private save(s:State){this.db.setAppState(KEY,s)}
    private setAuthors(s:State){this.save(s);this.db.setAppState(SUBSCRIBED_AUTHORS_KEY,s.authors.map(a=>a.id))}
    view(){const s=this.state();return {authors:s.authors.map(({id,label})=>({id,label})),updates:s.authors.flatMap(f=>Object.entries(f.pending).map(([comicId,v])=>({comicId,authorId:f.id,author:f.label,...v}))),partial:this.partial}}
    follow(comicId:string){
        const b=this.db.getComicsByIds([comicId])[0],a=b&&authorOf(b)
        if(!a)throw new Error('这本作品没有可以确认的独立作者')
        const s=this.state();if(s.authors.some(f=>f.id===a.id))return
        const f:Follow={...a,since:Date.now(),known:{},pending:{}}
        for(const item of this.db.listComics({author:a.label,limit:5000}))observe(f,item)
        observe(f,b);s.authors.push(f);this.setAuthors(s);this.last=0
    }
    unfollow(id:string){const s=this.state();s.authors=s.authors.filter(a=>a.id!==id);this.setAuthors(s)}
    acknowledge(comicId:string,chapter:number){
        const s=this.state();let changed=false
        for(const f of s.authors){const b=Object.hasOwn(f.pending,comicId)?f.pending[comicId]:null
            if(!b||!b.chapters.includes(chapter))continue
            b.chapters=b.chapters.filter(n=>n!==chapter);if(!b.chapters.length)delete f.pending[comicId];changed=true}
        if(changed)this.save(s)
    }
    async refresh(force:boolean){
        if(this.flight)return this.flight
        if(!force&&Date.now()-this.last<15*60_000)return
        this.flight=this.scan().finally(()=>{this.flight=undefined});return this.flight
    }
    private async scan(){
        const initial=this.state(),n=initial.authors.length
        if(!n)return
        let partial=n>4
        for(let i=0;i<Math.min(4,n);i++){
            const a=initial.authors[(initial.cursor+i)%n]
            const local=this.db.listComics({author:a.label,limit:5000})
            let remote:Book[]=[];try{remote=await this.search(a.label);if(!remote.length)partial=true}catch{partial=true}
            const s=this.state(),live=s.authors.find(f=>f.id===a.id&&f.since===a.since);if(!live)continue
            for(const b of [...local,...remote])observe(live,b)
            this.save(s)
        }
        const s=this.state();s.cursor=(initial.cursor+Math.min(4,n))%Math.max(1,s.authors.length);this.save(s);this.last=Date.now();this.partial=partial
    }
}
