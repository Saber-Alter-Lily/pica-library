import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..', '..')
const reportDir = path.join(root, '_reports', 'v0.3.0-release-prep')
const run = (...args) =>
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trimEnd()

const taskOwned = [
    'scripts/release/generate-pre-release-worktree.mjs',
    '_reports/v0.3.0-release-prep/'
]
const status = run('status', '--short')
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !taskOwned.some((item) => line.includes(item)))
    .join('\n')

const markdown = `# Pica Library v0.3.0 pre-release worktree

- Captured: ${new Date().toISOString()}
- Baseline HEAD: \`${run('rev-parse', 'HEAD')}\`
- Branch before release preparation: \`main\`
- Release branch created without reset/stash/clean: \`release/v0.3.0\`

## git status --short

\`\`\`text
${status}
\`\`\`

## git diff --stat

\`\`\`text
${run('diff', '--stat')}
\`\`\`

## git diff --name-status

\`\`\`text
${run('diff', '--name-status')}
\`\`\`

No pre-existing file was reset, stashed, checked out, cleaned, or deleted.
Historical reports, backups, acceptance copies, and generated artifacts remain
outside the release commit selection.
`

fs.mkdirSync(reportDir, { recursive: true })
fs.writeFileSync(path.join(reportDir, 'PRE_RELEASE_WORKTREE.md'), markdown)
