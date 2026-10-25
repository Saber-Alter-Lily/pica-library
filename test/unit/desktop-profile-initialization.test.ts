import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { afterEach, describe, it, expect } from 'vitest'
import { InstanceLock } from '../../src/desktop/instance'
import { desktopPaths } from '../../src/desktop/paths'
import { initializeOwnedDesktopProfile } from '../../src/desktop/profile-initialization'
const roots: Array<{ root: string; locks: InstanceLock[] }> = []
function fixture() {
    const root = fs.realpathSync(
            fs.mkdtempSync(path.join(os.tmpdir(), 'pica-owned-init-test-'))
        ),
        home = path.join(root, 'home')
    fs.mkdirSync(home)
    const paths = desktopPaths(home),
        locks: InstanceLock[] = []
    roots.push({ root, locks })
    const owner = () => {
        const lock = new InstanceLock(paths.lock, paths.instance)
        locks.push(lock)
        return lock
    }
    return { root, home, paths, owner }
}
afterEach(() => {
    for (const { root, locks } of roots.splice(0)) {
        for (const lock of locks)
            try {
                lock.release()
            } catch {
                /* foreign synthetic ownership retained */
            }
        if (
            fs.realpathSync(root) !== root ||
            path.dirname(root) !== fs.realpathSync(os.tmpdir()) ||
            !path.basename(root).startsWith('pica-owned-init-test-') ||
            fs.lstatSync(root).isSymbolicLink()
        )
            throw Error('Unsafe synthetic initialization cleanup')
        fs.rmSync(root, { recursive: true, force: false })
    }
})
describe('Desktop content initialization belongs to an actual owned instance', () => {
    it('does not create data/packs/theme when no instance lease was acquired', () => {
        const f = fixture()
        expect(() => initializeOwnedDesktopProfile(f.owner(), f.paths)).toThrow(
            'DESKTOP_INSTANCE_OWNERSHIP'
        )
        expect(fs.readdirSync(f.home)).toEqual([])
    })
    it('does not initialize a competing or lost owner, including a missing built-in theme', () => {
        const f = fixture(),
            first = f.owner(),
            second = f.owner()
        expect(first.acquire()).toBe(true)
        expect(second.acquire()).toBe(false)
        expect(() => initializeOwnedDesktopProfile(second, f.paths)).toThrow(
            'DESKTOP_INSTANCE_OWNERSHIP'
        )
        expect(fs.existsSync(f.paths.packs)).toBe(false)
        fs.writeFileSync(first.lockFile, 'synthetic-foreign')
        expect(() => initializeOwnedDesktopProfile(first, f.paths)).toThrow(
            'DESKTOP_INSTANCE_OWNERSHIP'
        )
        expect(fs.existsSync(f.paths.data)).toBe(false)
    })
    it('keeps the original directories/default-theme behavior only after successful acquisition and preserves it on repeat', () => {
        const f = fixture(),
            owner = f.owner()
        expect(owner.acquire()).toBe(true)
        const service = initializeOwnedDesktopProfile(owner, f.paths),
            file = path.join(service.packsRoot, 'pica-violet-star.pica-theme'),
            before = fs.readFileSync(file)
        expect(service.root).toBe(
            path.join(f.paths.runtimeState, 'personalization')
        )
        for (const directory of [
            f.paths.data,
            f.paths.packs,
            f.paths.cache,
            f.paths.logs
        ])
            expect(fs.statSync(directory).isDirectory()).toBe(true)
        initializeOwnedDesktopProfile(owner, f.paths)
        expect(fs.readFileSync(file)).toEqual(before)
        owner.assertHeld()
    })
    it('rejects a different profile or inconsistent paths before creating their content directories', () => {
        const f = fixture(),
            owner = f.owner()
        expect(owner.acquire()).toBe(true)
        const other = desktopPaths(path.join(f.root, 'other'))
        expect(() => initializeOwnedDesktopProfile(owner, other)).toThrow(
            'DESKTOP_INSTANCE_OWNERSHIP'
        )
        expect(fs.existsSync(other.root)).toBe(false)
        expect(() =>
            initializeOwnedDesktopProfile(owner, {
                ...f.paths,
                packs: path.join(f.root, 'wrong-packs')
            })
        ).toThrow('DESKTOP_INSTANCE_OWNERSHIP')
        expect(fs.existsSync(path.join(f.root, 'wrong-packs'))).toBe(false)
    })
    it('checks actual main wiring: no top-level theme constructor; owned initialization follows the failed-acquisition exit branch', () => {
        const source = fs.readFileSync('src/desktop/main.ts', 'utf8'),
            ast = ts.createSourceFile(
                'main.ts',
                source,
                ts.ScriptTarget.Latest,
                true,
                ts.ScriptKind.TS
            )
        for (const statement of ast.statements)
            if (ts.isVariableStatement(statement))
                for (const declaration of statement.declarationList
                    .declarations)
                    expect(
                        declaration.initializer?.getText() ?? ''
                    ).not.toMatch(/^new PersonalizationService\(/)
        const main = ast.statements.find(
            (node): node is ts.FunctionDeclaration =>
                ts.isFunctionDeclaration(node) && node.name?.text === 'main'
        )!
        const statements = [...main.body!.statements],
            guard = statements.findIndex(
                (node) =>
                    ts.isIfStatement(node) &&
                    node.expression.getText() === '!instance.acquire()'
            ),
            initialize = statements.findIndex((node) =>
                node
                    .getText()
                    .startsWith(
                        'personalization = initializeOwnedDesktopProfile('
                    )
            )
        expect(guard).toBe(0)
        expect(initialize).toBeGreaterThan(guard)
        expect(statements[guard].getText()).toContain('throw new Error(')
        expect(
            ast.statements.some(
                (node) =>
                    ts.isForOfStatement(node) &&
                    node.statement.getText().includes('fs.mkdirSync(')
            )
        ).toBe(false)
    })
})
