import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'

import { LibraryDatabase } from '../src/library/database'
const [mode,file]=process.argv.slice(2)
assert.equal(process.env.GITHUB_ACTIONS?.toLowerCase(),'true','Hosted Actions required')
assert.ok(process.env.RUNNER_TEMP && file,'Expected explicit runner temp and database path')
const rel=path.relative(fs.realpathSync.native(process.env.RUNNER_TEMP),fs.realpathSync.native(file)).split(path.sep).join('/')
const legacy=/^pica-v050-incremental-[0-9a-f]{32}\/localappdata\/Pica Library Incremental Acceptance\/data\/library\.db$/i
const button=/^pica-button-051-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/User\/AppData\/Local\/Pica Library\/data\/library\.db$/i
assert.ok(legacy.test(rel)||button.test(rel),'Refusing non-fixture path in Actions: '+JSON.stringify(rel))
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
