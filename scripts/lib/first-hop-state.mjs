// Shared selected-state canaries, never a real library. The caller cannot choose an arbitrary root.
export function syntheticUpgradeStateProgram(kind) {
if (!['old-first-hop', 'runtime-choice', 'legacy-transition'].includes(kind)) throw Error('Unknown synthetic upgrade state scope')
return String.raw`
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto');
const [action,root]=process.argv.slice(1),real=fs.realpathSync.native(root);
if(!/^pica-${kind}-[a-f0-9]{32}[a-zA-Z0-9]{6}$/.test(path.basename(real))||fs.realpathSync.native(path.dirname(real))!==fs.realpathSync.native(require('node:os').tmpdir())||fs.lstatSync(root).isSymbolicLink())throw Error('Only an owned synthetic upgrade root is permitted');
const home=path.join(root,'localappdata','Pica Library'),data=path.join(home,'data'),file=path.join(data,'library.db'),config=path.join(home,'config','config.json'),stamp='2026-10-25T00:00:00.000Z';
const db=new DatabaseSync(file);db.exec('PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON');
try{
if(action==='seed'){
fs.mkdirSync(path.dirname(config),{recursive:true});fs.writeFileSync(config,JSON.stringify({schemaVersion:1,libraryDirectory:data,profile:'balanced',openBrowser:false,preferredPort:4789,externalSources:{schemaVersion:1,revision:7,enabled:[]}},null,2));
fs.writeFileSync(path.join(home,'config','first-hop-preservation.txt'),'original synthetic configuration');
fs.mkdirSync(path.join(data,'downloads'),{recursive:true});fs.writeFileSync(path.join(data,'downloads','sentinel.bin'),'Synthetic downloaded-byte sentinel, not comic content.');
db.prepare('INSERT INTO episodes(id,comic_id,title,order_no,updated_at_source,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?)').run('first-hop-sentinel-ep','first-hop-sentinel-1','Synthetic chapter',1,stamp,stamp,stamp);
db.prepare('INSERT INTO reading_progress(comic_id,episode_id,page_index,updated_at) VALUES(?,?,?,?)').run('first-hop-sentinel-1','first-hop-sentinel-ep',7,stamp);
db.prepare('INSERT INTO app_state(key,value_json,updated_at) VALUES(?,?,?)').run('acceptance.synthetic.first-hop',JSON.stringify({synthetic:true,privateTags:['Fixture only'],gesturePercent:300,neverARealAccount:true}),stamp);
db.prepare('INSERT INTO user_events(id,occurred_at,event_type,comic_id,source,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)').run('first-hop-sentinel-event',stamp,'recommend_like','first-hop-sentinel-1','synthetic-acceptance','{}',stamp);
}else{
const hash=value=>createHash('sha256').update(value).digest('hex'),saved=JSON.parse(fs.readFileSync(config,'utf8'));
const result={config:{libraryDirectory:saved.libraryDirectory,profile:saved.profile,openBrowser:saved.openBrowser,preferredPort:saved.preferredPort,externalSourcesEnabled:saved.externalSources?.enabled??[]},configMarker:hash(fs.readFileSync(path.join(home,'config','first-hop-preservation.txt'))),download:hash(fs.readFileSync(path.join(data,'downloads','sentinel.bin'))),comic:db.prepare('SELECT id,title,raw_author,categories_json,tags_json,is_favorite FROM comics WHERE id=?').get('first-hop-sentinel-1'),progress:db.prepare('SELECT * FROM reading_progress WHERE comic_id=?').all('first-hop-sentinel-1'),privateState:db.prepare('SELECT * FROM app_state WHERE key=?').get('acceptance.synthetic.first-hop'),behavior:db.prepare('SELECT * FROM user_events WHERE id=?').get('first-hop-sentinel-event')};
if(action==='snapshot')fs.writeFileSync(path.join(root,'expected-state.json'),JSON.stringify(result));else if(action==='verify')assert.deepEqual(JSON.parse(JSON.stringify(result)),JSON.parse(fs.readFileSync(path.join(root,'expected-state.json'),'utf8')));else throw Error('Invalid state action');
}console.log(JSON.stringify({syntheticOnly:true,selectedUserStateCanariesPreserved:true}));
}finally{db.close()}
`
}
export const firstHopStateProgram = syntheticUpgradeStateProgram('old-first-hop')
export const runtimeChoiceStateProgram = syntheticUpgradeStateProgram('runtime-choice')
export const legacyTransitionStateProgram = syntheticUpgradeStateProgram('legacy-transition')
