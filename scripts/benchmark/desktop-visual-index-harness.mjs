import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import { spawnSync } from 'node:child_process'

function arg(name) {
    const prefix = `--${name}=`
    const inline = process.argv.slice(2).find((value) => value.startsWith(prefix))
    if (inline) return inline.slice(prefix.length)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : undefined
}
function integer(name, fallback) {
    const value = arg(name)
    if (value === undefined) return fallback
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1)
        throw new Error(`--${name} must be a positive integer`)
    return parsed
}
function options() {
    const raw = arg('base-url')
    const fixtureFile = arg('fixture')
    if (!raw || !fixtureFile) throw new Error('--base-url and --fixture are required')
    const url = new URL(raw)
    const host = url.hostname.replace(/^\[|\]$/g, '')
    if (url.protocol !== 'http:' || url.username || url.password ||
        !['127.0.0.1','localhost','::1'].includes(host))
        throw new Error('J10 accepts only credential-free loopback Desktop URLs')
    const fixture = JSON.parse(fs.readFileSync(path.resolve(fixtureFile), 'utf8'))
    if (!fixture.comicId) throw new Error('J10 fixture is missing comicId')
    return {
        baseUrl: url.toString().replace(/\/$/, ''),
        fixture,
        rounds: integer('rounds', 5),
        timeoutMs: integer('timeout-ms', 180000),
        output: arg('output') || 'test-results/desktop-visual-index/desktop-visual-index-benchmark.json',
        allowModelNetwork: process.argv.includes('--allow-model-network') ||
            process.env.PICA_VISUAL_BENCHMARK_ALLOW_MODEL_NETWORK === '1'
    }
}
function playwright() {
    const root = process.env.PICA_PLAYWRIGHT_TOOL_ROOT
    if (!root) throw new Error('PICA_PLAYWRIGHT_TOOL_ROOT is required')
    return createRequire(path.join(root, 'package.json'))('@playwright/test')
}
function gitSha() {
    const run = spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']})
    const value = run.status === 0 ? run.stdout.trim() : ''
    return /^[0-9a-f]{40}$/i.test(value) ? value : null
}
function summary(values) {
    const data = values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b)
    if (!data.length) return {count:0,min:null,median:null,p95:null,max:null}
    const mid = Math.floor(data.length/2)
    const median = data.length%2 ? data[mid] : (data[mid-1]+data[mid])/2
    const clean = (value) => Math.round(value*100)/100
    return {
        count:data.length,min:clean(data[0]),median:clean(median),
        p95:clean(data[Math.min(data.length-1,Math.ceil(data.length*.95)-1)]),
        max:clean(data[data.length-1])
    }
}
async function waitShell(page, timeout) {
    await page.waitForFunction(() => {
        const mode=document.querySelector('#mode')
        const nav=document.querySelector('nav.app-nav')
        return mode instanceof HTMLElement &&
            !String(mode.textContent||'').includes('正在检测模式') &&
            nav instanceof HTMLElement && !nav.hidden
    },undefined,{timeout})
}
async function waitView(page,id,timeout) {
    await page.waitForFunction((view) => {
        const node=document.querySelector(`#${view}`)
        return node instanceof HTMLElement && node.classList.contains('active')
    },id,{timeout})
}
async function raf(page, duration=850) {
    return page.evaluate((ms) => new Promise((resolve) => {
        const values=[]; const started=performance.now(); let previous=started
        const frame=(now) => {
            if (previous!==started) values.push(now-previous)
            previous=now
            if (now-started>=ms) resolve(values)
            else requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
    }),duration)
}
async function main() {
    const config=options()
    if (!config.allowModelNetwork)
        throw new Error('J10 real-model evidence requires explicit --allow-model-network; there is no synthetic inference mode.')
    const {chromium}=playwright()
    const browser=await chromium.launch({headless:true})
    const context=await browser.newContext({locale:'zh-CN',viewport:{width:1440,height:1000}})
    await context.addInitScript(() => {
        localStorage.setItem('pica-library-language','zh-CN')
        localStorage.setItem('pica-library-disclaimer-v1',JSON.stringify({version:'1',acceptedAt:'2026-01-01T00:00:00.000Z'}))
        localStorage.setItem('pica-onboarding-state-v1',JSON.stringify({completedVersion:1,dismissedVersion:0,autoShow:true}))
    })
    const page=await context.newPage()
    const pageErrors=[]; const modelRequests=[]
    page.on('pageerror',(error)=>pageErrors.push(String(error?.stack||error)))
    page.on('request',(request)=>{
        const url=request.url()
        if (/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers|huggingface\.co|hf\.co|onnx-community\/dinov2-small/i.test(url))
            modelRequests.push({method:request.method(),url:url.replace(/[?#].*$/,'')})
    })
    await page.goto(`${config.baseUrl}/`,{waitUntil:'domcontentloaded',timeout:config.timeoutMs})
    await waitShell(page,config.timeoutMs)
    await page.locator('nav [data-view="settings"]').click()
    await waitView(page,'settings',config.timeoutMs)
    await page.waitForFunction(() => {
        const button=document.querySelector('#visual-index-build')
        return button instanceof HTMLButtonElement && !button.disabled
    },undefined,{timeout:config.timeoutMs})
    const before=await page.evaluate(async()=>fetch('/api/v1/visual/status').then(r=>r.json()))
    if (!before.pendingComicIds?.includes(config.fixture.comicId))
        throw new Error('J10 fixture comic is not pending Visual indexing')
    const indexedBefore=Number(before.indexedCount||0)
    const buildStarted=Date.now()
    await page.locator('#visual-index-build').click()
    await page.waitForFunction(() => {
        const button=document.querySelector('#visual-index-build')
        const message=document.querySelector('#visual-index-message')
        return button instanceof HTMLButtonElement && button.disabled &&
            message instanceof HTMLElement && message.dataset.busy==='true'
    },undefined,{timeout:config.timeoutMs})
    const nav=[]; const rafIntervals=[]
    for (let round=0; round<config.rounds; round++) {
        rafIntervals.push(...await raf(page))
        let started=performance.now()
        await page.locator('nav [data-view="library"]').click()
        await waitView(page,'library',config.timeoutMs)
        nav.push(performance.now()-started)
        started=performance.now()
        await page.locator('nav [data-view="settings"]').click()
        await waitView(page,'settings',config.timeoutMs)
        nav.push(performance.now()-started)
        const status=await page.evaluate(async()=>fetch('/api/v1/visual/status').then(r=>r.json()))
        if (Number(status.indexedCount||0)>indexedBefore) break
    }
    await page.waitForFunction((count) =>
        fetch('/api/v1/visual/status').then(r=>r.json()).then(s=>Number(s.indexedCount||0)>count),
        indexedBefore,{timeout:config.timeoutMs})
    const firstEmbeddingElapsedMs=Date.now()-buildStarted
    const stop=page.locator('#visual-index-stop')
    if (await stop.isVisible()) await stop.click()
    await page.waitForFunction(() => {
        const button=document.querySelector('#visual-index-build')
        return button instanceof HTMLButtonElement && !button.disabled
    },undefined,{timeout:config.timeoutMs})
    if (!modelRequests.length)
        throw new Error('J10 completed indexing without observing Transformers.js/model network traffic')
    if (pageErrors.length) throw new Error(`J10 browser errors: ${pageErrors.join(' | ')}`)
    const report={
        schemaVersion:1,benchmark:'p2-j10-desktop-visual-index-foreground',
        measuredAt:new Date().toISOString(),commit:gitSha(),
        environment:{platform:process.platform,arch:process.arch,node:process.version,
            cpuModel:os.cpus()[0]?.model??null,logicalCpuCount:os.cpus().length,
            totalMemoryBytes:os.totalmem(),browser:'chromium',browserVersion:browser.version()},
        protocol:{productionWorker:'web/visual-worker.js',
            library:'@huggingface/transformers@4.2.0',
            model:'onnx-community/dinov2-small',inference:'image-feature-extraction',
            noSyntheticCpuModelLease:true,realModelNetwork:true},
        evidence:{embeddingPersisted:true,firstEmbeddingElapsedMs,
            modelRequestCount:modelRequests.length,
            modelRequestOrigins:[...new Set(modelRequests.map(v=>new URL(v.url).origin))].sort()},
        foreground:{navSwitchToUsableMs:summary(nav),rafIntervalMs:summary(rafIntervals),
            intervalsOver34Ms:rafIntervals.filter(v=>v>34).length,
            intervalsOver50Ms:rafIntervals.filter(v=>v>50).length},
        warning:'Real model/browser evidence only. Hardware, cache and network affect results; no P2-K budget is selected.'
    }
    await context.close(); await browser.close()
    const output=path.resolve(config.output)
    fs.mkdirSync(path.dirname(output),{recursive:true})
    fs.writeFileSync(output,`${JSON.stringify(report,null,2)}\n`,'utf8')
    process.stdout.write(`${JSON.stringify(report,null,2)}\n`)
}
main().catch((error)=>{console.error(error);process.exitCode=1})
