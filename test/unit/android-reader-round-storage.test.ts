import {mkdtempSync,readFileSync,rmdirSync,unlinkSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createRequire} from 'node:module'
import {describe,expect,it} from 'vitest'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

// Exercise the SQL actually shipped to SQLiteOpenHelper (not production data or a shadow schema).
const src = readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ReaderRoundLedger.java','utf8')
const stmts = [...src.matchAll(/(?:execSQL|rawQuery)\("([^"]+)"/g)].map(m=>m[1])
const statement=(prefix:string)=>{const sql=stmts.find(s=>s.startsWith(prefix));if(!sql)throw Error(prefix);return sql}
const create=(path=':memory:')=>{const db=new DatabaseSync(path);for(const sql of stmts.filter(s=>s.startsWith('CREATE TABLE')))db.exec(sql);return db}
describe('Android reader ledger SQL (synthetic SQLite)',()=>{
    it('retains an edition receipt and the next unread chapter across a real file close and reopen',()=>{
        const dir=mkdtempSync(join(tmpdir(),'pica-reader-synthetic-')), file=join(dir,'fixture.db')
        let db=create(file)
        try{
            db.prepare(statement('INSERT OR IGNORE INTO shown_work')).run('canonical-test')
            db.prepare(statement('INSERT OR IGNORE INTO inbox')).run('example','series',8,'placeholder',123)
            db.close();db=new DatabaseSync(file)
            expect(db.prepare(statement('SELECT work FROM shown_work')).get()?.work).toBe('canonical-test')
            expect(db.prepare(statement('SELECT author,upload,title,chapter')).get()?.chapter).toBe(8)
        }finally{db.close();unlinkSync(file);rmdirSync(dir)}
    })
    it('retains both upload and confirmed-work receipts, deduplicates repeats and never rewinds an author',()=>{
        const db=create()
        try{
            const write=(round:number)=>{db.prepare(statement('INSERT OR IGNORE INTO shown(')).run('upload-1');db.prepare(statement('INSERT OR IGNORE INTO shown_work')).run('work-1');
                db.prepare(statement('INSERT OR IGNORE INTO author_clock')).run('author',round);db.prepare(statement('UPDATE author_clock')).run(round,'author',round)}
            write(4);write(4);write(1)
            expect(db.prepare(statement('SELECT upload FROM shown')).all()).toEqual([{upload:'upload-1'}])
            expect(db.prepare(statement('SELECT work FROM shown_work')).all()).toEqual([{work:'work-1'}])
            expect(db.prepare(statement('SELECT author,round_no FROM author_clock')).all()).toEqual([{author:'author',round_no:4}])
        }finally{db.close()}
    })
    it('rechecking does not duplicate notifications; reading another chapter and merely listing do not dismiss them',()=>{
        const db=create()
        try{
            const ins=db.prepare(statement('INSERT OR IGNORE INTO inbox'));for(const n of [0,8,9,8])ins.run('author','serial',n,'test',100)
            const where=src.match(/\.delete\("inbox","(upload=\? AND \(chapter=0 OR chapter=\?\))"/)?.[1]
            expect(where).toBeDefined()
            const open=db.prepare('DELETE FROM inbox WHERE '+where), list=()=>db.prepare(statement('SELECT author,upload,title,chapter')).all().map(r=>r.chapter)
            expect(list()).toEqual([0,8,9]);expect(list()).toEqual([0,8,9])
            open.run('unrelated',8);expect(list()).toEqual([0,8,9])
            open.run('serial',7);expect(list()).toEqual([8,9]);open.run('serial',8);expect(list()).toEqual([9])
        }finally{db.close()}
    })
})
