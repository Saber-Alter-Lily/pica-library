import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'

// CI runtime gate: do not launch locally under LOCAL_VALIDATION_SAFETY.md.
// Unmodified compiled application + synthetic owned profile only. The external preload
// replaces only the native Save dialog outcome and observes SQL/forbidden fixture reads.
// It is never included in an application ZIP and is not a shipped test/fault API.
if (process.env.GITHUB_ACTIONS !== 'true')
    throw new Error('Permission-sensitive packaged runtime gate is CI-only; see docs/LOCAL_VALIDATION_SAFETY.md')
const [zipFile, version, sourceSha] = process.argv.slice(2)
if (
    process.platform !== 'win32' ||
    !zipFile ||
    !version ||
    !/^[a-f0-9]{40}$/.test(sourceSha ?? '')
)
    throw new Error('Explicit Windows ZIP/version/source required')
const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pica-recommendation-audit-')
)
const app = path.join(root, 'application'),
    home = path.join(root, 'profile', 'Pica Library Post Stable RC')
const data = path.join(home, 'data'),
    databaseFile = path.join(data, 'library.db')
const instanceFile = path.join(home, 'runtime-state', 'instance.json')
const control = path.join(root, 'picker-control.json'),
    trace = path.join(root, 'boundary-trace.jsonl')
const output = path.join(root, 'audit.zip'),
    preload = path.join(root, 'native-dialog-outcome.cjs')
const credentialCanary = path.join(home, 'config', 'credentials.dat'),
    bodyCanary = path.join(data, 'synthetic-body.bin')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const env = { ...process.env, LOCALAPPDATA: path.dirname(home) }
for (const key of Object.keys(env))
    if (key.startsWith('PICA_') || key === 'NODE_OPTIONS') delete env[key]
env.PICA_LIBRARY_DESKTOP_HOME = home
let instance,
    success = false
const mode = (value, enabled = true) =>
    fs.writeFileSync(control, JSON.stringify({ mode: value, trace: enabled }))
const rows = () =>
    fs.existsSync(trace)
        ? fs
              .readFileSync(trace, 'utf8')
              .trim()
              .split('\n')
              .filter(Boolean)
              .map((line) => JSON.parse(line))
        : []
