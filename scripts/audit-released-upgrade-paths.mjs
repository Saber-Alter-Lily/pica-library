import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'
import ts from 'typescript'
import { FIRST_HOP_BASELINE, sha256 } from './lib/old-client-first-hop.mjs'

export const RELEASED_INCREMENTAL_SHA256 =
    'daee49a07795b985820e9bf1cf53050b256026bd2feff3a1d4573348ba896dfa'
const releasedPathSafetySha256 =
    '1f9713af1ea07b62b9613e5a26aba4dbe1f67c5ca24e90872e6676a8256ac9df'
const parse = (name, source) =>
    ts.createSourceFile(
        name,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS
    )
const asyncError = () =>
    Object.assign(
        Error('synthetic asynchronous EACCES; no process was started'),
        { code: 'EACCES' }
    )

/** Inert launch-function observer. Only the fixed archive audit or synthetic unit fixtures call it. */
export async function observeLegacyLaunch(
    source,
    { name, fsAlias, spawnAlias, pathAlias, packaged, argument }
) {
    assert.match(name, /^[A-Za-z_$][\w$]*$/)
    const children = [],
        launches = []
    const sandbox = {
        Error,
        [fsAlias]: { existsSync: () => packaged },
        [spawnAlias]: (command, args, options) => {
            launches.push({
                executable: path.win32.basename(command),
                argumentCount: args.length,
                detached: options.detached,
                windowsHide: options.windowsHide
            })
            const child = new EventEmitter()
            child.unref = () => child
            children.push(child)
            return child
        },
        ...(pathAlias ? { [pathAlias]: path.win32 } : {})
    }
    const context = vm.createContext(sandbox, {
        codeGeneration: { strings: false, wasm: false }
    })
    new vm.Script(source + ';globalThis.launch=' + name).runInContext(context, {
        timeout: 1000
    })
    const returned = context.launch(argument)
    assert.equal(
        children.length,
        1,
        'Expected one inert launch, never a real process'
    )
    const returnedPromise = Boolean(
        returned && typeof returned.then === 'function'
    )
    const outcome = returnedPromise
        ? returned.then(
              () => 'resolved',
              (error) => error?.code ?? 'rejected'
          )
        : null
    const errorListeners = children[0].listenerCount('error')
    let escaped = false
    try {
        children[0].emit('error', asyncError())
    } catch (error) {
        assert.equal(error.code, 'EACCES')
        escaped = true
    }
    return {
        extractedFunctionSha256: sha256(source),
        launches,
        returnedPromise,
        childErrorListenersAfterReturn: errorListeners,
        asynchronousErrorEscapedFunction: escaped,
        promiseOutcomeAfterError: await outcome
    }
}

function globalErrorHooks(ast) {
    const hooks = []
    function visit(node) {
        if (
            ts.isStringLiteralLike(node) &&
            ['uncaughtException', 'uncaughtExceptionMonitor'].includes(
                node.text
            )
        )
            hooks.push(node.text)
        if (
            ts.isIdentifier(node) &&
            node.text === 'setUncaughtExceptionCaptureCallback'
        )
            hooks.push(node.text)
        ts.forEachChild(node, visit)
    }
    visit(ast)
    return hooks
}

function functionSource(ast, name) {
    const matches = ast.statements.filter(
        (node) => ts.isFunctionDeclaration(node) && node.name?.text === name
    )
    assert.equal(matches.length, 1, 'Pinned function identity changed: ' + name)
    return matches[0].getText(ast)
}

