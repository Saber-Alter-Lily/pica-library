import fs from 'node:fs'

function edit(file, fn) {
    const before = fs.readFileSync(file, 'utf8')
    const after = fn(before)
    if (after === before) return
    fs.writeFileSync(file, after, 'utf8')
}
function replaceRequired(source, before, after, label) {
    if (source.includes(after)) return source
    const count = source.split(before).length - 1
    if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`)
    return source.replace(before, after)
}
function replaceRegexRequired(source, pattern, replacement, label) {
    if (typeof replacement === 'string' && source.includes(replacement)) return source
    const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))]
    if (matches.length !== 1) throw new Error(`${label}: expected one regex anchor, found ${matches.length}`)
    return source.replace(pattern, replacement)
}

edit('package.json', (s) => s.replace('"version": "0.3.3"', '"version": "0.3.4"'))
edit('mobile/android-alpha2/app/build.gradle', (s) => s
    .replace('versionCode 30', 'versionCode 31')
    .replace("versionName '0.1.0-alpha8.5-theme-studio'", "versionName '0.1.0-alpha8.6-star-personalization'"))

edit('src/services/personalization-service.ts', (input) => {
    let s = input
    s = replaceRegexRequired(s,
        /function safeReferenceName\(value: unknown, index: number, extension: string\) \{[\s\S]*?\n\}/,
        `function safeReferenceName(value: unknown, index: number, extension: string) {
    const stem = String(value ?? '')
        .replace(/\\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)
    return \`${'${String(index + 1).padStart(2, \'0\')}-${stem || \'reference\'}.${extension}'}\`
}`,
        'safeReferenceName')
    s = replaceRequired(s,
        `    readonly entitlementFile: string\n    readonly activeThemeFile: string`,
        `    readonly entitlementFile: string\n    readonly activeThemeFile: string\n    readonly starProofFile: string`,
        'star proof property')
    s = replaceRequired(s,
        `        this.entitlementFile = path.join(root, 'supporter-entitlement-v1.json')\n        this.activeThemeFile = path.join(root, 'active-theme-v1.json')`,
        `        this.entitlementFile = path.join(root, 'supporter-entitlement-v1.json')\n        this.activeThemeFile = path.join(root, 'active-theme-v1.json')\n        this.starProofFile = path.join(root, 'github-star-proof-v1.json')`,
        'star proof path')
    s = replaceRequired(s,
        `    installBundledTesterGrant() {\n        if (this.grant()) return this.status()\n        return this.installEntitlement(TESTER_ENTITLEMENT)\n    }`,
        `    installBundledTesterGrant() {\n        if (this.grant()) return this.status()\n        return this.installEntitlement(TESTER_ENTITLEMENT)\n    }\n\n    starProof() {\n        try {\n            const value = JSON.parse(fs.readFileSync(this.starProofFile, 'utf8')) as {\n                githubUser?: unknown\n                verifiedAt?: unknown\n            }\n            const githubUser = String(value.githubUser ?? '').trim()\n            const verifiedAt = String(value.verifiedAt ?? '').trim()\n            if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(githubUser)) return null\n            if (!verifiedAt || !Date.parse(verifiedAt)) return null\n            return { unlocked: true, githubUser, verifiedAt }\n        } catch {\n            return null\n        }\n    }\n\n    private saveStarProof(githubUser: string) {\n        fs.mkdirSync(this.root, { recursive: true })\n        const proof = { unlocked: true, githubUser, verifiedAt: new Date().toISOString() }\n        const temporary = \`${'${this.starProofFile}.${process.pid}.tmp'}\`\n        fs.writeFileSync(temporary, JSON.stringify(proof, null, 2), { encoding: 'utf8', mode: 0o600 })\n        fs.renameSync(temporary, this.starProofFile)\n        return proof\n    }\n\n    async verifyGitHubStar(input: unknown) {\n        const githubUser = String(input ?? '').trim()\n        if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(githubUser))\n            throw new Error('请输入有效的 GitHub 用户名')\n        const response = await fetch(\n            \`https://api.github.com/users/${'${encodeURIComponent(githubUser)}'}/starred/Saber-Alter-Lily/pica-library\`,\n            {\n                headers: { accept: 'application/vnd.github+json', 'user-agent': 'Pica-Library-Star-Access' },\n                signal: AbortSignal.timeout(15_000)\n            }\n        )\n        if (response.status === 204) {\n            this.saveStarProof(githubUser)\n            return this.status()\n        }\n        if (response.status === 404) throw new Error('没有检测到该账号对 Pica Library 的 Star')\n        if (response.status === 403 || response.status === 429)\n            throw new Error('GitHub 暂时限制了验证请求，请稍后重试')\n        throw new Error(\`GitHub Star 验证失败（HTTP ${'${response.status}'}）\`)\n    }\n\n    private hasThemeAccess() {\n        return Boolean(this.starProof())\n    }`,
        'star methods')
    s = s.replace(`if (!this.grant()?.features.includes('theme-packs')) return null`, `if (!this.hasThemeAccess()) return null`)
    s = replaceRegexRequired(s,
        /    status\(\) \{\n[\s\S]*?\n    \}\n\n    installEntitlement/,
        `    status() {\n        const proof = this.starProof()\n        const unlocked = Boolean(proof)\n        return {\n            supporter: unlocked,\n            features: unlocked ? ['theme-packs'] : [],\n            supporterId: proof ? \`github:${'${proof.githubUser}'}\` : null,\n            starUnlocked: unlocked,\n            starUser: proof?.githubUser ?? null,\n            starVerifiedAt: proof?.verifiedAt ?? null,\n            activeThemeId: unlocked ? this.activeThemeId() : null\n        }\n    }\n\n    installEntitlement`,
        'status')
    s = replaceRegexRequired(s,
        /    private requireThemeAccess\(\) \{[\s\S]*?\n    \}\n\n    importThemePack/,
        `    private requireThemeAccess() {\n        const proof = this.starProof()\n        if (!proof) throw new Error('给 Pica Library 项目 Star 后即可解锁个性化装扮')\n        return proof\n    }\n\n    importThemePack`,
        'requireThemeAccess')
    s = s.replace(`if (!this.grant()?.features.includes('theme-packs')) return []`, `if (!this.hasThemeAccess()) return []`)
    const start = s.indexOf('    private ensureBuiltinPack() {')
    const classEnd = s.lastIndexOf('\n}')
    if (start < 0 || classEnd < start) throw new Error('ensureBuiltinPack anchor missing')
    const method = `    private ensureBuiltinPack() {\n        const legacy = path.join(this.packsRoot, 'pica-violet.pica-theme')\n        const file = path.join(this.packsRoot, 'pica-violet-star.pica-theme')\n        if (fs.existsSync(file)) return\n        if (this.creatorResourcesRoot) {\n            const bundled = path.join(this.creatorResourcesRoot, 'pica-violet-default.pica-theme')\n            if (fs.existsSync(bundled)) {\n                fs.copyFileSync(bundled, file)\n                try { fs.unlinkSync(legacy) } catch {}\n                return\n            }\n        }\n        const zip = new AdmZip()\n        zip.addFile('manifest.json', Buffer.from(JSON.stringify({ themeFormatVersion: 1, id: 'pica-violet-star', name: 'Pica Violet · 星漫', author: 'Pica Library', version: '1.0.0', description: '官方 Star 首发装扮。' }, null, 2)))\n        zip.addFile('palette.json', Buffer.from(JSON.stringify(DEFAULT_PALETTE, null, 2)))\n        zip.addFile('layout.json', Buffer.from(JSON.stringify(DEFAULT_LAYOUT, null, 2)))\n        zip.addFile('components.json', Buffer.from(JSON.stringify(DEFAULT_COMPONENTS, null, 2)))\n        fs.writeFileSync(file, zip.toBuffer(), { mode: 0o600 })\n        try { fs.unlinkSync(legacy) } catch {}\n    }\n`
    s = s.slice(0, start) + method + s.slice(classEnd)
    return s
})

