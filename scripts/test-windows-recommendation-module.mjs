import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import AdmZip from 'adm-zip'

// Reuse the existing actual-archive/local-profile harness pattern. No installed profile is used.
const [zipFile, version, sourceSha] = process.argv.slice(2)
if (
    process.platform !== 'win32' ||
    !zipFile ||
    !version ||
    !/^[a-f0-9]{40}$/.test(sourceSha ?? '')
)
    throw new Error('Explicit Windows package/version/source required')
// The current Desktop application owns this fixed bridge port. Do not disturb another application.
const reservation = net.createServer()
await new Promise((resolve, reject) => {
    reservation.once('error', reject)
    reservation.listen(7788, '0.0.0.0', resolve)
})
await new Promise((resolve) => reservation.close(resolve))
const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pica-recommendation-module-')
)
const app = path.join(root, 'application'),
    home = path.join(root, 'profile', 'Pica Library Post Stable RC'),
    data = path.join(home, 'data')
const instanceFile = path.join(home, 'runtime-state', 'instance.json'),
    databaseFile = path.join(data, 'library.db')
const env = { ...process.env, LOCALAPPDATA: path.dirname(home) }
for (const key of Object.keys(env)) if (key.startsWith('PICA_')) delete env[key]
env.PICA_LIBRARY_DESKTOP_HOME = home
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let instance,
    success = false
