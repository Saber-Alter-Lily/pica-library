import fs from 'node:fs'

function read(file){return fs.readFileSync(file,'utf8')}
function write(file,text){fs.writeFileSync(file,text)}
function replaceOnce(text,search,replacement,label){const i=text.indexOf(search);if(i<0)throw new Error(`missing ${label}`);if(text.indexOf(search,i+search.length)>=0)throw new Error(`duplicate ${label}`);return text.slice(0,i)+replacement+text.slice(i+search.length)}

// Favorite state is an aggregate over source-specific membership reasons.
{
  const file='src/library/database.ts';let text=read(file)
  text=replaceOnce(text,
`            if (completeSnapshot && markFavorite) {
                this.db.exec('UPDATE comics SET is_favorite = 0')
                this.db.exec(
                    "DELETE FROM library_membership WHERE reason = 'pica-favorite'"
                )
            }
`,
`            if (completeSnapshot && markFavorite) {
                this.db.exec(
                    "DELETE FROM library_membership WHERE reason = 'pica-favorite'"
                )
                this.recomputeFavoriteState()
            }
`, 'Pica complete favorite reset')
  const start=text.indexOf('    setFavoriteState(comicId: string, isFavorite: boolean) {')
  const end=text.indexOf('    favoriteIds() {',start)
  if(start<0||end<0)throw new Error('favorite state method block not found')
  const methods=`    private recomputeFavoriteState(comicId?: string) {
        const favoriteReasons = "'pica-favorite','eh-favorite','local-favorite'"
        if (comicId)
            this.db
                .prepare(
                    \`UPDATE comics SET is_favorite = CASE WHEN EXISTS(
                        SELECT 1 FROM library_membership lm
                        WHERE lm.comic_id = comics.id
                          AND lm.reason IN (\${favoriteReasons})
                    ) THEN 1 ELSE 0 END,
                    last_seen_at = ? WHERE id = ?\`
                )
                .run(new Date().toISOString(), comicId)
        else
            this.db.exec(
                \`UPDATE comics SET is_favorite = CASE WHEN EXISTS(
                    SELECT 1 FROM library_membership lm
                    WHERE lm.comic_id = comics.id
                      AND lm.reason IN (\${favoriteReasons})
                ) THEN 1 ELSE 0 END\`
            )
    }

    private setFavoriteMembershipState(
        comicId: string,
        reason: 'pica-favorite' | 'eh-favorite' | 'local-favorite',
        isFavorite: boolean
    ) {
        const exists = this.db
            .prepare('SELECT 1 AS found FROM comics WHERE id = ?')
            .get(comicId) as SqlRow | undefined
        if (!exists) throw new Error(\`Comic not found: \${comicId}\`)
        const now = new Date().toISOString()
        if (isFavorite)
            this.db
                .prepare(
                    \`INSERT INTO library_membership(comic_id, reason, created_at, updated_at)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(comic_id, reason) DO UPDATE SET updated_at = excluded.updated_at\`
                )
                .run(comicId, reason, now, now)
        else
            this.db
                .prepare(
                    'DELETE FROM library_membership WHERE comic_id = ? AND reason = ?'
                )
                .run(comicId, reason)
        this.recomputeFavoriteState(comicId)
        return this.getComic(comicId)
    }

    hasFavoriteMembership(
        comicId: string,
        reason: 'pica-favorite' | 'eh-favorite' | 'local-favorite'
    ) {
        return Boolean(
            this.db
                .prepare(
                    'SELECT 1 AS found FROM library_membership WHERE comic_id = ? AND reason = ?'
                )
                .get(comicId, reason) as SqlRow | undefined
        )
    }

    setFavoriteState(comicId: string, isFavorite: boolean) {
        return this.setFavoriteMembershipState(
            comicId,
            'pica-favorite',
            isFavorite
        )
    }

    setLocalFavoriteState(comicId: string, isFavorite: boolean) {
        return this.setFavoriteMembershipState(
            comicId,
            'local-favorite',
            isFavorite
        )
    }

    setEhFavoriteState(comicId: string, isFavorite: boolean) {
        return this.setFavoriteMembershipState(
            comicId,
            'eh-favorite',
            isFavorite
        )
    }

    syncEhFavorites(records: FavoriteRecord[]) {
        const imported = this.importCatalog(records, 'eh:favorites')
        const now = new Date().toISOString()
        const uniqueIds = [
            ...new Set(
                records
                    .map((record) => record.comicId?.trim())
                    .filter((value): value is string => Boolean(value))
            )
        ]
        this.db.exec('BEGIN IMMEDIATE')
        try {
            this.db.exec(
                "DELETE FROM library_membership WHERE reason = 'eh-favorite'"
            )
            const insert = this.db.prepare(
                \`INSERT INTO library_membership(comic_id, reason, created_at, updated_at)
                 VALUES (?, 'eh-favorite', ?, ?)\`
            )
            for (const comicId of uniqueIds) insert.run(comicId, now, now)
            this.recomputeFavoriteState()
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            throw error
        }
        return { ...imported, remoteFavoriteCount: uniqueIds.length }
    }

`
  text=text.slice(0,start)+methods+text.slice(end)
  write(file,text)
}

