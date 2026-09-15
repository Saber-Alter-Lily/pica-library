import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EhProvider } from '../../src/providers/eh-provider'
import { LibraryDatabase } from '../../src/library/database'
import type { FavoriteRecord } from '../../src/library/types'

const dirs:string[]=[]
afterEach(()=>{vi.restoreAllMocks();for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true})})
const record=(comicId:string):FavoriteRecord=>({comicId,title:comicId,author:'Author',categories:[],tags:[],finished:false,providerId:comicId.startsWith('eh:')?'eh':'pica',providerRemoteId:comicId.startsWith('eh:')?comicId.slice(3):comicId,completionStatus:comicId.startsWith('eh:')?'UNKNOWN':'ONGOING'})
function db(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eh-account-'));dirs.push(dir);return new LibraryDatabase(path.join(dir,'library.db'))}

describe('E-H account core',()=>{
 it('attaches encrypted-session material only to authenticated E-H requests without exposing it in errors',async()=>{
   const seen:string[]=[]
   const fake=vi.fn(async (url:string|URL|Request,init?:RequestInit)=>{const headers=new Headers(init?.headers);seen.push(headers.get('cookie')||'');return new Response('<html>favorites.php /g/123/abcdef1234/</html>',{status:200,headers:{'content-type':'text/html'}})}) as unknown as typeof fetch
   const provider=new EhProvider({memberId:'12345',passHash:'deadbeef',igneous:'mystery'},fake)
   await provider.verifyAccount()
   expect(seen[0]).toContain('ipb_member_id=12345')
   expect(seen[0]).toContain('ipb_pass_hash=deadbeef')
   const publicSeen:string[]=[]
   const publicFetch=vi.fn(async (_url:string|URL|Request,init?:RequestInit)=>{publicSeen.push(new Headers(init?.headers).get('cookie')||'');return new Response('<html></html>',{status:200})}) as unknown as typeof fetch
   await new EhProvider({memberId:'12345',passHash:'deadbeef'},publicFetch).search({keyword:'none',limit:1})
   expect(publicSeen[0]).toBe('')
 })

 it('reports ExH capability as available, unavailable, or network error without an age heuristic',async()=>{
   const session={memberId:'1',passHash:'hash'}
   const available=new EhProvider(session,vi.fn(async()=>new Response('<html>uconfig</html>',{status:200})) as unknown as typeof fetch)
   expect(await available.probeExHentai()).toBe('AVAILABLE')
   const blocked=new EhProvider(session,vi.fn(async()=>new Response('forbidden',{status:403})) as unknown as typeof fetch)
   expect(await blocked.probeExHentai()).toBe('UNAVAILABLE')
   const network=new EhProvider(session,vi.fn(async()=>{throw new Error('network down')}) as unknown as typeof fetch)
   expect(await network.probeExHentai()).toBe('NETWORK_ERROR')
 })

 it('keeps local and E-H favorites when a complete Pica snapshot is replaced',()=>{
   const value=db();const pica=record('pica-1'),local=record('eh:11:abcdef1234'),remote=record('eh:12:abcdef1234')
   value.importCatalog([pica,local,remote],'fixture')
   value.setFavoriteState('pica-1',true);value.setLocalFavoriteState(local.comicId,true);value.setEhFavoriteState(remote.comicId,true)
   value.importFavorites([], 'pica:favorites:full', true, true)
   expect(value.getComic('pica-1')?.isFavorite).toBe(false)
   expect(value.getComic(local.comicId)?.isFavorite).toBe(true)
   expect(value.getComic(remote.comicId)?.isFavorite).toBe(true)
   value.syncEhFavorites([])
   expect(value.getComic(local.comicId)?.isFavorite).toBe(true)
   expect(value.getComic(remote.comicId)?.isFavorite).toBe(false)
   value.close()
 })
})