function packagedNode(code, ...args) {
    const result = spawnSync(
        path.join(app, 'runtime', 'node.exe'),
        ['-e', code, ...args],
        { cwd: app, env, encoding: 'utf8', windowsHide: true, timeout: 30000 }
    )
    if (result.status !== 0)
        throw new Error(
            'Packaged synthetic SQLite operation failed: ' + result.stderr
        )
    return JSON.parse(result.stdout)
}
function snapshot() {
    return packagedNode(
        `const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1],{readOnly:true});
const tables=['recommendation_v3_candidate_pools','recommendation_v3_batches','recommendation_seen'];
const result={keys:d.prepare("SELECT key,value_json FROM app_state WHERE key LIKE 'recommendation.%' ORDER BY key").all()};
for(const table of tables)result[table]=d.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all();d.close();console.log(JSON.stringify(result));`,
        databaseFile
    )
}
async function status() {
    for (let i = 0; i < 200; i++) {
        try {
            const value = JSON.parse(fs.readFileSync(instanceFile, 'utf8'))
            if (value.pid && /^http:\/\/127\.0\.0\.1:\d+$/.test(value.url)) {
                instance = value
                const response = await fetch(
                    instance.url + '/api/v1/desktop/status',
                    { signal: AbortSignal.timeout(3000) }
                )
                if (response.ok) return response.json()
            }
        } catch {}
        await sleep(100)
    }
    throw new Error('Owned packaged Desktop did not become ready')
}
async function post(route, body) {
    const state = await status(),
        response = await fetch(instance.url + route, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-pica-csrf': state.csrfToken,
                Origin: instance.url
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000)
        })
    if (!response.ok)
        throw new Error(
            'Owned Desktop operation failed: ' +
                route +
                ' HTTP ' +
                response.status
        )
    return response.json()
}
function launch() {
    spawn(
        path.join(app, 'Pica Library.exe'),
        ['--headless', '--mobile-bridge'],
        { cwd: app, env, windowsHide: true, stdio: 'ignore' }
    ).on('error', () => {})
}
async function stop() {
    if (!instance) return
    const pid = instance.pid
    await post('/api/v1/desktop/shutdown', {})
    for (let i = 0; i < 120; i++) {
        try {
            process.kill(pid, 0)
        } catch {
            instance = null
            return
        }
        await sleep(100)
    }
    throw new Error('Owned packaged process did not exit')
}
try {
    new AdmZip(zipFile).extractAllTo(app)
    if (
        fs.readFileSync(path.join(app, 'SOURCE_SHA.txt'), 'utf8').trim() !==
        sourceSha
    )
        throw new Error('Actual archive source mismatch')
    const csv = path.join(root, 'synthetic.csv')
    fs.writeFileSync(
        csv,
        'comic_id,title,author,categories,tags,finished,total_likes,total_views,pages_count,eps_count\nlocal:owned,Owned Fixture,Owned Creator,Fixture,owned,true,1,1,12,1\nfixture-a,Distinct Fixture A,Creator A,Fixture,alpha,true,1,1,12,1\nfixture-b,Distinct Fixture B,Creator B,Fixture,beta,true,1,1,12,1\n'
    )
    const imported = spawnSync(
        path.join(app, 'runtime', 'node.exe'),
        [
            path.join(app, 'app', 'pica-library.js'),
            'import',
            csv,
            '--data-dir',
            data,
            '--json'
        ],
        { cwd: app, env, encoding: 'utf8', windowsHide: true, timeout: 30000 }
    )
    if (imported.status !== 0)
        throw new Error('Packaged fixture import failed: ' + imported.stderr)
    const candidates = packagedNode(
        `const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1]);
// CSV import intentionally creates both favorites and library membership. Candidates must be neither.
d.prepare("UPDATE comics SET is_favorite=0 WHERE id IN ('fixture-a','fixture-b')").run();
d.prepare("DELETE FROM library_membership WHERE comic_id IN ('fixture-a','fixture-b')").run();
const rows=d.prepare("SELECT c.id,c.is_favorite,EXISTS(SELECT 1 FROM library_membership m WHERE m.comic_id=c.id) AS in_library FROM comics c WHERE c.id IN ('fixture-a','fixture-b') ORDER BY c.id").all();d.close();console.log(JSON.stringify(rows));`,
        databaseFile
    )
    if (
        candidates.length !== 2 ||
        candidates.some((row) => row.is_favorite || row.in_library)
    )
        throw new Error(
            'Synthetic candidates must be outside favorites and owned library'
        )
    launch()
    let state = await status()
    if (state.version !== version || state.configured)
        throw new Error('Expected fresh isolated package')
    const oldCsrf = state.csrfToken
    await post('/api/v1/desktop/settings', {
        setupMode: 'local',
        libraryDirectory: data,
        profile: 'balanced'
    })
    let ready = false
    for (let i = 0; i < 200; i++) {
        try {
            state = await status()
            if (
                state.configured &&
                state.startupReady &&
                state.csrfToken !== oldCsrf
            ) {
                ready = true
                break
            }
        } catch {}
        await sleep(100)
    }
    if (
        !ready ||
        state.picaAccount?.configured ||
        state.externalSources?.enabled.length
    )
        throw new Error('Expected source-free local setup')
    if (snapshot().keys.some((row) => row.key === 'recommendation.activeCycle'))
        throw new Error('Local startup generated a legacy cycle')
    packagedNode(
        `const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1]);const at='2026-01-01T00:00:00.000Z',ids=['fixture-a','fixture-b'];
const versions={profileVersion:'fixture',registryVersion:'fixture',rankerModelVersion:'fixture-frozen',candidatePoolVersion:'fixture',allocatorVersion:'fixture'};
const ranked=ids.map((id,i)=>({comicId:id,rawRank:i+1,score:100-i,features:{},reasons:[],evidence:{comicId:id,originIntentIds:[],originRouteIds:[],routeFamilies:[],primaryFamily:'EXPLORATION',routeHitCount:0,intentHitCount:0,providerBestRank:i+1,providerRanks:[i+1],queryTerms:[],conjunctionEvidence:[],relatedSeedIds:[],exploration:true,firstSeenAt:at}}));
d.exec('BEGIN IMMEDIATE');
d.prepare('INSERT INTO recommendation_v3_candidate_pools(id,app_session_id,recommendation_cycle_id,generated_at,expires_at,model_version,telemetry_json,candidate_ids_json) VALUES (?,?,?,?,?,?,?,?)').run('fixture-pool',null,'fixture-cycle',at,null,'fixture',JSON.stringify({state:'ACTIVE',readiness:'READY_LIMITED',rankedCandidates:ranked,intentPlan:[],telemetry:{recommendationV5:{portableBaseline:{fixture:'baseline'}}}}),JSON.stringify(ids));
d.prepare('INSERT INTO recommendation_v3_batches(id,pool_id,recommendation_cycle_id,recommendation_session_id,batch_index,context_id,generated_at,item_ids_json,evidence_json) VALUES (?,?,?,?,?,?,?,?,?)').run('fixture-batch','fixture-pool','fixture-cycle',null,0,'fixture-context',at,JSON.stringify(ids),JSON.stringify({requestId:'CURRENT',items:[]}));
for(const id of ids)d.prepare('INSERT INTO recommendation_seen(cycle_id,comic_id,first_seen_at) VALUES (?,?,?)').run('fixture-cycle',id,at);
d.prepare('INSERT INTO app_state(key,value_json,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at').run('recommendation.v3.activeCycle.v1',JSON.stringify({schemaVersion:1,activeCycleId:'fixture-cycle',buildingCycleId:null,activeBatchIndex:0,previousUsableCycleId:null,buildingRequestId:null,versions}),at);
d.exec('COMMIT');d.close();console.log('{}');`,
        databaseFile
    )
    const before = snapshot()
    if (
        before.keys.some(
            (row) => row.key === 'recommendation.v5.portablePolicy.v1'
        )
    )
        throw new Error('Fixture must start without a saved policy')
    async function pairedGet(route) {
        const current = await status(),
            mobile = current.mobileBridge
        if (!mobile?.enabled || mobile.port !== 7788)
            throw new Error('Owned packaged Mobile Bridge unavailable')
        const base = 'http://127.0.0.1:' + mobile.port
        if (!pairedGet.token) {
            const response = await fetch(base + '/mobile/v1/pair', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    code: mobile.pairingCode,
                    deviceName: 'Synthetic Acceptance Phone'
                }),
                signal: AbortSignal.timeout(5000)
            })
            if (!response.ok) throw new Error('Synthetic pairing failed')
            pairedGet.token = String((await response.json()).token)
        }
        const response = await fetch(base + route, {
            headers: { authorization: 'Bearer ' + pairedGet.token },
            signal: AbortSignal.timeout(5000)
        })
        if (!response.ok)
            throw new Error(
                'Packaged paired GET failed HTTP ' + response.status
            )
        return response.json()
    }
    const current = await pairedGet('/mobile/v1/recommendations'),
        cache = await pairedGet('/mobile/v1/recommendations/cache')
    if (
        current.batchId !== 'fixture-batch' ||
        current.source !== 'final-v3-current' ||
        !current.cached ||
        JSON.stringify(current.recommendations.map((r) => r.comicId)) !==
            JSON.stringify(['fixture-a', 'fixture-b'])
    )
        throw new Error(
            'Packaged current result changed: ' +
                JSON.stringify({
                    batchId: current.batchId,
                    source: current.source,
                    cached: current.cached,
                    ids: current.recommendations?.map((r) => r.comicId),
                    filter: current.servingFilterTelemetry
                })
        )
    if (
        cache.source !== 'final-v3-portable-cache' ||
        !cache.cached ||
        cache.policyBaseline?.fixture !== 'baseline' ||
        cache.items.length !== 2
    )
        throw new Error('Packaged portable view invalid')
    if (JSON.stringify(snapshot()) !== JSON.stringify(before))
        throw new Error('GET changed cycle/policy/batch/seen data')
    await post('/api/v1/recommendation-v5/control', {
        targetType: 'TAG',
        key: 'alpha',
        label: 'Synthetic Alpha',
        direction: 'BLOCK',
        scope: 'PERSISTENT'
    })
    const afterBlock = snapshot()
    for (const table of [
        'recommendation_v3_candidate_pools',
        'recommendation_v3_batches',
        'recommendation_seen'
    ])
        if (JSON.stringify(afterBlock[table]) !== JSON.stringify(before[table]))
            throw new Error('Block changed original pool/batch/seen data')
    const filtered = await pairedGet('/mobile/v1/recommendations'),
        filteredCache = await pairedGet('/mobile/v1/recommendations/cache')
    if (
        JSON.stringify(filtered.recommendations.map((r) => r.comicId)) !==
            JSON.stringify(['fixture-b']) ||
        JSON.stringify(filteredCache.items.map((r) => r.comicId)) !==
            JSON.stringify(['fixture-b'])
    )
        throw new Error('Warm cached view ignored new BLOCK')
    if (JSON.stringify(snapshot()) !== JSON.stringify(afterBlock))
        throw new Error('Filtered GET mutated persisted data')
    await stop()
    pairedGet.token = ''
    launch()
    await status()
    const restarted = await pairedGet('/mobile/v1/recommendations')
    if (
        restarted.batchId !== 'fixture-batch' ||
        JSON.stringify(restarted.recommendations.map((r) => r.comicId)) !==
            JSON.stringify(['fixture-b']) ||
        JSON.stringify(snapshot()) !== JSON.stringify(afterBlock)
    )
        throw new Error('Restart changed frozen recommendation state')
    if (fs.existsSync(path.join(home, 'config', 'credentials.dat')))
        throw new Error('Source-free test created credentials')
    success = true
    console.log(
        JSON.stringify({
            packaged_recommendation_module: 'PASS',
            source_sha: sourceSha,
            version,
            local_startup_no_legacy_recall: true,
            paired_get_read_only: true,
            missing_policy_not_initialized: true,
            frozen_scores_batches_seen_preserved: true,
            warm_block_revalidated: true,
            portable_and_batch_consistent: true,
            restart_preserved: true,
            credentials_created: false,
            synthetic_only: true,
            production_accessed: false
        })
    )
} finally {
    if (instance)
        try {
            await stop()
        } catch {}
    if (instance)
        throw new Error(
            'Owned packaged backend still alive; fixture retained: ' + root
        )
    if (success) {
        const resolved = fs.realpathSync(root),
            parent = fs.realpathSync(os.tmpdir())
        if (
            path.dirname(resolved) !== parent ||
            !path
                .basename(resolved)
                .startsWith('pica-recommendation-module-') ||
            fs.lstatSync(root).isSymbolicLink()
        )
            throw new Error('Unsafe cleanup')
        fs.rmSync(resolved, {
            recursive: true,
            force: true,
            maxRetries: 10,
            retryDelay: 100
        })
    } else process.stderr.write('Synthetic fixture retained: ' + root + '\n')
}
