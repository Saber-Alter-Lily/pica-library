import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstanceLock } from '../../src/desktop/instance'
const owned: Array<{ root: string; locks: InstanceLock[] }> = []
function fixture() {
    const root = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'pica-instance-ownership-test-'))
    )
    const locks: InstanceLock[] = []
    owned.push({ root, locks })
    const lock = path.join(root, 'instance.lock'),
        info = path.join(root, 'instance.json')
    const create = (
        options?: ConstructorParameters<typeof InstanceLock>[2]
    ) => {
        const instance = new InstanceLock(lock, info, options)
        locks.push(instance)
        return instance
    }
    return { root, lock, info, create }
}
afterEach(() => {
    vi.restoreAllMocks()
    for (const { root, locks } of owned.splice(0)) {
        for (const instance of locks) {
            try {
                instance.release()
            } catch {
                /* Intentionally changed foreign test metadata remains inside the owned root. */
            }
        }
        if (
            fs.realpathSync(root) !== root ||
            path.dirname(root) !== fs.realpathSync(os.tmpdir()) ||
            !path.basename(root).startsWith('pica-instance-ownership-test-') ||
            fs.lstatSync(root).isSymbolicLink()
        )
            throw Error('Unsafe owned lock test cleanup')
        fs.rmSync(root, { recursive: true, force: false })
    }
})
describe('desktop instance ownership across startup failure and maintenance', () => {
    it('never touches existing paths when release is called without any acquisition attempt', () => {
        const f = fixture()
        fs.writeFileSync(f.lock, 'foreign')
        fs.writeFileSync(f.info, 'foreign-info')
        f.create().release()
        expect(fs.readFileSync(f.lock, 'utf8')).toBe('foreign')
        expect(fs.readFileSync(f.info, 'utf8')).toBe('foreign-info')
    })
    it('supports idempotent ownership checks and release without deleting a later owner', () => {
        const f = fixture(),
            first = f.create()
        expect(first.acquire()).toBe(true)
        expect(first.acquire()).toBe(true)
        first.publish('http://127.0.0.1:4789')
        first.assertHeld()
        first.release()
        fs.writeFileSync(f.lock, 'later-owner')
        fs.writeFileSync(f.info, 'later-info')
        first.release()
        expect(fs.readFileSync(f.lock, 'utf8')).toBe('later-owner')
        expect(fs.readFileSync(f.info, 'utf8')).toBe('later-info')
    })
    it('requires ownership before publishing and preserves the existing public metadata format', () => {
        const f = fixture(),
            instance = f.create()
        expect(() => instance.publish('http://127.0.0.1:4789')).toThrow(
            'DESKTOP_INSTANCE_OWNERSHIP'
        )
        expect(fs.existsSync(f.info)).toBe(false)
        expect(instance.acquire()).toBe(true)
        instance.publish('http://127.0.0.1:4789')
        instance.publish('http://127.0.0.1:4790')
        expect(
            Object.keys(JSON.parse(fs.readFileSync(f.info, 'utf8'))).sort()
        ).toEqual(['pid', 'startedAt', 'url'])
        expect(instance.readInfo()?.url).toBe('http://127.0.0.1:4790')
        expect(fs.readdirSync(f.root).sort()).toEqual([
            'instance.json',
            'instance.lock'
        ])
    })
    it.each(['', '0', '-1', 'not-a-pid', '9'.repeat(1000)])(
        'retains malformed/oversized locks without process probing: %s',
        (value) => {
            const f = fixture()
            fs.writeFileSync(f.lock, value)
            const probe = vi.fn(() => 'dead' as const)
            expect(f.create({ probeProcess: probe }).acquire()).toBe(false)
            expect(probe).not.toHaveBeenCalled()
            expect(fs.readFileSync(f.lock, 'utf8')).toBe(value)
        }
    )
    it('maintenance refuses even a dead-looking slot without reclaim or liveness probing', () => {
        const f = fixture()
        fs.writeFileSync(f.lock, '99999999')
        fs.writeFileSync(f.info, '{}')
        const probe = vi.fn(() => 'dead' as const)
        expect(
            f.create({ recoverStale: false, probeProcess: probe }).acquire()
        ).toBe(false)
        expect(probe).not.toHaveBeenCalled()
        expect(fs.readFileSync(f.lock, 'utf8')).toBe('99999999')
    })
    it('does not reclaim a slot changed during the stale-process probe', () => {
        const f = fixture()
        fs.writeFileSync(f.lock, '1234567')
        fs.writeFileSync(f.info, '{}')
        const probe = vi.fn(() => {
            fs.writeFileSync(f.lock, String(process.pid))
            return 'dead' as const
        })
        expect(f.create({ probeProcess: probe }).acquire()).toBe(false)
        expect(fs.readFileSync(f.lock, 'utf8')).toBe(String(process.pid))
        expect(fs.readFileSync(f.info, 'utf8')).toBe('{}')
    })
    it('does not adopt a stale slot whose published metadata belongs to another live process', () => {
        const f = fixture()
        fs.writeFileSync(f.lock, '1234567')
        fs.writeFileSync(
            f.info,
            JSON.stringify({
                pid: process.pid,
                url: 'http://127.0.0.1:4789',
                startedAt: new Date().toISOString()
            })
        )
        expect(
            f
                .create({
                    probeProcess: (pid) => (pid === 1234567 ? 'dead' : 'alive')
                })
                .acquire()
        ).toBe(false)
        expect(fs.readFileSync(f.lock, 'utf8')).toBe('1234567')
    })
    it('retains changed info and refuses to publish over it', () => {
        const f = fixture(),
            instance = f.create()
        expect(instance.acquire()).toBe(true)
        instance.publish('http://127.0.0.1:4789')
        fs.writeFileSync(f.info, 'foreign-metadata')
        expect(() => instance.publish('http://127.0.0.1:4790')).toThrow(
            'DESKTOP_INSTANCE_OWNERSHIP'
        )
        expect(() => instance.release()).toThrow('DESKTOP_INSTANCE_OWNERSHIP')
        expect(fs.readFileSync(f.info, 'utf8')).toBe('foreign-metadata')
        expect(fs.existsSync(f.lock)).toBe(true)
    })
    it('rechecks lock identity after closing its descriptor before removing metadata', () => {
        const f = fixture(),
            instance = f.create()
        expect(instance.acquire()).toBe(true)
        instance.publish('http://127.0.0.1:4789')
        const before = fs.readFileSync(f.info),
            close = fs.closeSync
        let replaced = false
        vi.spyOn(fs, 'closeSync').mockImplementation((descriptor) => {
            close(descriptor)
            if (!replaced) {
                replaced = true
                fs.renameSync(f.lock, path.join(f.root, 'retained-lock'))
                fs.writeFileSync(f.lock, 'foreign-after-close')
            }
        })
        expect(() => instance.release()).toThrow('DESKTOP_INSTANCE_OWNERSHIP')
        expect(fs.readFileSync(f.lock, 'utf8')).toBe('foreign-after-close')
        expect(fs.readFileSync(f.info)).toEqual(before)
    })
    it('rejects linked metadata without reading its target', () => {
        const f = fixture(),
            target = path.join(f.root, 'target.json')
        fs.writeFileSync(target, 'protected-target')
        fs.linkSync(target, f.info)
        expect(f.create().readInfo()).toBeNull()
        expect(fs.readFileSync(target, 'utf8')).toBe('protected-target')
    })
    it('closes and removes only its fresh claim when existing metadata validation fails', () => {
        const f = fixture(),
            target = path.join(f.root, 'retained-target.json'),
            open = fs.openSync,
            close = fs.closeSync
        fs.writeFileSync(target, 'protected-metadata')
        fs.linkSync(target, f.info)
        const handles = new Map<number, boolean>()
        let descriptor: number | undefined,
            closed = 0,
            staleClose = 0
        vi.spyOn(fs, 'openSync').mockImplementation((file, flags, mode) => {
            const result = open(file, flags, mode),
                fresh = String(file) === f.lock && flags === 'wx'
            handles.set(result, fresh)
            if (fresh) descriptor = result
            return result
        })
        vi.spyOn(fs, 'closeSync').mockImplementation((value) => {
            // The OS can reuse this numeric fd for the subsequent ownership
            // read. Count the exclusive open lifetime, not the reused number.
            if (handles.get(value)) closed++
            else if (value === descriptor && !handles.has(value)) staleClose++
            handles.delete(value)
            return close(value)
        })
        expect(() => f.create().acquire()).toThrow('DESKTOP_INSTANCE_OWNERSHIP')
        expect(descriptor).toBeTypeOf('number')
        expect(closed).toBe(1)
        expect(staleClose).toBe(0)
        expect(fs.existsSync(f.lock)).toBe(false)
        expect(fs.readFileSync(target, 'utf8')).toBe('protected-metadata')
        expect(fs.readFileSync(f.info, 'utf8')).toBe('protected-metadata')
    })
    it('does not remove the live first instance when failed acquisition is followed by shutdown release', () => {
        const f = fixture(),
            first = f.create(),
            second = f.create()
        expect(first.acquire()).toBe(true)
        first.publish('http://127.0.0.1:4789')
        const before = fs.readFileSync(f.info)
        expect(second.acquire()).toBe(false)
        second.release()
        expect(fs.existsSync(f.lock)).toBe(true)
        expect(fs.readFileSync(f.info)).toEqual(before)
    })
    it('retains a changed lock and its info rather than cleaning up foreign content', () => {
        const f = fixture(),
            first = f.create()
        expect(first.acquire()).toBe(true)
        first.publish('http://127.0.0.1:4789')
        const info = fs.readFileSync(f.info)
        fs.writeFileSync(f.lock, '1234567')
        expect(() => first.release()).toThrow()
        expect(fs.readFileSync(f.lock, 'utf8')).toBe('1234567')
        expect(fs.readFileSync(f.info)).toEqual(info)
    })
    it('treats denied liveness probing as unknown, never as proof that a lock can be reclaimed', () => {
        const f = fixture()
        fs.writeFileSync(f.lock, '1234567')
        fs.writeFileSync(f.info, '{}')
        vi.spyOn(process, 'kill').mockImplementation(() => {
            throw Object.assign(Error('synthetic denied probe'), {
                code: 'EPERM'
            })
        })
        expect(f.create().acquire()).toBe(false)
        expect(fs.readFileSync(f.lock, 'utf8')).toBe('1234567')
        expect(fs.readFileSync(f.info, 'utf8')).toBe('{}')
    })
    it('refuses a second owner when a live published instance has lost its lock pathname', () => {
        const f = fixture()
        fs.writeFileSync(
            f.info,
            JSON.stringify({
                pid: process.pid,
                url: 'http://127.0.0.1:4789',
                startedAt: new Date().toISOString()
            })
        )
        expect(f.create().acquire()).toBe(false)
        expect(fs.existsSync(f.lock)).toBe(false)
        expect(JSON.parse(fs.readFileSync(f.info, 'utf8')).pid).toBe(
            process.pid
        )
    })
})
