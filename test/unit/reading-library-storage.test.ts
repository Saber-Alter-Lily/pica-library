import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { actualDesktopCallback, VirtualReply } from '../helpers/virtual-desktop-route'
import { ReadingLibrary, ReadingLibraryInputError } from '../../src/library/reading-library'
import { catalogueReadingPort } from '../../src/services/reading-library-adapters'

// Actual storage method SQL, but only an in-memory synthetic table. No app constructor/profile/file.
const cleanup: Array<() => void> = []
// Reuse the application's existing built-in loader; Vite5 predates node:sqlite.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
afterEach(() => { for (const close of cleanup.splice(0)) close() })
function fixture() {
    const memory = new DatabaseSync(':memory:'); cleanup.push(() => memory.close())
    memory.exec('CREATE TABLE reading_progress(comic_id TEXT NOT NULL,episode_id TEXT NOT NULL,page_index INTEGER NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(comic_id,episode_id))')
    const insert = memory.prepare('INSERT INTO reading_progress VALUES(?,?,?,?)')
    for (let index = 0; index < 120; index++) insert.run('local:latest', 'chapter-'+index, index % 5, new Date(Date.UTC(2026, 9, 25, 0, index)).toISOString())
    insert.run('local:previous', 'chapter-previous', 2, '2026-10-24T00:00:00.000Z')
    insert.run('local:third', 'chapter-third', 1, '2026-10-23T00:00:00.000Z')
    const ast = ts.createSourceFile('database.ts', fs.readFileSync('src/library/database.ts', 'utf8'), ts.ScriptTarget.Latest, true)
    const cls = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'LibraryDatabase') as ts.ClassDeclaration
    const methods = cls.members.filter(node => ts.isMethodDeclaration(node) && ['readingProgress', 'recentReadingProgress'].includes(node.name.getText(ast)))
    const code = ts.transpileModule('const actual = {'+methods.map(node => node.getText(ast)).join(',\n')+'}; actual;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
    const storage = Object.assign(vm.runInNewContext(code, {numberValue:Number}), {db:memory})
    const getComicsByIds = vi.fn((ids: string[]) => ids.map(comicId => ({ comicId, title: comicId, providerId: 'local', downloadedPictures: 5 })))
    const options = {database: {...storage, getComicsByIds},service:{runtimeActiveTaskTypes:()=>[],sources:{isEnabled:()=>false}},desktop:{csrfToken:'fixture-csrf',configured:()=>true,status:()=>({startupReady:true})}}
    const handler = actualDesktopCallback({options,host:'127.0.0.1',port:4789,httpLatency:{start:()=>()=>{}},onlineReader:{recentProgress:()=>[]},ReadingLibrary,ReadingLibraryInputError,catalogueReadingPort})
    async function query() {
        const iterate = async function* () { yield Buffer.from('{"query":{}}') }
        const response = new VirtualReply()
        await handler({url:'/api/v1/desktop/reading-library/query',method:'POST',headers:{host:'127.0.0.1:4789',origin:'http://127.0.0.1:4789','x-pica-csrf':'fixture-csrf','content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'},[Symbol.asyncIterator]:iterate,iterator:()=>iterate()},response)
        expect(response.statusCode).toBe(200)
        return response.json()
    }
    return {memory,storage,getComicsByIds,query}
}
it('does not let many chapters of one work erase other books from the bounded recent-reading view', async () => {
    const f = fixture(), changesBefore = f.memory.prepare('SELECT total_changes() AS count').get(), result = await f.query()
    expect(result.items.map((row: {comicId:string}) => row.comicId)).toEqual(['local:latest','local:previous','local:third'])
    expect(result.items[0].routes[0].progress.episodeId).toBe('chapter-119')
    expect(f.getComicsByIds.mock.calls[0][0]).toEqual(['local:latest','local:previous','local:third'])
    expect(f.memory.prepare('SELECT total_changes() AS count').get()).toEqual(changesBefore)
})
it('preserves the existing per-chapter readingProgress API and all original synthetic state', () => {
    const f = fixture()
    expect(f.storage.readingProgress()).toHaveLength(122)
    expect(f.storage.readingProgress('local:latest')).toHaveLength(120)
    expect(f.storage.readingProgress('local:previous')).toMatchObject([{comicId:'local:previous',episodeId:'chapter-previous',pageIndex:2}])
})
it('enforces a bound work count and deterministic chapter tie without writing synthetic state', () => {
    const f = fixture()
    f.memory.prepare('INSERT INTO reading_progress VALUES(?,?,?,?)').run('local:previous','chapter-a',4,'2026-10-24T00:00:00.000Z')
    const before = f.memory.prepare('SELECT total_changes() AS count').get()
    expect(f.storage.recentReadingProgress(2)).toMatchObject([{comicId:'local:latest',episodeId:'chapter-119'},{comicId:'local:previous',episodeId:'chapter-a'}])
    for (const value of [0,-1,5001,1.5,NaN,Infinity]) expect(() => f.storage.recentReadingProgress(value)).toThrow('Invalid reading progress limit')
    expect(f.memory.prepare('SELECT total_changes() AS count').get()).toEqual(before)
    expect(f.storage.readingProgress()).toHaveLength(123)
})