/** Executes the exact old controller methods against an in-memory filesystem and inert child only. */
function observeControllerSelection(desktopBytes, helperBytes, updaterBytes) {
    const ast = parse('pinned-desktop.js', desktopBytes.toString('utf8'))
    const classes = []
    function visit(node) {
        if (
            (ts.isClassDeclaration(node) || ts.isClassExpression(node)) &&
            node.members.some(
                (member) =>
                    member.name?.getText(ast) ===
                    'preparePersistentUpgradeAssistant'
            )
        )
            classes.push(node)
        ts.forEachChild(node, visit)
    }
    visit(ast)
    assert.equal(classes.length, 1)
    const selected = ['apply', 'preparePersistentUpgradeAssistant'].map(
        (name) => {
            const matches = classes[0].members.filter(
                (member) => member.name?.getText(ast) === name
            )
            assert.equal(matches.length, 1)
            return { name, source: matches[0].getText(ast) }
        }
    )
    const app = 'X:\\inert-legacy-fixture\\application',
        state = 'X:\\inert-legacy-fixture\\state'
    const helperPath = path.win32.join(app, 'app/full-upgrader.js'),
        updaterPath = path.win32.join(app, 'app/updater.js')
    const runtimePath = path.win32.join(app, 'runtime/node.exe'),
        stagedRoot = 'X:\\inert-legacy-fixture\\staged'
    const candidateMarker = Buffer.from(
        'distinct inert candidate helper; never executable'
    )
    const memory = new Map([
        [helperPath, helperBytes],
        [updaterPath, updaterBytes],
        [runtimePath, Buffer.from('inert runtime, not executable')],
        [path.win32.join(stagedRoot, 'app/full-upgrader.js'), candidateMarker],
        [path.win32.join(stagedRoot, 'app/updater.js'), candidateMarker]
    ])
    const reads = [],
        copies = [],
        launches = [],
        children = []
    const value = (file) => {
        assert.ok(
            memory.has(file),
            'Unexpected synthetic filesystem read: ' + file
        )
        return memory.get(file)
    }
    const filesystem = {
        existsSync: (file) => memory.has(file),
        readFileSync: (file, encoding) => {
            reads.push(file)
            const bytes = value(file)
            return encoding ? bytes.toString(encoding) : bytes
        },
        mkdirSync: () => {},
        rmSync: (file) => {
            for (const key of memory.keys())
                if (key === file || key.startsWith(file + '\\'))
                    memory.delete(key)
        },
        copyFileSync: (from, to) => {
            copies.push({ from, to })
            memory.set(to, Buffer.from(value(from)))
        },
        renameSync: (from, to) => {
            memory.set(to, value(from))
            memory.delete(from)
        },
        writeFileSync: (file, bytes) => memory.set(file, Buffer.from(bytes))
    }
    const context = vm.createContext(
        {
            l: filesystem,
            p: path.win32,
            Z: sha256,
            we: () => 'windows-x64',
            te: () => ({}),
            process: { pid: 12345 },
            Error,
            Re: (command, args) => {
                const helper = value(args[0])
                launches.push({
                    executable: path.win32.basename(command),
                    helperSha256: sha256(helper),
                    usesCandidateHelper: helper.equals(candidateMarker)
                })
                const child = new EventEmitter()
                child.unref = () => child
                children.push(child)
                return child
            }
        },
        { codeGeneration: { strings: false, wasm: false } }
    )
    new vm.Script(
        'class ReleasedController{' +
            selected.map((method) => method.source).join('\n') +
            '};globalThis.Controller=ReleasedController;'
    ).runInContext(context, { timeout: 1000 })
    const controller = new context.Controller()
    Object.assign(controller, {
        options: {
            applicationRoot: app,
            stateRoot: state,
            runtimePath,
            currentVersion: '0.5.0',
            currentSourceSha: FIRST_HOP_BASELINE.sourceSha,
            instanceFile: state + '\\instance.json',
            launcherPath: app + '\\Pica Library.exe',
            desktopEntryPath: app + '\\app\\desktop.js'
        },
        progressFile: state + '\\progress.json',
        updateTarget: () => ({ platform: 'windows', arch: 'x64' }),
        persistentAssistantRoot: () => state + '\\upgrade-assistant',
        writeProgress: () => {},
        stagedFull: {
            id: 'full',
            directory: stagedRoot,
            targetVersion: '0.5.1',
            targetSourceSha: '2'.repeat(40)
        }
    })
    const full = controller.apply('full', {
        desktopHomeRoot: 'X:\\inert-legacy-fixture\\profile',
        libraryDirectory: 'X:\\inert-legacy-fixture\\profile\\data'
    })
    assert.equal(full.accepted, true)
    assert.equal(launches[0].helperSha256, FIRST_HOP_BASELINE.helperSha256)
    assert.equal(launches[0].usesCandidateHelper, false)
    assert.ok(copies.some((copy) => copy.from === helperPath))
    controller.stagedFull = null
    controller.staged = {
        id: 'delta',
        directory: stagedRoot,
        manifest: { targetVersion: '0.5.1', requiresFullInstall: false }
    }
    const delta = controller.apply('delta')
    assert.equal(delta.accepted, true)
    assert.equal(launches[1].helperSha256, RELEASED_INCREMENTAL_SHA256)
    assert.equal(launches[1].usesCandidateHelper, false)
    assert.ok(!reads.some((file) => file.startsWith(stagedRoot + '\\')))
    const handoffs = children.map((child) => {
        const listeners = child.listenerCount('error')
        let escaped = false
        try {
            child.emit('error', asyncError())
        } catch (error) {
            assert.equal(error.code, 'EACCES')
            escaped = true
        }
        return {
            returnedAcceptedBeforeStartup: true,
            childErrorListeners: listeners,
            asynchronousErrorEscapedExtractedMethod: escaped,
            actualDesktopGlobalHandlerEffect: 'NOT_EVALUATED'
        }
    })
    return {
        extractedMethods: selected.map((method) => ({
            name: method.name,
            sha256: sha256(method.source)
        })),
        usesInstalledOrRegisteredOldHelper: true,
        stagedCandidateHelperWasNotRead: true,
        launches,
        handoffs,
        filesystem: 'IN_MEMORY_ONLY',
        runtimeBytes: 'SYNTHETIC_NOT_EXECUTABLE'
    }
}

