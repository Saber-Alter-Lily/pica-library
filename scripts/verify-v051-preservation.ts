import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { LibraryDatabase } from '../src/library/database'
const [mode,file]=process.argv.slice(2)
const rel=path.relative(fs.realpathSync(os.tmpdir()),fs.realpathSync(file)).replaceAll('\\','/')
assert.ok(process.env.GITHUB_ACTIONS==='true'&&/^pica-v050-incremental-[0-9a-f-]{36}\/localappdata\/Pica Library Incremental Acceptance\/data\/library\.db$/i.test(rel),'isolated CI database only')
assert.ok(mode==='seed'||mode==='verify')
const id='qa-release-051', ep=id+'-episode', db=new LibraryDatabase(file)
try {
    if(mode==='seed'){
        assert.equal(db.getComicsByIds([id]).length,0)
        db.importCatalog([{comicId:id,title:'QA synthetic book',author:'QA Paper',finished:true,categories:[],tags:[]}],'qa-051')
        db.setLocalFavoriteState(id,true)
        db.upsertEpisode({comicId:id,id:ep,title:'Sample',order:1})
        db.saveReadingProgress(id,ep,7)
        db.recordUserEvent({eventType:'recommend_like',comicId:id,source:'qa-051'})
    }
    assert.ok(db.favoriteIds().includes(id))
    assert.equal(db.readingProgress(id)[0]?.pageIndex,7)
    assert.equal(db.listUserEvents({comicId:id,eventType:'recommend_like'}).length,1)
}finally{db.close()}