edit('src/desktop/main.ts', (s) => replaceRequired(s,
    `            const personalizationAction = String(input.personalizationAction ?? '')\n            if (personalizationAction === 'import-theme') {`,
    `            const personalizationAction = String(input.personalizationAction ?? '')\n            if (personalizationAction === 'verify-star') {\n                return { success: true, personalization: await personalization.verifyGitHubStar(input.githubUser) }\n            }\n            if (personalizationAction === 'import-theme') {`,
    'desktop verify-star action'))

edit('src/mobile/bridge-server.ts', (s) => replaceRequired(s,
    `            if (\n                url.pathname === '/mobile/v1/supporter/entitlement' &&\n                request.method === 'GET'\n            ) {`,
    `            if (url.pathname === '/mobile/v1/star-access' && request.method === 'GET') {\n                const proof = personalization.starProof()\n                return json(response, 200, proof ?? { unlocked: false, githubUser: '', verifiedAt: '' })\n            }\n\n            if (\n                url.pathname === '/mobile/v1/supporter/entitlement' &&\n                request.method === 'GET'\n            ) {`,
    'mobile star endpoint'))

edit('web/index.html', (s) => {
    s = s.replace(`<link rel="icon" type="image/svg+xml" href="./pica-library-icon.svg" />`, `<link rel="icon" type="image/png" sizes="512x512" href="./pica-library-icon-512.png" />`)
    s = s.replaceAll(`src="./pica-library-icon.svg"`, `src="./pica-library-icon-192.png"`)
    s = s.replace(`        <link rel="stylesheet" href="./styles.css" />`, `        <link rel="stylesheet" href="./styles.css" />\n        <link rel="stylesheet" href="./alpha8-6.css" />`)
    s = replaceRequired(s,
        `        <script type="module" src="./alpha8-connections.js"></script>`,
        `        <script type="module" src="./alpha8-connections.js"></script>\n        <script type="module" src="./alpha8-star-access.js"></script>`,
        'star script include')
    return s
})