export async function auditReleasedUpgradePaths(file) {
    const zipBytes = fs.readFileSync(file)
    assert.equal(
        sha256(zipBytes),
        FIRST_HOP_BASELINE.zipSha256,
        'Reject any different release archive'
    )
    const zip = new AdmZip(zipBytes)
    const desktop = zip.readFile('app/desktop.js'),
        full = zip.readFile('app/full-upgrader.js'),
        delta = zip.readFile('app/updater.js')
    assert.equal(
        zip.readAsText('SOURCE_SHA.txt').trim(),
        FIRST_HOP_BASELINE.sourceSha
    )
    assert.equal(sha256(desktop), FIRST_HOP_BASELINE.desktopSha256)
    assert.equal(sha256(full), FIRST_HOP_BASELINE.helperSha256)
    assert.equal(sha256(delta), RELEASED_INCREMENTAL_SHA256)
    const pathSafetyBytes = zip.readFile('app/path-safety-ZJYXxRQU.js')
    assert.equal(sha256(pathSafetyBytes), releasedPathSafetySha256)
    const pathSafetyAst = parse(
        'pinned-path-safety.js',
        pathSafetyBytes.toString('utf8')
    )
    const pathImports = pathSafetyAst.statements
        .filter(ts.isImportDeclaration)
        .map((node) => node.moduleSpecifier.text)
    assert.deepEqual(pathImports, ['node:path'])
    assert.deepEqual(globalErrorHooks(pathSafetyAst), [])
    const bindings = pathSafetyAst.statements
        .filter(ts.isVariableStatement)
        .map((node) => node.getText(pathSafetyAst))
        .join('\n')
    const pathContext = vm.createContext(
        {},
        { codeGeneration: { strings: false, wasm: false } }
    )
    new vm.Script(
        bindings +
            functionSource(pathSafetyAst, 'i') +
            functionSource(pathSafetyAst, 'h') +
            ';globalThis.blocked=h;'
    ).runInContext(pathContext, { timeout: 1000 })
    const legacyPathGuard = {
        canonicalBlocked: pathContext.blocked(['app/updater.js']),
        caseVariantBlocked: pathContext.blocked(['app/UPDATER.js']),
        caseVariantIsSupportedTransition: false,
        warning:
            'Never use a case-variant/self-replacement bypass as a compatibility bridge. The executing old helper remains old code, and current guards must not be weakened.'
    }
    assert.equal(legacyPathGuard.canonicalBlocked, true)
    assert.equal(legacyPathGuard.caseVariantBlocked, false)
    const fullAst = parse('pinned-full-upgrader.js', full.toString('utf8')),
        deltaAst = parse('pinned-updater.js', delta.toString('utf8'))
    const observations = []
    for (const packaged of [true, false])
        observations.push({
            path: packaged
                ? 'incremental-packaged-launcher'
                : 'incremental-node-fallback',
            ...(await observeLegacyLaunch(functionSource(deltaAst, 'l'), {
                name: 'l',
                fsAlias: 'i',
                spawnAlias: 'f',
                packaged,
                argument: {
                    launcherPath: 'X:\\inert\\Pica Library.exe',
                    runtimePath: 'X:\\inert\\node.exe',
                    desktopEntryPath: 'X:\\inert\\desktop.js'
                }
            }))
        })
    observations.push({
        path: 'full-application-launcher',
        ...(await observeLegacyLaunch(functionSource(fullAst, 'w'), {
            name: 'w',
            fsAlias: 't',
            spawnAlias: 'y',
            pathAlias: 'i',
            packaged: true,
            argument: 'X:\\inert'
        }))
    })
    for (const observation of observations) {
        assert.equal(observation.returnedPromise, false)
        assert.equal(observation.childErrorListenersAfterReturn, 0)
        assert.equal(observation.asynchronousErrorEscapedFunction, true)
    }
    const hooks = {
        incremental: globalErrorHooks(deltaAst),
        full: globalErrorHooks(fullAst)
    }
    assert.deepEqual(hooks, { incremental: [], full: [] })
    return {
        status: 'VERIFIED_LEGACY_BOTH_PATH_COUNTEREXAMPLES_NOT_UPGRADE_PASS',
        baseline: {
            ...FIRST_HOP_BASELINE,
            incrementalHelperSha256: RELEASED_INCREMENTAL_SHA256
        },
        launchObservations: observations,
        helperGlobalErrorHooks: hooks,
        incrementalDependency: {
            entry: 'app/path-safety-ZJYXxRQU.js',
            sha256: releasedPathSafetySha256,
            imports: pathImports,
            globalErrorHooks: []
        },
        legacyPathGuard,
        controllerSelection: observeControllerSelection(desktop, full, delta),
        legacyFirstHopAccepted: false,
        actualInstalledRecoveryExecuted: false,
        realSpawnFileMutationNetworkApplicationOrJava: false,
        conclusion:
            'An incremental bridge is not established as a safe escape from the released full-helper launch defect. Both first-hop paths execute old helpers; staged new helper files do not repair that already-running first hop. New-source tests cannot substitute for the exact old-controller gates. This audit is bounded to the pinned release and asynchronous launch failure, not every historical client or all failure classes.'
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
    const [file, ...extra] = process.argv.slice(2)
    if (!file || extra.length)
        throw Error(
            'Usage: node scripts/audit-released-upgrade-paths.mjs <pinned-v0.5.0-zip>'
        )
    console.log(JSON.stringify(await auditReleasedUpgradePaths(file), null, 2))
}
