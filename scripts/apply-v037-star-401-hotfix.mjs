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
    const start = source.indexOf('    async verifyGitHubStar(input: unknown) {')
    const end = source.indexOf('\n    private hasThemeAccess()', start)
    if (start < 0 || end < 0) throw new Error('Desktop Star verifier anchors not found')
    const replacement = `    async verifyGitHubStar(input: unknown) {
        const githubUser = String(input ?? '').trim()
        if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(githubUser))
            throw new Error('请输入有效的 GitHub 用户名')

        const requestHeaders = {
            accept: 'application/vnd.github+json',
            'x-github-api-version': '2022-11-28',
            'user-agent': 'Pica-Library-Star-Access'
        }
        const targetUser = githubUser.toLocaleLowerCase('en-US')
        const targetRepository = 'saber-alter-lily/pica-library'
        let primaryStatus = 200

        // Primary public route: repository -> stargazers.
        for (let page = 1; page <= 100; page += 1) {
            const response = await fetch(
                \`https://api.github.com/repos/Saber-Alter-Lily/pica-library/stargazers?per_page=100&page=\${page}\`,
                {
                    headers: requestHeaders,
                    signal: AbortSignal.timeout(15_000)
                }
            )
            if (!response.ok) {
                primaryStatus = response.status
                break
            }
            const users = (await response.json()) as Array<{ login?: unknown }>
            if (!Array.isArray(users))
                throw new Error('GitHub Star 验证返回了异常数据')
            if (
                users.some(
                    (item) =>
                        String(item?.login ?? '').toLocaleLowerCase('en-US') ===
                        targetUser
                )
            ) {
                this.saveStarProof(githubUser)
                return this.status()
            }
            if (users.length < 100) break
        }

        // Secondary public route: named user -> starred repositories. This is
        // deliberately independent of the repository-stargazer endpoint so a
        // proxy/API 401 on one route cannot incorrectly deny a real Star.
        let secondaryStatus = 200
        for (let page = 1; page <= 100; page += 1) {
            const response = await fetch(
                \`https://api.github.com/users/\${encodeURIComponent(githubUser)}/starred?per_page=100&page=\${page}\`,
                {
                    headers: requestHeaders,
                    signal: AbortSignal.timeout(15_000)
                }
            )
            if (!response.ok) {
                secondaryStatus = response.status
                break
            }
            const repositories = (await response.json()) as Array<{
                full_name?: unknown
            }>
            if (!Array.isArray(repositories))
                throw new Error('GitHub Star 验证返回了异常数据')
            if (
                repositories.some(
                    (item) =>
                        String(item?.full_name ?? '').toLocaleLowerCase('en-US') ===
                        targetRepository
                )
            ) {
                this.saveStarProof(githubUser)
                return this.status()
            }
            if (repositories.length < 100) break
        }

        if ([403, 429].includes(primaryStatus) || [403, 429].includes(secondaryStatus))
            throw new Error('GitHub 暂时限制了验证请求，请稍后重试')
        if (primaryStatus === 401 && secondaryStatus === 401)
            throw new Error('GitHub 公开 Star 验证连续返回 HTTP 401，已尝试代理与直连回退；请检查网络或代理')
        if (secondaryStatus === 404)
            throw new Error('没有找到该 GitHub 用户')
        if (primaryStatus !== 200 && secondaryStatus !== 200)
            throw new Error(\`GitHub Star 验证失败（HTTP \${primaryStatus} / \${secondaryStatus}）\`)
        throw new Error('没有检测到该账号对 Pica Library 的 Star')
    }
`
    return source.slice(0, start) + replacement + source.slice(end)
})

edit('package.json', (source) =>
    replaceRequired(source, '"version": "0.3.6"', '"version": "0.3.7"', 'Desktop version')
)

edit('mobile/android-alpha2/app/build.gradle', (source) => {
    let out = replaceRequired(source, 'versionCode 33', 'versionCode 34', 'Android versionCode')
    out = replaceRequired(
        out,
        "versionName '0.1.0-alpha8.7-settings-star-fix'",
        "versionName '0.1.0-alpha8.7.1-star-401-hotfix'",
        'Android versionName'
    )
    return out
})

edit('scripts/build-windows-package.ps1', (source) => {
    let out = replaceRequired(
        source,
        `} elseif ($version -eq '0.3.6') {\n    'Pica-Library-v0.3.6-windows-x64'\n} elseif ($version -eq '0.2.0-dev.0') {`,
        `} elseif ($version -eq '0.3.6') {\n    'Pica-Library-v0.3.6-windows-x64'\n} elseif ($version -eq '0.3.7') {\n    'Pica-Library-v0.3.7-windows-x64'\n} elseif ($version -eq '0.2.0-dev.0') {`,
        'Windows package name'
    )
    out = out.replaceAll("'0.3.4','0.3.5','0.3.6'))", "'0.3.4','0.3.5','0.3.6','0.3.7'))")
    out = replaceRequired(
        out,
        `} elseif ($version -eq '0.3.6') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.5-windows-x64.zip'\n    }`,
        `} elseif ($version -eq '0.3.6') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.5-windows-x64.zip'\n    } elseif ($version -eq '0.3.7') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.6-windows-x64.zip'\n    }`,
        'Windows v0.3.7 base'
    )
    out = out.replaceAll("'0.3.4','0.3.5','0.3.6')) {", "'0.3.4','0.3.5','0.3.6','0.3.7')) {")
    return out
})

edit('README.md', (source) => {
    let out = source.replace('- **Windows / Desktop：v0.3.6**', '- **Windows / Desktop：v0.3.7**')
    out = out.replace(
        '- **Android Preview：v33 · 0.1.0-alpha8.7-settings-star-fix**',
        '- **Android Preview：v34 · 0.1.0-alpha8.7.1-star-401-hotfix**'
    )
    out = out.replace('- **当前公开源码：Alpha8.7**', '- **当前公开源码：Alpha8.7.1**')
    const marker = '## Alpha8.7\n'
    const note = `## Alpha8.7.1 Hotfix\n\n- **修复 Star HTTP 401**：Desktop 对公开 GitHub GET 在应用代理返回 401/403/407/429 时自动尝试一次原生直连；Star 验证同时使用“仓库 stargazers”和“用户 starred repositories”两条独立公开路径。\n- **Android 同步双路径验证**：手机端同样增加用户 Star 列表回退，不再把单一 GitHub 接口异常误判为未 Star。\n- **发布验收修正**：Star 发布门禁必须包含完全不带 Authorization 的匿名 GitHub API 验证，避免 CI token 掩盖真实客户端问题。\n\n`
    if (!out.includes(marker)) throw new Error('README Alpha8.7 marker missing')
    out = out.replace(marker, note + marker)
    return out
})

edit('README.en.md', (source) => {
    let out = source.replace('- **Windows / Desktop:** v0.3.4', '- **Windows / Desktop:** v0.3.7')
    out = out.replace('- **Android Preview:** v31 · 0.1.0-alpha8.6-star-personalization', '- **Android Preview:** v34 · 0.1.0-alpha8.7.1-star-401-hotfix')
    out = out.replace('- **Public source:** Alpha8.6', '- **Public source:** Alpha8.7.1')
    return out
})

console.log('v0.3.7 Star 401 hotfix transforms applied')
