import fs from 'node:fs'

function edit(file, transform) {
    const before = fs.readFileSync(file, 'utf8')
    const after = transform(before)
    if (after === before) throw new Error(`${file}: transform made no change`)
    fs.writeFileSync(file, after, 'utf8')
}

function replaceRequired(source, before, after, label) {
    if (!source.includes(before)) throw new Error(`${label}: anchor not found`)
    return source.replace(before, after)
}

edit('src/services/personalization-service.ts', (source) => {
    let out = replaceRequired(
        source,
        "        this.starProofFile = path.join(root, 'github-star-proof-v1.json')",
        "        this.starProofFile = path.join(root, 'github-star-proof-v2.json')",
        'Desktop authenticated proof filename'
    )
    const start = out.indexOf('    starProof() {')
    const end = out.indexOf('\n    private hasThemeAccess()', start)
    if (start < 0 || end < 0) throw new Error('Personalization Star proof/verifier anchors not found')
    const replacement = `    starProof() {
        try {
            const value = JSON.parse(fs.readFileSync(this.starProofFile, 'utf8')) as {
                schema?: unknown
                githubUser?: unknown
                githubUserId?: unknown
                verifiedAt?: unknown
                authMethod?: unknown
            }
            const githubUser = String(value.githubUser ?? '').trim()
            const githubUserId = Number(value.githubUserId ?? 0)
            const verifiedAt = String(value.verifiedAt ?? '').trim()
            const authMethod = String(value.authMethod ?? '').trim()
            if (Number(value.schema) !== 2) return null
            if (authMethod !== 'github-account-device-flow') return null
            if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(githubUser)) return null
            if (!Number.isSafeInteger(githubUserId) || githubUserId <= 0) return null
            if (!verifiedAt || !Date.parse(verifiedAt)) return null
            return {
                schema: 2 as const,
                unlocked: true,
                githubUser,
                githubUserId,
                verifiedAt,
                authMethod: 'github-account-device-flow' as const
            }
        } catch {
            return null
        }
    }

    installAuthenticatedStarProof(input: { githubUser: string; githubUserId: number }) {
        const githubUser = String(input?.githubUser ?? '').trim()
        const githubUserId = Number(input?.githubUserId ?? 0)
        if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(githubUser))
            throw new Error('GitHub 账号用户名无效')
        if (!Number.isSafeInteger(githubUserId) || githubUserId <= 0)
            throw new Error('GitHub 账号 ID 无效')
        fs.mkdirSync(this.root, { recursive: true })
        const proof = {
            schema: 2,
            unlocked: true,
            githubUser,
            githubUserId,
            verifiedAt: new Date().toISOString(),
            authMethod: 'github-account-device-flow'
        }
        const temporary = \`${'${this.starProofFile}'}\.${'${process.pid}'}.tmp\`
        fs.writeFileSync(temporary, JSON.stringify(proof, null, 2), {
            encoding: 'utf8',
            mode: 0o600
        })
        fs.renameSync(temporary, this.starProofFile)
        return this.status()
    }

    async verifyGitHubStar() {
        throw new Error('公开用户名 Star 验证已停用，请使用 GitHub 账号认证')
    }
`
    out = out.slice(0, start) + replacement + out.slice(end)
    out = out.replace(
        "            supporterId: proof ? `github:${proof.githubUser}` : null,\n            starUnlocked: unlocked,\n            starUser: proof?.githubUser ?? null,\n            starVerifiedAt: proof?.verifiedAt ?? null,",
        "            supporterId: proof ? `github-id:${proof.githubUserId}` : null,\n            starUnlocked: unlocked,\n            starUser: proof?.githubUser ?? null,\n            starUserId: proof?.githubUserId ?? null,\n            starVerifiedAt: proof?.verifiedAt ?? null,\n            starAuthMethod: proof?.authMethod ?? null,"
    )
    out = out.replace(
        "if (!proof) throw new Error('给 Pica Library 项目 Star 后即可解锁个性化装扮')",
        "if (!proof) throw new Error('请先使用 GitHub 账号认证并验证 Star')"
    )
    return out
})

