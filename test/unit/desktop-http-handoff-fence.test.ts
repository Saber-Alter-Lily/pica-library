import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'
import {
    DesktopHttpHandoffFence,
    DesktopHttpHandoffError
} from '../../src/desktop/update-http-fence'
import { applyUpdateAndScheduleShutdown } from '../../src/desktop/update-command'
import { RuntimeResourceCoordinator } from '../../src/runtime/resource-coordinator'
import { enabledFixtureSources } from '../helpers/source-runtime-fixture'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('original Desktop HTTP freeze: process-local, not production snapshot', () => {
    it('blocks new Reader, download and GET requests while helper handoff is frozen', () => {
        const gate = new DesktopHttpHandoffFence()
        expect(gate.pendingRequests).toBe(0)
        const release = gate.enter('POST', '/api/v1/shelves')
        expect(release).toBeTypeOf('function')
        expect(gate.pendingRequests).toBe(1)
        expect(() => gate.freezeForHandoff())
            .toThrow(DesktopHttpHandoffError)
        release?.()
        release?.()
        expect(gate.pendingRequests).toBe(0)
        const rollback = gate.freezeForHandoff()
        expect(gate.frozen).toBe(true)
        for (const method of ['GET','POST','PUT','DELETE'] as const)
            expect(gate.enter(method,'/api/v1/comics')).toBeNull()
        expect(gate.enter('POST','/api/v1/download/start')).toBeNull()
        expect(gate.enter('GET','/reader.html')).toBeNull()
        expect(gate.enter('POST','/api/v1/update/apply'))
            .toBeTypeOf('function')
        for(const path of ['/status','/api/v1/desktop/status',
            '/api/v1/update/progress'])
            expect(gate.enter('GET',path)).toBeTypeOf('function')
        expect(gate.enter('POST','/api/v1/desktop/status')).toBeNull()
        expect(gate.pendingRequests).toBe(0)
        expect(() => gate.freezeForHandoff())
            .toThrow('An update handoff is already in progress')
        rollback()
        rollback()
        expect(gate.frozen).toBe(false)
        expect(gate.enter('GET','/api/v1/comics'))
            .toBeTypeOf('function')
    })

    it('refuses in-flight HTTP work and admits after actual finish/close releases', () => {
        const gate = new DesktopHttpHandoffFence()
        const one = gate.enter('POST','/api/v1/shelves')
        const two = gate.enter('GET','/api/v1/comics')
        expect(gate.pendingRequests).toBe(2)
        expect(() => gate.freezeForHandoff())
            .toThrow('Finish active Reader and library requests')
        one?.()
        expect(gate.pendingRequests).toBe(1)
        expect(() => gate.freezeForHandoff()).toThrow()
        two?.()
        expect(gate.pendingRequests).toBe(0)
        const restore = gate.freezeForHandoff()
        expect(gate.enter('POST','/api/v1/shelves')).toBeNull()
        restore()
    })

    it('keeps the fence closed during async helper ACK and only reopens after failed apply', async () => {
        const gate = new DesktopHttpHandoffFence()
        let reject!: (reason: Error) => void
        const apply = vi.fn(() => new Promise<Record<string, unknown>>(
            (_resolve, rejecter) => {reject = rejecter}
        ))
        const stop = vi.fn()
        vi.useFakeTimers()
        const pending = applyUpdateAndScheduleShutdown(
            {apply}, 'synthetic-job', {
                desktopHomeRoot:'qa-only',libraryDirectory:'qa-only'
            }, stop, () => gate.freezeForHandoff())
        expect(gate.frozen).toBe(true)
        expect(gate.enter('POST','/api/v1/comics')).toBeNull()
        reject(new Error('synthetic helper startup refused'))
        await expect(pending).rejects.toThrow('synthetic helper startup refused')
        expect(gate.frozen).toBe(false)
        expect(apply).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(3000)
        expect(stop).not.toHaveBeenCalled()
        const lease=gate.enter('GET','/status')
        expect(lease).toBeTypeOf('function')
        lease?.()
    })

    it('keeps HTTP frozen after helper ACK through the existing delayed shutdown', async () => {
        const gate = new DesktopHttpHandoffFence()
        const stop = vi.fn()
        const apply = vi.fn(async () => ({accepted:true}))
        vi.useFakeTimers()
        const result = applyUpdateAndScheduleShutdown(
            {apply},'synthetic-accepted', {
                desktopHomeRoot:'qa-only',libraryDirectory:'qa-only'
            }, stop, () => gate.freezeForHandoff())
        await expect(result).resolves.toMatchObject({accepted:true})
        expect(gate.frozen).toBe(true)
        expect(gate.enter('POST','/api/v1/comics')).toBeNull()
        await vi.advanceTimersByTimeAsync(149)
        expect(stop).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        expect(stop).toHaveBeenCalledTimes(1)
        // Only actual OS shutdown/process-proof can end a successful handoff.
        expect(gate.frozen).toBe(true)
    })

    it('freezes both real HTTP admissions and original runtime leases, restoring both after helper error', async () => {
        const httpFence = new DesktopHttpHandoffFence()
        const resources = new RuntimeResourceCoordinator({mode:'observe'})
        const shutdown = vi.fn()
        const failing = {apply:vi.fn(async()=> {
            throw new Error('synthetic-helper-rejected')
        })}
        vi.useFakeTimers()
        const result = applyUpdateAndScheduleShutdown(
            failing, 'synthetic-combined', {
                desktopHomeRoot:'synthetic-only',
                libraryDirectory:'synthetic-only'
            },shutdown,()=>{
                const restoreHttp=httpFence.freezeForHandoff()
                try {
                    const restoreResources=resources.freezeAcquisitionsForUpdate()
                    return () => {restoreResources();restoreHttp()}
                } catch(error){restoreHttp();throw error}
            }
        )
        expect(httpFence.frozen).toBe(true)
        expect(httpFence.enter('POST','/api/v1/comics')).toBeNull()
        await expect(resources.acquire({
            ownerId:'new-background',
            taskType:'maintenance',
            resources:{'sqlite-write-heavy':1}
        })).rejects.toThrow('Runtime task admission is already frozen')
        await expect(result).rejects.toThrow('synthetic-helper-rejected')
        expect(httpFence.frozen).toBe(false)
        const after=await resources.acquire({
            ownerId:'resumed',
            taskType:'ordinary',
            resources:{'sqlite-write-heavy':1}
        })
        after.release()
        expect(shutdown).not.toHaveBeenCalled()
    })

    it('preserves source-free server compatibility without requiring a fence', async () => {
        const serverCode = fs.readFileSync('src/library/server.ts','utf8')
        expect(serverCode).toContain('requestAdmission?:')
        expect(serverCode).toContain('options.requestAdmission?.enter(')
        const main = fs.readFileSync('src/desktop/main.ts','utf8')
        expect(main).toContain('const updateHttpFence = new DesktopHttpHandoffFence()')
        expect(main.split('requestAdmission: updateHttpFence').length-1).toBe(2)
        expect(main).toContain('updateHttpFence.freezeForHandoff()')
        expect(main).toContain('runtimeResources.freezeAcquisitionsForUpdate()')
        const fenceSource = fs.readFileSync('src/desktop/update-http-fence.ts','utf8')
        expect(fenceSource).not.toMatch(/(?:readFileSync|copyFileSync|writeFileSync|unlinkSync|rmSync|spawn\(|fork\()/)
    })
})

describe('actual original local web server uses the new Desktop-only admission port', () => {
    it('refuses real HTTP mutations and reader GET during freeze, leaves diagnostic/CSRF authority intact, restores after rollback', async () => {
        const root=fs.mkdtempSync(path.join(os.tmpdir(),'pica-http-update-qa-'))
        const db=new LibraryDatabase(path.join(root,'library.db'))
        const service=new LibraryService(db,root,undefined,undefined,undefined,
            enabledFixtureSources())
        const fence=new DesktopHttpHandoffFence()
        const chooser=vi.fn(async()=>null as string|null)
        const apply=vi.fn(async()=>({accepted:true}))
        const desktop={
            csrfToken:'synthetic-csrf',
            configured:()=>true,
            status:()=>({startupReady:true}),
            save:async()=>({}),
            testConnection:async()=>({}),
            chooseFolder:chooser,
            exportBrowserLitePackage:async()=>({}),
            openDirectory:async(_kind:string)=>{},
            shutdown:()=>{},
            updateProgress:()=>({phase:'waiting-for-exit'}),
            applyUpdate:apply
        }
        let started: Awaited<ReturnType<typeof startLibraryServer>> | null=null
        try{
            started=await startLibraryServer({
                database:db,service,host:'127.0.0.1',port:0,
                desktop,requestAdmission:fence
            })
            const base=started.url
            const headers={
                'x-pica-csrf':'synthetic-csrf',
                origin:base
            }
            const pre=await fetch(base+'/api/v1/desktop/choose-folder',{
                method:'POST',headers
            })
            expect(pre.status).toBe(200)
            expect(chooser).toHaveBeenCalledTimes(1)
            expect(fence.pendingRequests).toBe(0)
            const originalCount=db.listShelves().length
            const restore=fence.freezeForHandoff()
            expect(fence.frozen).toBe(true)
            const [blockedGet,blockedPost,diag,progress]=await Promise.all([
                fetch(base+'/api/v1/comics'),
                fetch(base+'/api/v1/shelves',{
                    method:'POST',headers:{...headers,'content-type':'application/json'},
                    body:JSON.stringify({name:'must-not-write'})
                }),
                fetch(base+'/api/v1/desktop/status'),
                fetch(base+'/api/v1/update/progress')
            ])
            expect(blockedGet.status).toBe(503)
            expect(blockedPost.status).toBe(503)
            expect((await blockedPost.json()).code)
                .toBe('DESKTOP_UPDATE_HANDOFF_FROZEN')
            expect(diag.status).toBe(200)
            expect(progress.status).toBe(200)
            expect(db.listShelves()).toHaveLength(originalCount)
            // The dedicated update route remains under the original CSRF
            // check before calling the application-owned UpdateManager port.
            const denied=await fetch(base+'/api/v1/update/apply',{
                method:'POST',headers:{'content-type':'application/json'},
                body:JSON.stringify({id:'fixture'})
            })
            expect(denied.status).toBe(403)
            expect(apply).not.toHaveBeenCalled()
            const acknowledged=await fetch(base+'/api/v1/update/apply',{
                method:'POST',headers:{...headers,'content-type':'application/json'},
                body:JSON.stringify({id:'fixture'})
            })
            expect(acknowledged.status).toBe(200)
            expect(apply).toHaveBeenCalledWith('fixture')
            restore()
            const next=await fetch(base+'/api/v1/desktop/choose-folder',{
                method:'POST',headers
            })
            expect(next.status).toBe(200)
            expect(chooser).toHaveBeenCalledTimes(2)
        } finally {
            if(started)
                await new Promise<void>((resolve,reject)=>
                    started!.server.close(error=>error?reject(error):resolve()))
            db.close()
            fs.rmSync(root,{recursive:true,force:true})
        }
    })
})
