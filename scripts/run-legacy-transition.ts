import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { checkedLegacyTransitionAuthority, inspectLegacyTransition, type LegacyTransitionAuthority } from '../src/update/legacy-transition-preflight'
import { handoffLegacyTransition } from '../src/update/legacy-transition-coordinator'
import { requireInstalledRuntimeComposition } from '../src/runtime/installed-runtime-composition'
import { sameRuntimeComposition } from '../src/modules/runtime-composition'

declare const __PICA_LEGACY_TRANSITION_AUTHORITY__: LegacyTransitionAuthority | undefined
const context = {
    authority: typeof __PICA_LEGACY_TRANSITION_AUTHORITY__ === 'undefined' ? null : __PICA_LEGACY_TRANSITION_AUTHORITY__,
    toolRoot: path.resolve(import.meta.dirname, '..'), localAppData: process.env.LOCALAPPDATA ?? '', platform: process.platform
}

async function main() {
    const authority = checkedLegacyTransitionAuthority(context)
    const args = process.argv.slice(2)
    let applicationRoot = '', previewOnly = !process.stdin.isTTY || authority.target.channel !== 'stable'
    for (let index = 0; index < args.length; index++) {
        if (args[index] === '--preview') previewOnly = true
        else if (args[index] === '--application-root' && !applicationRoot && args[index + 1] && !args[index + 1].startsWith('--'))
            applicationRoot = args[++index]
        else throw Error('ARGUMENTS_INVALID')
    }
    const terminal = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null
    try {
        if (!applicationRoot && terminal) applicationRoot = (await terminal.question('旧版 Pica Library 程序文件夹（不是资料目录）：')).trim().replace(/^"(.*)"$/, '$1')
        if (!applicationRoot) throw Error('APPLICATION_ROOT_REQUIRED')
        const selection = { applicationRoot, targetZip: path.join(context.toolRoot, 'payload', authority.target.archiveName),
            workRoot: path.join(context.localAppData, 'Pica Library Upgrade Transition', authority.target.sourceSha.slice(0, 16)) }
        const preview = inspectLegacyTransition(selection, context)
        process.stdout.write(JSON.stringify(preview, null, 2) + '\n')
        if (previewOnly || !terminal) {
            process.stdout.write('仅预检，没有执行迁移。未发布包和非交互调用始终只读。\n')
            return
        }
        const pathAccepted = !preview.pathReview.length || (await terminal.question('规范路径与输入不同。已核对上方 resolved 路径？输入 YES：')).trim() === 'YES'
        const current = requireInstalledRuntimeComposition(preview.paths.application)
        const componentConsentNeeded = preview.requiresOptionalRuntimeConsent || !sameRuntimeComposition(current, preview.target.runtimeComposition)
        if (componentConsentNeeded) process.stdout.write('组件选择：' + JSON.stringify({ from: current, to: preview.target.runtimeComposition }) + '\n')
        const componentAccepted = !componentConsentNeeded || (await terminal.question('确认这次可选来源运行时组件选择（不代表启用来源）？输入 YES：')).trim() === 'YES'
        if (!pathAccepted || !componentAccepted) { process.stdout.write('已取消，没有执行迁移。\n'); return }
        const confirmed = (await terminal.question('请先完全退出旧软件。确认保留上述资料并开始一次性迁移？输入 MIGRATE：')).trim() === 'MIGRATE'
        if (!confirmed) { process.stdout.write('已取消，没有执行迁移。\n'); return }
        const result = await handoffLegacyTransition(selection, context, { previewId: preview.previewId, confirmed,
            canonicalPathsAccepted: pathAccepted, runtimeCompositionAccepted: componentAccepted })
        process.stdout.write(JSON.stringify(result) + '\n')
    } finally { terminal?.close() }
}

void main().catch(error => {
    // Never disclose arbitrary parser, filesystem, process output or private configuration.
    const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'LEGACY_TRANSITION_FAILED_RECOVERY_RETAINED'
    process.stderr.write(code + '\n')
    process.exitCode = 1
})
