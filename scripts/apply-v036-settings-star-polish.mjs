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
    const before = `    async verifyGitHubStar(input: unknown) {
        const githubUser = String(input ?? '').trim()
        if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(githubUser))
            throw new Error('请输入有效的 GitHub 用户名')
        const response = await fetch(
            \`https://api.github.com/users/\${encodeURIComponent(githubUser)}/starred/Saber-Alter-Lily/pica-library\`,
            {
                headers: { accept: 'application/vnd.github+json', 'user-agent': 'Pica-Library-Star-Access' },
                signal: AbortSignal.timeout(15_000)
            }
        )
        if (response.status === 204) {
            this.saveStarProof(githubUser)
            return this.status()
        }
        if (response.status === 404) throw new Error('没有检测到该账号对 Pica Library 的 Star')
        if (response.status === 403 || response.status === 429)
            throw new Error('GitHub 暂时限制了验证请求，请稍后重试')
        throw new Error(\`GitHub Star 验证失败（HTTP \${response.status}）\`)
    }`
    const after = `    async verifyGitHubStar(input: unknown) {
        const githubUser = String(input ?? '').trim()
        if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(githubUser))
            throw new Error('请输入有效的 GitHub 用户名')
        const target = githubUser.toLocaleLowerCase('en-US')
        for (let page = 1; page <= 100; page += 1) {
            const response = await fetch(
                \`https://api.github.com/repos/Saber-Alter-Lily/pica-library/stargazers?per_page=100&page=\${page}\`,
                {
                    headers: {
                        accept: 'application/vnd.github+json',
                        'x-github-api-version': '2022-11-28',
                        'user-agent': 'Pica-Library-Star-Access'
                    },
                    signal: AbortSignal.timeout(15_000)
                }
            )
            if (response.status === 403 || response.status === 429)
                throw new Error('GitHub 暂时限制了验证请求，请稍后重试')
            if (!response.ok)
                throw new Error(\`GitHub Star 验证失败（HTTP \${response.status}）\`)
            const users = (await response.json()) as Array<{ login?: unknown }>
            if (!Array.isArray(users))
                throw new Error('GitHub Star 验证返回了异常数据')
            if (
                users.some(
                    (item) =>
                        String(item?.login ?? '').toLocaleLowerCase('en-US') ===
                        target
                )
            ) {
                this.saveStarProof(githubUser)
                return this.status()
            }
            if (users.length < 100) break
        }
        throw new Error('没有检测到该账号对 Pica Library 的 Star')
    }`
    return replaceRequired(source, before, after, 'desktop Star verifier')
})