// ProviderService exposes the optional account session without changing public E-H behavior.
{
  const file='src/services/provider-service.ts';let text=read(file)
  text=replaceOnce(text,
`import { EhProvider } from '../providers/eh-provider'
`,
`import {
    EhProvider,
    type EhSession,
    type ExHentaiCapability
} from '../providers/eh-provider'
`, 'EhProvider imports')
  const marker=`    providerStatus() {
        return this.capabilities.providers
    }

`
  const addition=`    providerStatus() {
        return this.capabilities.providers
    }

    setEhSession(session?: EhSession | null) {
        this.ehProvider.setSession(session)
    }

    ehAccountStatus() {
        return { configured: this.ehProvider.hasSession() }
    }

    verifyEhAccount() {
        return this.ehProvider.verifyAccount()
    }

    probeExHentai(): Promise<ExHentaiCapability> {
        return this.ehProvider.probeExHentai()
    }

    async syncEhFavorites() {
        const comics = await this.ehProvider.favoritesAll()
        const records = comics.map(providerComicToRecord)
        return this.database.syncEhFavorites(records)
    }

`
  text=replaceOnce(text,marker,addition,'provider account methods')
  const oldEh=`        if (comicId.startsWith('eh:')) {
            const before = this.database.getComic(comicId)
            if (!before) throw new Error('E-H 漫画尚未进入本地目录')
            if (before.isFavorite === desired)
                return {
                    changed: false,
                    isFavorite: desired,
                    already: true,
                    remote: false
                }
            this.database.setLocalFavoriteState(comicId, desired)
            return {
                changed: true,
                isFavorite: desired,
                already: false,
                remote: false
            }
        }
`
  const newEh=`        if (comicId.startsWith('eh:')) {
            const before = this.database.getComic(comicId)
            if (!before) throw new Error('E-H 漫画尚未进入本地目录')
            if (this.ehProvider.hasSession()) {
                const beforeRemote = this.database.hasFavoriteMembership(
                    comicId,
                    'eh-favorite'
                )
                if (beforeRemote === desired)
                    return {
                        changed: false,
                        isFavorite: before.isFavorite,
                        already: true,
                        remote: true
                    }
                await this.ehProvider.setRemoteFavorite(comicId, desired)
                const after = this.database.setEhFavoriteState(comicId, desired)
                return {
                    changed: true,
                    isFavorite: Boolean(after?.isFavorite),
                    already: false,
                    remote: true
                }
            }
            const beforeLocal = this.database.hasFavoriteMembership(
                comicId,
                'local-favorite'
            )
            if (beforeLocal === desired)
                return {
                    changed: false,
                    isFavorite: before.isFavorite,
                    already: true,
                    remote: false
                }
            const after = this.database.setLocalFavoriteState(comicId, desired)
            return {
                changed: true,
                isFavorite: Boolean(after?.isFavorite),
                already: false,
                remote: false
            }
        }
`
  text=replaceOnce(text,oldEh,newEh,'E-H favorite mutation')
  write(file,text)
}

// LibraryService owns one EhProvider instance so credentials survive every facade creation.
{
  const file='src/library/service.ts';let text=read(file)
  text=replaceOnce(text,
`import { Pica } from '../sdk'
`,
`import { Pica } from '../sdk'
import { EhProvider, type EhSession } from '../providers/eh-provider'
`, 'LibraryService EhProvider import')
  text=replaceOnce(text,
`    private pica: Pica | null = null
`,
`    private pica: Pica | null = null
    private readonly ehProvider: EhProvider
`, 'LibraryService EhProvider field')
  text=replaceOnce(text,
`        readonly dataDir: string,
        provider?: Pica
    ) {
        this.pica = provider ?? null
`,
`        readonly dataDir: string,
        provider?: Pica,
        ehProvider?: EhProvider
    ) {
        this.pica = provider ?? null
        this.ehProvider = ehProvider ?? new EhProvider()
`, 'LibraryService constructor')
  const connectEnd=`        this.pica = pica
        return pica
    }

`
  const methods=`        this.pica = pica
        return pica
    }

    providerService() {
        return new ProviderService(
            () => this.connect(),
            this.database,
            this.ehProvider
        )
    }

    setEhSession(session?: EhSession | null) {
        this.ehProvider.setSession(session)
    }

    ehAccountStatus() {
        return this.providerService().ehAccountStatus()
    }

    verifyEhAccount() {
        return this.providerService().verifyEhAccount()
    }

    probeExHentai() {
        return this.providerService().probeExHentai()
    }

    syncEhFavorites() {
        return this.providerService().syncEhFavorites()
    }

`
  text=replaceOnce(text,connectEnd,methods,'LibraryService provider facade')
  text=text.replaceAll(`new ProviderService(
                () => this.connect(),
                this.database
            )`,`this.providerService()`)
  text=text.replaceAll(`new ProviderService(
            () => this.connect(),
            this.database
        )`,`this.providerService()`)
  write(file,text)
}