function packagedNode(code, ...args) {
    const result = spawnSync(
        path.join(app, 'runtime', 'node.exe'),
        ['-e', code, ...args],
        { cwd: app, env, encoding: 'utf8', windowsHide: true, timeout: 30000 }
    )
    if (result.status !== 0)
        throw new Error(
            'Owned packaged SQLite operation failed: ' + result.stderr
        )
    return JSON.parse(result.stdout)
}
function snapshot() {
    return packagedNode(
        `const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1],{readOnly:true});
const names=d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
const result=names.map(name=>{if(!/^[a-z0-9_]+$/i.test(name))throw Error('Unexpected fixture table');return {name,rows:d.prepare('SELECT * FROM "'+name+'"').all().map(row=>JSON.stringify(row)).sort()}});d.close();console.log(JSON.stringify(result));`,
        databaseFile
    )
}
function requireUnchanged(before) {
    if (JSON.stringify(before) !== JSON.stringify(snapshot()))
        throw new Error('Read/export changed a synthetic user table')
}
async function status() {
    for (let i = 0; i < 200; i++) {
        try {
            const value = JSON.parse(fs.readFileSync(instanceFile, 'utf8'))
            if (value.pid && /^http:\/\/127\.0\.0\.1:\d+$/.test(value.url)) {
                instance = value
                const response = await fetch(
                    value.url + '/api/v1/desktop/status',
                    { signal: AbortSignal.timeout(3000) }
                )
                if (response.ok) return response.json()
            }
        } catch {}
        await sleep(100)
    }
    throw new Error('Owned packaged audit Desktop did not become ready')
}
async function post(route, body, suppliedState) {
    const state = suppliedState ?? (await status())
    const response = await fetch(instance.url + route, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-pica-csrf': state.csrfToken,
            Origin: instance.url
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000)
    })
    if (!response.ok)
        throw new Error('Owned audit operation failed HTTP ' + response.status)
    return response.json()
}
async function stop() {
    if (!instance) return
    mode('cancel', false)
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
    throw new Error('Owned packaged audit process did not exit')
}
try {
    new AdmZip(zipFile).extractAllTo(app)
    if (
        fs.readFileSync(path.join(app, 'SOURCE_SHA.txt'), 'utf8').trim() !==
        sourceSha
    )
        throw new Error('Actual audit package source mismatch')
    const csv = path.join(root, 'synthetic.csv')
    fs.writeFileSync(
        csv,
        'comic_id,title,author,categories,tags,finished,total_likes,total_views,pages_count,eps_count\nlocal:fixture,Audit Fixture,Fixture Creator,Fixture,fixture,true,1,1,12,1\nlocal:other,Audit Fixture,Fixture Creator,Fixture,fixture,true,1,1,12,1\n'
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
        throw new Error(
            'Packaged audit fixture import failed: ' + imported.stderr
        )
    mode('cancel', false)
    fs.writeFileSync(
        preload,
        `const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),{syncBuiltinESMExports}=require('node:module'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),{DatabaseSync}=require('node:sqlite');
const control=${JSON.stringify(control)},trace=${JSON.stringify(trace)},output=${JSON.stringify(output)},forbidden=${JSON.stringify([credentialCanary, bodyCanary])}.map(p=>path.resolve(p).toLowerCase());
const read=fs.readFileSync.bind(fs),spawn=cp.spawn;
const state=()=>{try{return JSON.parse(read(control,'utf8'))}catch{return {trace:false}}};
const record=kind=>{if(state().trace)fs.appendFileSync(trace,JSON.stringify({kind})+'\\n')};
for(const method of ['prepare','exec']){const original=DatabaseSync.prototype[method];DatabaseSync.prototype[method]=function(...args){record('sqlite-'+method);const result=original.apply(this,args);if(method==='prepare'&&/INSERT\\s+INTO\\s+app_state/i.test(String(args[0])))return new Proxy(result,{get(target,key){if(key==='run')return function(...values){const saved=target.run(...values);if(state().mode==='identity-policy-fail'&&values[0]==='recommendation.v5.portablePolicy.v1'){record('identity-policy-after-write-fault');throw Error('Synthetic identity policy write fault')}return saved};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}});return result}}
fs.readFileSync=function(file,...args){if(state().trace&&typeof file==='string'&&forbidden.includes(path.resolve(file).toLowerCase())){record('forbidden-fixture-read');throw Error('Audit must not read credential/body fixture')}return read(file,...args)};
cp.spawn=function(command,args,...rest){if(path.basename(String(command)).toLowerCase()==='powershell.exe'&&Array.isArray(args)&&args.some(a=>String(a).includes('SaveFileDialog')&&String(a).includes('Pica-Library-Recommendation-Audit-'))){record('audit-native-picker');const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();process.nextTick(()=>{if(state().mode==='accept')child.stdout.write(output);child.stdout.end();child.stderr.end();child.emit('exit',0)});return child}return spawn.call(this,command,args,...rest)};syncBuiltinESMExports();
`
    )
    const runEnv = {
        ...env,
        NODE_OPTIONS: '--require=' + JSON.stringify(preload)
    }
    spawn(path.join(app, 'Pica Library.exe'), ['--headless'], {
        cwd: app,
        env: runEnv,
        windowsHide: true,
        stdio: 'ignore'
    }).on('error', () => {})
    let state = await status()
    if (state.version !== version || state.configured)
        throw new Error('Expected fresh source-free audit profile')
    const oldCsrf = state.csrfToken
    await post(
        '/api/v1/desktop/settings',
        { setupMode: 'local', libraryDirectory: data, profile: 'balanced' },
        state
    )
    let ready = false
    for (let i = 0; i < 200; i++) {
        state = await status()
        if (
            state.configured &&
            state.startupReady &&
            state.csrfToken !== oldCsrf
        ) {
            ready = true
            break
        }
        await sleep(100)
    }
    if (
        !ready ||
        state.picaAccount?.configured ||
        state.externalSources?.enabled.length
    )
        throw new Error('Audit setup unexpectedly requires an external source')
    // Deliberately invalid synthetic secret/body files are added only after startup.
    fs.writeFileSync(credentialCanary, 'CREDENTIAL_FILE_CANARY_DO_NOT_EXPORT')
    fs.writeFileSync(bodyCanary, 'BODY_FILE_CANARY_DO_NOT_EXPORT')
    const before = snapshot()
    if (
        before
            .find((row) => row.name === 'app_state')
            ?.rows.some((row) =>
                row.includes('recommendation.v5.portablePolicy.v1')
            )
    )
        throw new Error('Fixture must not start with a persistent V5 policy')
    const routes = [
        '/api/v1/recommendation-v5',
        '/api/v1/recommendation-v5/preference-timescales?appSessionId=fixture-session',
        '/api/v1/recommendation-v5/behavior-evidence',
        '/api/v1/recommendation-v5/candidate-channels?appSessionId=fixture-session',
        '/api/v1/recommendation-v5/provider-routes',
        '/api/v1/recommendation-v5/serving-composition',
        ...[
            'summary',
            'steerability',
            'retrospective',
            'versions',
            'compare?baselineVersion=v5-shadow/fixture-a&candidateVersion=v5-shadow/fixture-b',
            'advanced-learning-gate'
        ].map((name) => '/api/v1/desktop/recommendation-v5/evaluation/' + name),
        '/api/v1/desktop/recommendation-v5/shadow-runs',
        '/api/v1/desktop/recommendation-v5/visual-activation-gate',
        '/api/v1/desktop/recommendation-v5/promotion-gate',
        ...['audit', 'evidence', 'review', 'materialization-plan', 'evidence/refresh/status']
            .map(name => '/api/v1/recommendation-v5/work-identity/' + name),
        '/api/v1/desktop/recommendation-v5/work-identity/materialization/runs',
        '/api/v1/comics/local%3Afixture/work-variants'
    ]
    for (const route of routes) {
        const response = await fetch(instance.url + route, {
            signal: AbortSignal.timeout(15000)
        })
        if (!response.ok)
            throw new Error(
                'Packaged audit GET failed: ' +
                    route +
                    ' HTTP ' +
                    response.status
            )
        await response.json()
        requireUnchanged(before)
    }
    state = await status()
    const start = rows().length
    mode('cancel')
    const cancelled = await post(
        '/api/v1/desktop/recommendation-v5/export-audit',
        { appSessionId: 'fixture-session' },
        state
    )
    mode('cancel', false)
    const cancelTrace = rows().slice(start)
    if (
        cancelled.success !== false ||
        cancelled.cancelled !== true ||
        fs.existsSync(output) ||
        JSON.stringify(cancelTrace) !==
            JSON.stringify([{ kind: 'audit-native-picker' }])
    )
        throw new Error(
            'Native cancellation performed reads or missed the actual picker boundary'
        )
    requireUnchanged(before)
    mode('accept')
    const exported = await post(
        '/api/v1/desktop/recommendation-v5/export-audit',
        { appSessionId: ' fixture-session ' },
        state
    )
    mode('cancel', false)
    const buffer = fs.readFileSync(output),
        zip = new AdmZip(buffer)
    const manifest = JSON.parse(zip.readAsText('manifest.json'))
    const entries = zip
        .getEntries()
        .map((entry) => entry.entryName)
        .sort()
    if (
        !exported.success ||
        exported.sha256 !== hash(buffer) ||
        exported.sizeBytes !== buffer.length ||
        manifest.schemaVersion !== 2 ||
        manifest.sourceSha !== sourceSha ||
        manifest.productVersion !== version ||
        manifest.appSessionId !== 'fixture-session' ||
        entries.length !== 11 ||
        JSON.stringify(entries) !==
            JSON.stringify([...manifest.includes].sort())
    )
        throw new Error(
            'Actual exported ZIP identity/member/session/checksum mismatch'
        )
    const catalog = JSON.parse(zip.readAsText('catalog_minimal.json'))
    const expectedFields = [
        'comicId',
        'title',
        'author',
        'canonicalAuthor',
        'tags',
        'categories',
        'providerId',
        'isFavorite',
        'inLibrary',
        'downloadedPictures',
        'firstSeenAt',
        'lastSeenAt'
    ].sort()
    if (
        catalog.length !== 2 ||
        catalog.some(row => JSON.stringify(Object.keys(row).sort()) !==
            JSON.stringify(expectedFields))
    )
        throw new Error(
            'Actual export did not retain minimal catalog field projection'
        )
    for (const entry of zip.getEntries())
        if (
            /CREDENTIAL_FILE_CANARY|BODY_FILE_CANARY/.test(
                zip.readAsText(entry)
            )
        )
            throw new Error('Forbidden fixture file leaked to export')
    if (rows().some((row) => row.kind === 'forbidden-fixture-read'))
        throw new Error('Export attempted to read a credential/body fixture')
    requireUnchanged(before)
    // Exercise the real compiled background task through its Desktop API with all
    // sources disabled. No fake endpoint or provider/account credential is shipped.
    // Earlier read/export checks remain exact all-table checks; only this explicit
    // manual shadow operation may append one non-serving candidate-pool audit row.
    const shadowRoute = '/api/v1/desktop/recommendation-v5/shadow-retrieval'
    const refused = await fetch(instance.url + shadowRoute, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-pica-csrf': state.csrfToken,
            Origin: instance.url
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(15000)
    })
    await refused.text()
    if (refused.ok)
        throw new Error('Packaged shadow task accepted missing explicit authority')
    requireUnchanged(before)
    const started = await post(shadowRoute, {
        confirmation: 'RUN_RECOMMENDATION_V5_SHADOW_RETRIEVAL',
        appSessionId: 'fixture-shadow-session'
    }, state)
    if (started.started !== true)
        throw new Error('Compiled shadow background task did not start')
    let shadowState
    for (let attempt = 0; attempt < 200; attempt++) {
        const response = await fetch(instance.url + shadowRoute + '/status', {
            signal: AbortSignal.timeout(3000)
        })
        if (!response.ok) throw new Error('Compiled shadow task status unavailable')
        shadowState = await response.json()
        if (!shadowState.active) break
        await sleep(50)
    }
    if (shadowState?.state !== 'complete' || !shadowState.result?.audit?.poolId)
        throw new Error('Compiled shadow task did not complete: ' + shadowState?.state)
    const afterShadow = snapshot()
    for (const table of before) {
        const actual = afterShadow.find(row => row.name === table.name)
        if (!actual) throw new Error('Compiled shadow removed a user table')
        if (table.name !== 'recommendation_v3_candidate_pools') {
            if (JSON.stringify(actual.rows) !== JSON.stringify(table.rows))
                throw new Error('Compiled shadow modified non-audit table: ' + table.name)
        } else if (actual.rows.length !== table.rows.length + 1 ||
            table.rows.some(row => !actual.rows.includes(row))) {
            throw new Error('Compiled shadow did not append exactly one audit pool')
        }
    }
    const savedShadow = packagedNode(
        `const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1],{readOnly:true});const r=d.prepare('SELECT * FROM recommendation_v3_candidate_pools WHERE id=?').get(process.argv[2]);d.close();console.log(JSON.stringify(r));`,
        databaseFile, shadowState.result.audit.poolId
    )
    const telemetry = JSON.parse(savedShadow.telemetry_json)
    if (telemetry.mode !== 'SHADOW' || telemetry.servingImpact !== false ||
        telemetry.persistCandidates !== false ||
        !savedShadow.recommendation_cycle_id.startsWith('v5-shadow:') ||
        savedShadow.app_session_id !== 'fixture-shadow-session' ||
        savedShadow.model_version !== shadowState.result.audit.modelVersion ||
        !telemetry.pipelineVersions || !telemetry.visualCandidateCoverage)
        throw new Error('Compiled shadow persistence violated its audit-only identity')
    console.log(JSON.stringify({
        packaged_recommendation_shadow: 'PASS', source_sha: sourceSha, version,
        actual_background_task: true, explicit_confirmation_rejected: true,
        appended_audit_pools: 1, all_non_audit_tables_preserved: true,
        missing_policy_not_initialized: true, enabled_external_sources: 0,
        serving_impact: false, candidate_persistence: false,
        source_revision_fault_injection: 'UNIT_SYNTHETIC_ONLY',
        provider_runtime_acceptance: 'NOT_RUN', synthetic_only: true,
        production_accessed: false, execution_location: 'GITHUB_WINDOWS_CI'
    }))
    // Actual compiled local-only identity task, then explicit human commands.
    // The external preload throws AFTER the real SQLite policy run, not before
    // the command or in a shipped fault endpoint. Only the transaction can erase it.
    const get = async route => {
        const response = await fetch(instance.url + route, { signal: AbortSignal.timeout(15000) })
        if (!response.ok) throw new Error('Compiled identity GET failed HTTP ' + response.status)
        return response.json()
    }
    const nonIdentityEqual = (previous, allowed) => {
        const current = snapshot()
        for (const table of previous) if (!allowed.includes(table.name) &&
            JSON.stringify(current.find(row => row.name === table.name)?.rows) !== JSON.stringify(table.rows))
            throw new Error('Compiled identity modified unrelated table: ' + table.name)
        return current
    }
    await post('/api/v1/recommendation-v5/work-identity/evidence/refresh', { limit: 50 }, state)
    let identityState
    for (let attempt = 0; attempt < 200; attempt++) {
        identityState = await get('/api/v1/recommendation-v5/work-identity/evidence/refresh/status')
        if (!identityState.active) break
        await sleep(50)
    }
    if (identityState?.state !== 'complete' || identityState.savedCount < 1)
        throw new Error('Actual compiled identity evidence task did not save its synthetic pair')
    const afterEvidence = nonIdentityEqual(afterShadow, ['work_identity_evidence'])
    const decisionRoute = '/api/v1/recommendation-v5/work-identity/decision'
    const pair = { leftComicId: 'local:fixture', rightComicId: 'local:other' }
    async function rejectedPolicyWrite(decision, baseline) {
        mode('identity-policy-fail')
        const failed = await fetch(instance.url + decisionRoute, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-pica-csrf': state.csrfToken, Origin: instance.url },
            body: JSON.stringify({ ...pair, decision }), signal: AbortSignal.timeout(15000)
        })
        await failed.text()
        mode('cancel', false)
        if (failed.ok) throw new Error('Compiled identity accepted a post-policy-write fault')
        requireUnchanged(baseline)
    }
    await rejectedPolicyWrite('KEEP_SEPARATE', afterEvidence)
    const separated = await post(decisionRoute, { ...pair, decision: 'KEEP_SEPARATE' }, state)
    if (!separated.decisions.some(row => row.decision === 'KEEP_SEPARATE'))
        throw new Error('Compiled human decision did not persist')
    const afterSeparate = snapshot()
    await rejectedPolicyWrite('CLEAR', afterSeparate)
    await post(decisionRoute, { ...pair, decision: 'SAME_WORK' }, state)
    const identityPlan = await get('/api/v1/recommendation-v5/work-identity/materialization-plan')
    if (identityPlan.summary.fullBindingReadyCount !== 1 || identityPlan.writeEnabled !== false)
        throw new Error('Compiled explicit local pair plan was not ready and dry-run only')
    const prepareInput = {
        requestKey: 'synthetic-compiled-plan', confirmation: 'PREPARE_CANONICAL_WORK_BINDING',
        planVersion: identityPlan.planVersion, planDigest: identityPlan.planDigest
    }
    const prepareRoute = '/api/v1/desktop/recommendation-v5/work-identity/materialization/prepare'
    for (let attempt = 0; attempt < 2; attempt++) {
        const prepared = await post(prepareRoute, prepareInput, state)
        if (prepared.mode !== 'PREPARED_ONLY' || prepared.executionEnabled !== false || prepared.applyEndpoint !== null ||
            prepared.run.status !== 'PREPARED' || prepared.run.idempotentReplay !== (attempt > 0))
            throw new Error('Compiled materialization escaped prepare-only/idempotent authority')
    }
    await post(decisionRoute, { ...pair, decision: 'CLEAR' }, state)
    const afterIdentity = nonIdentityEqual(afterEvidence, ['work_identity_decisions', 'app_state', 'work_identity_materialization_runs'])
    const tableRows = name => afterIdentity.find(row => row.name === name).rows
    const policyRow = tableRows('app_state').map(row => JSON.parse(row)).find(row => row.key === 'recommendation.v5.portablePolicy.v1')
    if (!policyRow || JSON.parse(policyRow.value_json).explicitDistinctPairs.length || tableRows('work_identity_decisions').length ||
        tableRows('work_identity_materialization_runs').length !== 1 || tableRows('canonical_works').length ||
        tableRows('work_editions').length || tableRows('work_upload_bindings').length ||
        rows().filter(row => row.kind === 'identity-policy-after-write-fault').length !== 2 ||
        rows().some(row => row.kind === 'forbidden-fixture-read'))
        throw new Error('Compiled identity transaction/clear/preparation state is inconsistent')
    console.log(JSON.stringify({
        packaged_work_identity_module: 'PASS', source_sha: sourceSha, version,
        identity_read_only_gets: 7, read_views_missing_policy_preserved: true,
        actual_background_evidence_task: true, background_missing_policy_preserved: true,
        observed_post_sql_policy_faults: 2, both_faults_all_tables_rolled_back: true,
        explicit_save_change_clear: true, prepared_only_idempotent: true,
        canonical_work_edition_binding_created: false,
        unrelated_user_tables_preserved: true, external_preload_only: true,
        real_provider_acceptance: 'NOT_RUN', production_accessed: false,
        execution_location: 'GITHUB_WINDOWS_CI'
    }))
    // Remove only the two exact synthetic canaries before normal shutdown/startup handling.
    fs.unlinkSync(credentialCanary)
    fs.unlinkSync(bodyCanary)
    success = true
    console.log(
        JSON.stringify({
            packaged_recommendation_audit: 'PASS',
            source_sha: sourceSha,
            version,
            audit_gets: routes.length,
            all_user_tables_preserved: true,
            missing_policy_not_initialized: true,
            actual_cancel_picker_observed: true,
            cancelled_export_sql_operations: 0,
            actual_export_entries: entries,
            manifest_session_source_hash_verified: true,
            minimal_catalog_verified: true,
            credential_body_fixture_reads: 0,
            external_preload_only: true,
            native_dialog_rendering: 'MANUAL_PENDING',
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
            'Owned audit backend still alive; synthetic fixture retained: ' +
                root
        )
    if (success) {
        const resolved = fs.realpathSync(root),
            parent = fs.realpathSync(os.tmpdir())
        if (
            path.dirname(resolved) !== parent ||
            !path.basename(resolved).startsWith('pica-recommendation-audit-') ||
            fs.lstatSync(root).isSymbolicLink()
        )
            throw new Error('Unsafe audit fixture cleanup')
        fs.rmSync(resolved, {
            recursive: true,
            force: true,
            maxRetries: 10,
            retryDelay: 100
        })
    } else
        process.stderr.write('Synthetic audit fixture retained: ' + root + '\n')
}