edit('web/alpha8-theme-help.js', (s) => {
    s = s.replace(`    refDrop.onclick = () => refInput.click()\n`, '')
    s = s.replace(`    themeDrop.onclick = () => themeInput.click()\n`, '')
    const mascotBlock = `    const mascot = retained.assets?.['mascot-main.webp']\n    if (mascot && $('.app-header')) {\n        const image = document.createElement('img')\n        image.id = 'a85-header-mascot'\n        image.className = 'a85-header-mascot'\n        image.src = mascot\n        image.alt = ''\n        $('.app-header').appendChild(image)\n    }\n`
    s = s.replace(mascotBlock, '')
    return s
})

edit('web/alpha8-product.js', (s) => {
    s = s.replace(`    drop.onclick = () => input.click()\n`, '')
    s = s.replace('<br><strong>打赏后还可能触发一个小惊喜。</strong>', '')
    if (!s.includes('GitHub 收藏项目有小惊喜。'))
        s = s.replace(`<div class="a83-row"><button type="button" id="a83-star">⭐ 给项目 Star</button></div>`, `<p class="status">GitHub 收藏项目有小惊喜。</p><div class="a83-row"><button type="button" id="a83-star">⭐ 给项目 Star</button></div>`)
    return s
})

edit('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/Ui.java', (s) => {
    if (!s.includes('import android.widget.ImageButton;')) s = s.replace('import android.widget.EditText;\n', 'import android.widget.EditText;\nimport android.widget.ImageButton;\n')
    return replaceRequired(s,
        `    static Button button(Context c,String label,View.OnClickListener action,boolean compact){Button b=new Button(c);b.setText(label);b.setAllCaps(false);b.setTextColor(PRIMARY);b.setTextSize(compact?13f:14f);b.setMinHeight(dp(c,compact?44:48));b.setMinimumHeight(dp(c,compact?44:48));b.setPadding(dp(c,compact?12:16),dp(c,8),dp(c,compact?12:16),dp(c,8));b.setBackground(rounded(ACTION,Math.min(14,ThemePackStore.cardRadiusDp(c)),c));b.setOnClickListener(action);return b;}\n`,
        `    static Button button(Context c,String label,View.OnClickListener action,boolean compact){Button b=new Button(c);b.setText(label);b.setAllCaps(false);b.setTextColor(PRIMARY);b.setTextSize(compact?13f:14f);b.setMinHeight(dp(c,compact?44:48));b.setMinimumHeight(dp(c,compact?44:48));b.setPadding(dp(c,compact?12:16),dp(c,8),dp(c,compact?12:16),dp(c,8));b.setBackground(rounded(ACTION,Math.min(14,ThemePackStore.cardRadiusDp(c)),c));b.setOnClickListener(action);return b;}\n    static ImageButton iconButton(Context c,int icon,String description,View.OnClickListener action){ImageButton b=new ImageButton(c);int size=dp(c,48);b.setLayoutParams(new LinearLayout.LayoutParams(size,size));b.setMinimumWidth(0);b.setMinimumHeight(0);b.setPadding(dp(c,12),dp(c,12),dp(c,12),dp(c,12));b.setImageResource(icon);b.setColorFilter(PRIMARY);b.setBackground(rounded(ACTION,14,c));b.setContentDescription(description);b.setScaleType(ImageButton.ScaleType.CENTER_INSIDE);b.setOnClickListener(action);return b;}\n`,
        'Ui.iconButton')
})