// Server must reuse the same provider instance rather than creating an unauthenticated facade.
{
  const file='src/library/server.ts';let text=read(file)
  text=replaceOnce(text,
`    const providerService = new ProviderService(
        () => options.service.connect(),
        options.database
    )
`,
`    const providerService = options.service.providerService()
`, 'server provider facade')
  write(file,text)
}

// Core tests cover session privacy and favorite-source aggregation.
{
 const file='test/unit/eh-account-core.test.ts'
 write(file,`import fs from 'node:fs'\nimport os from 'node:os'\nimport path from 'node:path'\nimport { afterEach, describe, expect, it, vi } from 'vitest'\nimport { EhProvider } from '../../src/providers/eh-provider'\nimport { LibraryDatabase } from '../../src/library/database'\nimport type { FavoriteRecord } from '../../src/library/types'\n\nconst dirs:string[]=[]\nafterEach(()=>{vi.restoreAllMocks();for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true})})\nconst record=(comicId:string):FavoriteRecord=>({comicId,title:comicId,author:'Author',categories:[],tags:[],finished:false,providerId:comicId.startsWith('eh:')?'eh':'pica',providerRemoteId:comicId.startsWith('eh:')?comicId.slice(3):comicId,completionStatus:comicId.startsWith('eh:')?'UNKNOWN':'ONGOING'})\nfunction db(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eh-account-'));dirs.push(dir);return new LibraryDatabase(path.join(dir,'library.db'))}\n\ndescribe('E-H account core',()=>{\n it('attaches encrypted-session material only to authenticated E-H requests without exposing it in errors',async()=>{\n   const seen:string[]=[]\n   const fake=vi.fn(async (url:string|URL|Request,init?:RequestInit)=>{const headers=new Headers(init?.headers);seen.push(headers.get('cookie')||'');return new Response('<html>favorites.php /g/123/abcdef1234/</html>',{status:200,headers:{'content-type':'text/html'}})}) as unknown as typeof fetch\n   const provider=new EhProvider({memberId:'12345',passHash:'deadbeef',igneous:'mystery'},fake)\n   await provider.verifyAccount()\n   expect(seen[0]).toContain('ipb_member_id=12345')\n   expect(seen[0]).toContain('ipb_pass_hash=deadbeef')\n   const publicSeen:string[]=[]\n   const publicFetch=vi.fn(async (_url:string|URL|Request,init?:RequestInit)=>{publicSeen.push(new Headers(init?.headers).get('cookie')||'');return new Response('<html></html>',{status:200})}) as unknown as typeof fetch\n   await new EhProvider({memberId:'12345',passHash:'deadbeef'},publicFetch).search({keyword:'none',limit:1})\n   expect(publicSeen[0]).toBe('')\n })\n\n it('reports ExH capability as available, unavailable, or network error without an age heuristic',async()=>{\n   const session={memberId:'1',passHash:'hash'}\n   const available=new EhProvider(session,vi.fn(async()=>new Response('<html>uconfig</html>',{status:200})) as unknown as typeof fetch)\n   expect(await available.probeExHentai()).toBe('AVAILABLE')\n   const blocked=new EhProvider(session,vi.fn(async()=>new Response('forbidden',{status:403})) as unknown as typeof fetch)\n   expect(await blocked.probeExHentai()).toBe('UNAVAILABLE')\n   const network=new EhProvider(session,vi.fn(async()=>{throw new Error('network down')}) as unknown as typeof fetch)\n   expect(await network.probeExHentai()).toBe('NETWORK_ERROR')\n })\n\n it('keeps local and E-H favorites when a complete Pica snapshot is replaced',()=>{\n   const value=db();const pica=record('pica-1'),local=record('eh:11:abcdef1234'),remote=record('eh:12:abcdef1234')\n   value.importCatalog([pica,local,remote],'fixture')\n   value.setFavoriteState('pica-1',true);value.setLocalFavoriteState(local.comicId,true);value.setEhFavoriteState(remote.comicId,true)\n   value.importFavorites([], 'pica:favorites:full', true, true)\n   expect(value.getComic('pica-1')?.isFavorite).toBe(false)\n   expect(value.getComic(local.comicId)?.isFavorite).toBe(true)\n   expect(value.getComic(remote.comicId)?.isFavorite).toBe(true)\n   value.syncEhFavorites([])\n   expect(value.getComic(local.comicId)?.isFavorite).toBe(true)\n   expect(value.getComic(remote.comicId)?.isFavorite).toBe(false)\n   value.close()\n })\n})\n`)
}
console.log('EH_ACCOUNT_CORE_PATCH=APPLIED')