edit('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/StarAccessStore.java', (source) => {
    let out = source
    out = replaceRequired(
        out,
        'import org.json.JSONObject;',
        'import org.json.JSONArray;\nimport org.json.JSONObject;',
        'Android JSONArray import'
    )
    const before = `            HttpURLConnection connection=null;
            try{
                String encoded=URLEncoder.encode(user,"UTF-8").replace("+","%20");
                URL url=new URL("https://api.github.com/users/"+encoded+"/starred/"+REPOSITORY);
                connection=(HttpURLConnection)url.openConnection();
                connection.setConnectTimeout(12000);connection.setReadTimeout(12000);connection.setRequestMethod("GET");
                connection.setRequestProperty("Accept","application/vnd.github+json");
                connection.setRequestProperty("User-Agent","Pica-Library-Android");
                int code=connection.getResponseCode();
                if(code==204){
                    ok=true;String at=java.time.Instant.now().toString();
                    prefs(app).edit().putString("github_user",user).putString("verified_at",at).apply();
                    message="已验证 GitHub Star，个性化装扮已解锁";
                }else if(code==404){message="没有检测到该账号对 Pica Library 的 Star";}
                else if(code==403||code==429){message="GitHub 暂时限制了验证请求，请稍后重试";}
                else message="GitHub Star 验证失败（HTTP "+code+"）";
            }catch(Exception e){message="无法连接 GitHub 验证 Star："+e.getMessage();}
            finally{if(connection!=null)connection.disconnect();}`
    const after = `            HttpURLConnection connection=null;
            try{
                for(int page=1;page<=100&&!ok;page++){
                    URL url=new URL("https://api.github.com/repos/"+REPOSITORY+"/stargazers?per_page=100&page="+page);
                    connection=(HttpURLConnection)url.openConnection();
                    connection.setConnectTimeout(12000);connection.setReadTimeout(12000);connection.setRequestMethod("GET");
                    connection.setRequestProperty("Accept","application/vnd.github+json");
                    connection.setRequestProperty("X-GitHub-Api-Version","2022-11-28");
                    connection.setRequestProperty("User-Agent","Pica-Library-Android");
                    int code=connection.getResponseCode();
                    if(code==403||code==429){message="GitHub 暂时限制了验证请求，请稍后重试";break;}
                    if(code!=200){message="GitHub Star 验证失败（HTTP "+code+"）";break;}
                    StringBuilder body=new StringBuilder();try(java.io.BufferedReader reader=new java.io.BufferedReader(new java.io.InputStreamReader(connection.getInputStream(),java.nio.charset.StandardCharsets.UTF_8))){String line;while((line=reader.readLine())!=null)body.append(line);}
                    JSONArray users=new JSONArray(body.toString());
                    for(int i=0;i<users.length();i++){JSONObject item=users.optJSONObject(i);if(item!=null&&user.equalsIgnoreCase(item.optString("login",""))){ok=true;break;}}
                    connection.disconnect();connection=null;
                    if(ok){String at=java.time.Instant.now().toString();prefs(app).edit().putString("github_user",user).putString("verified_at",at).apply();message="已验证 GitHub Star，个性化装扮已解锁";break;}
                    if(users.length()<100){message="没有检测到该账号对 Pica Library 的 Star";break;}
                    message="没有检测到该账号对 Pica Library 的 Star";
                }
            }catch(Exception e){message="无法连接 GitHub 验证 Star："+e.getMessage();}
            finally{if(connection!=null)connection.disconnect();}`
    out = replaceRequired(out, before, after, 'Android Star verifier')
    return out
})

edit('package.json', (source) => {
    let out = replaceRequired(source, '"version": "0.3.5"', '"version": "0.3.6"', 'Desktop version')
    out = replaceRequired(
        out,
        'node --check web/alpha8-connections.js',
        'node --check web/alpha8-connections.js && node --check web/alpha8-7-desktop-hub.js',
        'web check'
    )
    return out
})

edit('mobile/android-alpha2/app/build.gradle', (source) =>
    replaceRequired(
        replaceRequired(source, 'versionCode 32', 'versionCode 33', 'Android versionCode'),
        "versionName '0.1.0-alpha8.6.1-theme-hotfix'",
        "versionName '0.1.0-alpha8.7-settings-star-fix'",
        'Android versionName'
    )
)

edit('scripts/build-windows-package.ps1', (source) => {
    let out = replaceRequired(
        source,
        `} elseif ($version -eq '0.3.5') {\n    'Pica-Library-v0.3.5-windows-x64'`,
        `} elseif ($version -eq '0.3.5') {\n    'Pica-Library-v0.3.5-windows-x64'\n} elseif ($version -eq '0.3.6') {\n    'Pica-Library-v0.3.6-windows-x64'`,
        'Windows package name'
    )
    out = replaceRequired(
        out,
        "'0.3.3','0.3.4','0.3.5'))",
        "'0.3.3','0.3.4','0.3.5','0.3.6'))",
        'Windows stable package list'
    )
    out = replaceRequired(
        out,
        `} elseif ($version -eq '0.3.5') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.4-windows-x64.zip'`,
        `} elseif ($version -eq '0.3.5') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.4-windows-x64.zip'\n    } elseif ($version -eq '0.3.6') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.5-windows-x64.zip'`,
        'Windows v0.3.6 base'
    )
    out = replaceRequired(
        out,
        "'0.3.3','0.3.4','0.3.5')) {",
        "'0.3.3','0.3.4','0.3.5','0.3.6')) {",
        'Windows launcher reuse list'
    )
    return out
})

for (const file of ['README.md', 'README.en.md']) {
    edit(file, (source) => {
        let out = source.replaceAll('v0.3.5', 'v0.3.6')
        out = out.replaceAll('v32', 'v33')
        out = out.replaceAll('0.1.0-alpha8.6.1-theme-hotfix', '0.1.0-alpha8.7-settings-star-fix')
        out = out.replaceAll('Alpha8.6.1', 'Alpha8.7')
        return out
    })
}

console.log('v0.3.6 product transforms applied')
