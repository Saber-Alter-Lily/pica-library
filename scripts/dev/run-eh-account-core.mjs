import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const sourceFile='scripts/dev/apply-eh-account-core.mjs'
let source=fs.readFileSync(sourceFile,'utf8')
const start=source.indexOf('  const oldEh=`')
const endMarker="  text=replaceOnce(text,oldEh,newEh,'E-H favorite mutation')\n"
const end=source.indexOf(endMarker,start)
if(start<0||end<0)throw new Error('Could not isolate stale E-H favorite mutation patch')
source=source.slice(0,start)+source.slice(end+endMarker.length)
const generated='/tmp/pica-eh-account-core-patch.mjs'
fs.writeFileSync(generated,source)
await import(pathToFileURL(generated).href+`?v=${Date.now()}`)

const file='src/services/provider-service.ts'
let text=fs.readFileSync(file,'utf8')
const oldBlock=`        if (comicId.startsWith('eh:')) {
            const before = this.database.getComic(comicId)
            if (!before) throw new Error('E-H 漫画尚未加入本地目录')
            if (before.isFavorite === desired)
                return { changed: false, isFavorite: desired, already: true, remote: false }
            this.database.setLocalFavoriteState(comicId, desired)
            return { changed: true, isFavorite: desired, already: false, remote: false }
        }
`
const newBlock=`        if (comicId.startsWith('eh:')) {
            const before = this.database.getComic(comicId)
            if (!before) throw new Error('E-H 漫画尚未加入本地目录')
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
const index=text.indexOf(oldBlock)
if(index<0)throw new Error('Current E-H favorite mutation anchor not found')
if(text.indexOf(oldBlock,index+oldBlock.length)>=0)throw new Error('Current E-H favorite mutation anchor duplicated')
text=text.slice(0,index)+newBlock+text.slice(index+oldBlock.length)
fs.writeFileSync(file,text)
console.log('EH_ACCOUNT_CORE_SCOPED_PATCH=APPLIED')