edit('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java', (s) => {
    s = s.replace(/titleRow\(p,"为你推荐",compact\("↻",v->\{NativeRecommendationJobs\.refresh\(this\);progress\.begin\(\);\}\)\);/, `titleRow(p,"为你推荐",Ui.iconButton(this,R.drawable.ic_refresh_24,"刷新推荐",v->{NativeRecommendationJobs.refresh(this);progress.begin();}));`)
    s = s.replace(/titleRow\(p,"在线",compact\("账号",v->startActivity\(new Intent\(this,PicaAccountActivity\.class\)\)\)\);/, `titleRow(p,"在线",Ui.iconButton(this,R.drawable.ic_person_24,"Pica 账号",v->startActivity(new Intent(this,PicaAccountActivity.class))));`)
    return s
})

edit('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/AppearanceActivity.java', (s) => {
    const old = `        if(SupporterEntitlement.themePacksEnabled(this)){LinearLayout advanced=Ui.card(this);advanced.addView(Ui.text(this,"个性化装扮",17,Ui.TEXT,true));advanced.addView(Ui.text(this,"已验证支持者凭证。可安装受限主题包与资源；脚本、HTML、字体和可执行内容会被拒绝。",12,Ui.MUTED,false));advanced.addView(Ui.button(this,"主题包",v->startActivity(new Intent(this,ThemePackActivity.class)),false));root.addView(advanced);}`
    const neu = `        LinearLayout advanced=Ui.card(this);advanced.addView(Ui.text(this,"个性化装扮",17,Ui.TEXT,true));advanced.addView(Ui.text(this,StarAccessStore.enabled(this)?"GitHub Star 已验证。可使用 Pica Violet · 星漫和自己的主题包。":"给 Pica Library 项目一个 Star，即可解锁个性化装扮。",12,Ui.MUTED,false));advanced.addView(Ui.button(this,StarAccessStore.enabled(this)?"管理主题包":"验证 GitHub Star",v->startActivity(new Intent(this,ThemePackActivity.class)),false));root.addView(advanced);`
    return s.replace(old, neu)
})

edit('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ThemePackActivity.java', (s) => {
    s = s.replace(`if(!SupporterEntitlement.themePacksEnabled(this)){toast("当前安装没有有效的支持者主题凭证");finish();return;}`, `if(!StarAccessStore.enabled(this)){locked();return;}`)
    const anchor = `    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_LONG).show();}`
    if (!s.includes('private void locked()')) {
        const method = `    private void locked(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(Ui.dp(this,20),Ui.dp(this,22),Ui.dp(this,20),Ui.dp(this,22));root.setBackgroundColor(Ui.BG);root.addView(Ui.text(this,"个性化装扮",24,Ui.TEXT,true));TextView copy=Ui.text(this,"给 Pica Library 项目一个 Star，即可解锁个性化装扮。解锁后可立即体验 Pica Violet · 星漫，也可以从 Desktop Theme Studio 同步自己的主题。",13,Ui.MUTED,false);copy.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,14));root.addView(copy);root.addView(Ui.button(this,"⭐ 前往 GitHub 收藏项目",v->startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW,android.net.Uri.parse(StarAccessStore.REPOSITORY_URL))),false));EditText user=new EditText(this);user.setSingleLine(true);user.setHint("GitHub 用户名");Ui.styleField(user,this);LinearLayout.LayoutParams up=new LinearLayout.LayoutParams(-1,-2);up.setMargins(0,Ui.dp(this,12),0,0);root.addView(user,up);TextView state=Ui.text(this,"一次验证成功后会在本机长期记住，并可从已配对 Desktop 同步。",12,Ui.MUTED,false);state.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,8));root.addView(state);Button verify=Ui.button(this,"验证我的 Star",v->{String name=user.getText().toString().trim();state.setText("正在验证 GitHub Star…");v.setEnabled(false);StarAccessStore.verify(this,name,(ok,message)->{state.setText(message);v.setEnabled(true);if(ok)recreate();});},false);root.addView(verify);setContentView(root);}\n`
        s = s.replace(anchor, method + anchor)
    }
    return s
})