edit('src/desktop/main.ts', (source) => {
    let out = replaceRequired(
        source,
        "import { PersonalizationService } from '../services/personalization-service'",
        "import { PersonalizationService } from '../services/personalization-service'\nimport { GitHubAccountAuthService } from '../services/github-account-auth'",
        'Desktop GitHub auth import'
    )
    out = replaceRequired(
        out,
        "const personalization = new PersonalizationService(\n    path.join(paths.runtimeState, 'personalization'),\n    path.join(applicationRoot, 'web')\n)",
        "const personalization = new PersonalizationService(\n    path.join(paths.runtimeState, 'personalization'),\n    path.join(applicationRoot, 'web')\n)\nconst githubAccountAuth = new GitHubAccountAuthService()",
        'Desktop GitHub auth service instance'
    )
    out = replaceRequired(
        out,
        "            if (personalizationAction === 'verify-star') {\n                return { success: true, personalization: await personalization.verifyGitHubStar(input.githubUser) }\n            }\n",
        "            if (personalizationAction === 'verify-star')\n                throw new Error('公开用户名 Star 验证已停用，请使用 GitHub 账号认证')\n            if (personalizationAction === 'github-auth-start') {\n                return { success: true, githubAuth: await githubAccountAuth.start() }\n            }\n            if (personalizationAction === 'github-auth-poll') {\n                const githubAuth = await githubAccountAuth.poll(input.flowId)\n                if (githubAuth.state === 'complete') {\n                    const personalizationStatus = personalization.installAuthenticatedStarProof(githubAuth.identity)\n                    return {\n                        success: true,\n                        githubAuth: { state: 'complete' },\n                        personalization: personalizationStatus\n                    }\n                }\n                return { success: true, githubAuth }\n            }\n",
        'Desktop GitHub auth settings actions'
    )
    return out
})

edit('package.json', (source) => {
    let out = replaceRequired(source, '"version": "0.3.7"', '"version": "0.3.8"', 'Desktop v0.3.8')
    out = replaceRequired(
        out,
        'node --check web/alpha8-connections.js && node --check web/alpha8-7-desktop-hub.js',
        'node --check web/alpha8-connections.js && node --check web/alpha8-7-desktop-hub.js && node --check web/alpha8-disclaimer.js && node --check web/alpha8-star-access.js',
        'web check disclaimer/auth scripts'
    )
    return out
})

edit('mobile/android-alpha2/app/build.gradle', (source) => {
    let out = replaceRequired(source, 'versionCode 34', 'versionCode 35', 'Android versionCode 35')
    out = replaceRequired(
        out,
        "versionName '0.1.0-alpha8.7.1-star-401-hotfix'",
        "versionName '0.1.0-alpha8.8-account-auth-theme-decouple'",
        'Android Alpha8.8 versionName'
    )
    return out
})

edit('scripts/build-windows-package.ps1', (source) => {
    let out = replaceRequired(
        source,
        `} elseif ($version -eq '0.3.7') {\n    'Pica-Library-v0.3.7-windows-x64'\n} elseif ($version -eq '0.2.0-dev.0') {`,
        `} elseif ($version -eq '0.3.7') {\n    'Pica-Library-v0.3.7-windows-x64'\n} elseif ($version -eq '0.3.8') {\n    'Pica-Library-v0.3.8-windows-x64'\n} elseif ($version -eq '0.2.0-dev.0') {`,
        'Windows v0.3.8 package name'
    )
    out = out.replaceAll("'0.3.5','0.3.6','0.3.7'))", "'0.3.5','0.3.6','0.3.7','0.3.8'))")
    out = replaceRequired(
        out,
        `} elseif ($version -eq '0.3.7') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.6-windows-x64.zip'\n    }`,
        `} elseif ($version -eq '0.3.7') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.6-windows-x64.zip'\n    } elseif ($version -eq '0.3.8') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.7-windows-x64.zip'\n    }`,
        'Windows v0.3.8 accepted base'
    )
    out = out.replaceAll("'0.3.5','0.3.6','0.3.7')) {", "'0.3.5','0.3.6','0.3.7','0.3.8')) {")
    out = replaceRequired(
        out,
        "foreach ($notice in @('NOTICE.md','UPSTREAM.md')) { Copy-Item -LiteralPath (Join-Path $root $notice) -Destination $stage }",
        "foreach ($notice in @('NOTICE.md','UPSTREAM.md','DISCLAIMER.md')) { Copy-Item -LiteralPath (Join-Path $root $notice) -Destination $stage }",
        'package DISCLAIMER.md'
    )
    return out
})

console.log('Alpha8.8 account auth, theme decoupling, disclaimer integration transformed')