edit('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ThemePackSync.java', (s) => {
    s = s.replace(`        try{String entitlement=BridgeBinaryClient.text(c,"/mobile/v1/supporter/entitlement",256*1024);if(entitlement.trim().startsWith("{"))SupporterEntitlement.install(c,entitlement);}catch(Exception ignored){}\n        if(!SupporterEntitlement.themePacksEnabled(c))throw new SecurityException("当前没有有效的支持者个性化凭证");`, `        try{JSONObject star=new JSONObject(BridgeBinaryClient.text(c,"/mobile/v1/star-access",64*1024));StarAccessStore.installSyncedProof(c,star);}catch(Exception ignored){}\n        if(!StarAccessStore.enabled(c))throw new SecurityException("给 Pica Library 项目 Star 后即可解锁个性化装扮");`)
    return s
})

edit('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ThemePackStore.java', (s) => {
    if (!s.includes('import java.util.zip.*;')) s = s.replace('import java.util.*;\n', 'import java.util.*;\nimport java.util.zip.*;\n')
    s = s.replaceAll('SupporterEntitlement.themePacksEnabled(c)', 'StarAccessStore.enabled(c)')
    const old = `    private static void ensureBuiltin(Context c){File d=root(c);File m=new File(new File(d,"pica-violet"),"manifest.json");if(m.exists())return;File t=new File(d,"pica-violet");t.mkdirs();try{write(new File(t,"manifest.json"),"{\\\"themeFormatVersion\\\":1,\\\"id\\\":\\\"pica-violet\\\",\\\"name\\\":\\\"Pica Violet\\\",\\\"author\\\":\\\"Pica Library\\\",\\\"version\\\":\\\"1.0.0\\\",\\\"description\\\":\\\"官方示例装扮\\\"}");write(new File(t,"palette.json"),"{\\\"light\\\":{\\\"primary\\\":\\\"#7457B9\\\",\\\"background\\\":\\\"#F7F3FB\\\",\\\"surface\\\":\\\"#FFFFFF\\\",\\\"nav\\\":\\\"#F0EAF6\\\",\\\"text\\\":\\\"#201E24\\\",\\\"muted\\\":\\\"#68636E\\\",\\\"outline\\\":\\\"#D8D2DC\\\",\\\"action\\\":\\\"#E7E4EA\\\",\\\"progressTrack\\\":\\\"#E9DFFF\\\",\\\"progressFill\\\":\\\"#7457B9\\\"},\\\"dark\\\":{\\\"primary\\\":\\\"#D6BCFF\\\",\\\"background\\\":\\\"#15121B\\\",\\\"surface\\\":\\\"#241E2C\\\",\\\"nav\\\":\\\"#1D1824\\\",\\\"text\\\":\\\"#F4EFF7\\\",\\\"muted\\\":\\\"#C7C1CC\\\",\\\"outline\\\":\\\"#49454F\\\",\\\"action\\\":\\\"#2B2730\\\",\\\"progressTrack\\\":\\\"#3B3150\\\",\\\"progressFill\\\":\\\"#D6BCFF\\\"}}");write(new File(t,"layout.json"),"{\\\"cardRadiusDp\\\":20,\\\"coverRadiusDp\\\":14,\\\"density\\\":\\\"standard\\\"}");write(new File(t,"components.json"),"{\\\"typography\\\":{\\\"title\\\":\\\"rounded\\\",\\\"navigation\\\":\\\"rounded\\\"},\\\"navigation\\\":{\\\"selectedEffect\\\":\\\"pill\\\",\\\"iconScale\\\":\\\"standard\\\"},\\\"progress\\\":{\\\"style\\\":\\\"classic\\\",\\\"motion\\\":\\\"none\\\",\\\"effect\\\":\\\"none\\\"},\\\"reader\\\":{\\\"chrome\\\":\\\"themed\\\"}}");}catch(Exception ignored){}}`
    const neu = `    private static void ensureBuiltin(Context c){File d=root(c);File t=new File(d,"pica-violet-star");File marker=new File(t,".official-v1");if(marker.exists())return;delete(t);t.mkdirs();try(InputStream raw=c.getAssets().open("pica-violet-default.pica-theme");ZipInputStream zip=new ZipInputStream(raw)){ZipEntry e;byte[] buf=new byte[8192];while((e=zip.getNextEntry())!=null){if(e.isDirectory())continue;String safe=safePath(e.getName());if(!allowed(safe))throw new IOException("unsupported bundled theme asset");File out=new File(t,safe);out.getParentFile().mkdirs();try(FileOutputStream stream=new FileOutputStream(out)){int n;long total=0;while((n=zip.read(buf))>0){total+=n;if(total>MAX_ENTRY)throw new IOException("bundled theme asset too large");stream.write(buf,0,n);}}}JSONObject manifest=new JSONObject(read(new File(t,"manifest.json")));if(manifest.optInt("themeFormatVersion")!=1||!"pica-violet-star".equals(manifest.optString("id")))throw new IOException("bundled theme manifest invalid");marker.createNewFile();delete(new File(d,"pica-violet"));}catch(Exception e){delete(t);t.mkdirs();try{write(new File(t,"manifest.json"),"{\\\"themeFormatVersion\\\":1,\\\"id\\\":\\\"pica-violet-star\\\",\\\"name\\\":\\\"Pica Violet · 星漫\\\",\\\"author\\\":\\\"Pica Library\\\",\\\"version\\\":\\\"1.0.0\\\",\\\"description\\\":\\\"官方 Star 首发装扮\\\"}");write(new File(t,"palette.json"),"{\\\"light\\\":{\\\"primary\\\":\\\"#7958D8\\\",\\\"background\\\":\\\"#F8F4FC\\\",\\\"surface\\\":\\\"#FFF9FF\\\",\\\"nav\\\":\\\"#F0E8F7\\\",\\\"text\\\":\\\"#241E2A\\\",\\\"muted\\\":\\\"#736A7B\\\",\\\"outline\\\":\\\"#D8CCE2\\\",\\\"action\\\":\\\"#EEE5F4\\\",\\\"progressTrack\\\":\\\"#E5D9F0\\\",\\\"progressFill\\\":\\\"#8A63E6\\\"},\\\"dark\\\":{\\\"primary\\\":\\\"#E58AB8\\\",\\\"background\\\":\\\"#100A10\\\",\\\"surface\\\":\\\"#21131E\\\",\\\"nav\\\":\\\"#170E16\\\",\\\"text\\\":\\\"#FFF7FB\\\",\\\"muted\\\":\\\"#CDBBC7\\\",\\\"outline\\\":\\\"#5A364C\\\",\\\"action\\\":\\\"#37212F\\\",\\\"progressTrack\\\":\\\"#432537\\\",\\\"progressFill\\\":\\\"#E16F9F\\\"}}");write(new File(t,"layout.json"),"{\\\"cardRadiusDp\\\":20,\\\"coverRadiusDp\\\":14,\\\"density\\\":\\\"standard\\\"}");write(new File(t,"components.json"),"{\\\"typography\\\":{\\\"title\\\":\\\"rounded\\\",\\\"navigation\\\":\\\"rounded\\\"},\\\"navigation\\\":{\\\"selectedEffect\\\":\\\"glow\\\",\\\"iconScale\\\":\\\"standard\\\"},\\\"progress\\\":{\\\"style\\\":\\\"mascot\\\",\\\"motion\\\":\\\"bobble\\\",\\\"effect\\\":\\\"sparkle\\\"},\\\"reader\\\":{\\\"chrome\\\":\\\"themed\\\"}}");marker.createNewFile();}catch(Exception ignored){}}}`
    if (s.includes(old)) s=s.replace(old,neu)
    else if (!s.includes('pica-violet-default.pica-theme')) {
        const pattern=/    static void ensureBuiltin\(Context c\)\{[^\n]+\}/
        const matches=s.match(pattern)
        if(!matches) throw new Error('Android ensureBuiltin anchor missing')
        s=s.replace(pattern,neu)
    }
    return s
})

edit('mobile/android-alpha2/app/src/main/AndroidManifest.xml', (s) => {
    if (!s.includes('android:icon="@mipmap/ic_launcher"')) s=s.replace('<application\n', '<application\n        android:icon="@mipmap/ic_launcher"\n        android:roundIcon="@mipmap/ic_launcher_round"\n')
    return s
})

console.log('Alpha8.6 Star personalization patch applied')
