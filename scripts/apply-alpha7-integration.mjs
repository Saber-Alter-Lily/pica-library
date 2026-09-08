import fs from 'node:fs'

// Alpha7 has one integration entrypoint. Reuse the two historical Mobile Bridge
// transforms so the branch does not accumulate another copy of that logic.
await import('./apply-mobile-alpha2-patch.mjs')
await import('./apply-mobile-recommendation-cache-patch.mjs')

function replaceOnce(file, before, after) {
    const source = fs.readFileSync(file, 'utf8')
    if (!source.includes(before))
        throw new Error(`Alpha7 patch anchor missing in ${file}: ${before.slice(0, 100)}`)
    const first = source.indexOf(before)
    if (source.indexOf(before, first + before.length) >= 0)
        throw new Error(`Alpha7 patch anchor is not unique in ${file}`)
    fs.writeFileSync(file, source.replace(before, after), 'utf8')
}

replaceOnce(
    'src/desktop/main.ts',
    "import { PRODUCT_VERSION } from '../version'\n",
    "import { PRODUCT_VERSION } from '../version'\nimport { RemoteStorageDesktopManager } from '../remote-storage/desktop-manager'\n"
)
replaceOnce(
    'src/desktop/main.ts',
    "let service: LibraryService | null = null\nlet stopping = false\n",
    "let service: LibraryService | null = null\nlet remoteStorageManager: RemoteStorageDesktopManager | null = null\nlet stopping = false\n"
)
replaceOnce(
    'src/desktop/main.ts',
    "    service = null\n}\n\nasync function stop",
    "    service = null\n    remoteStorageManager = null\n}\n\nasync function stop"
)
replaceOnce(
    'src/desktop/main.ts',
    "async function testConnection(input: Record<string, unknown>) {\n    const { account, password } = connectionCredentials(input, credentials)\n",
    "async function testConnection(input: Record<string, unknown>) {\n    const remoteAction = String(input.remoteStorageAction ?? '')\n    if (remoteAction === 'test') {\n        if (!remoteStorageManager) throw new Error('Remote storage is not ready')\n        return await remoteStorageManager.test(input)\n    }\n    if (remoteAction === 'plan') {\n        if (!remoteStorageManager) throw new Error('Remote storage is not ready')\n        return await remoteStorageManager.plan(input)\n    }\n    const { account, password } = connectionCredentials(input, credentials)\n"
)
replaceOnce(
    'src/desktop/main.ts',
    "    service = new LibraryService(database, dataDir)\n    const csrfToken = randomBytes(32).toString('base64url')\n",
    "    service = new LibraryService(database, dataDir)\n    remoteStorageManager = new RemoteStorageDesktopManager(\n        paths.remoteStorageConfig,\n        credentialsStore,\n        credentials,\n        database,\n        dataDir,\n        (value) => { credentials = value }\n    )\n    const csrfToken = randomBytes(32).toString('base64url')\n"
)
replaceOnce(
    'src/desktop/main.ts',
    "            mobileBridge: mobileBridge?.status() ?? null\n        }),\n",
    "            mobileBridge: mobileBridge?.status() ?? null,\n            remoteStorage: remoteStorageManager?.status() ?? { configured: false, kind: 'webdav' }\n        }),\n"
)
replaceOnce(
    'src/desktop/main.ts',
    "        save: async (input) => {\n            const wasConfigured = Boolean(config && credentials)\n",
    "        save: async (input) => {\n            const remoteAction = String(input.remoteStorageAction ?? '')\n            if (remoteAction === 'save') {\n                if (!remoteStorageManager) throw new Error('Remote storage is not ready')\n                return remoteStorageManager.save(input)\n            }\n            if (remoteAction === 'sync') {\n                if (!remoteStorageManager) throw new Error('Remote storage is not ready')\n                return await remoteStorageManager.sync(input)\n            }\n            const wasConfigured = Boolean(config && credentials)\n"
)
replaceOnce(
    'src/desktop/main.ts',
    "                built.credentials.proxyPassword =\n                    previousCredentials?.proxyPassword\n            }\n            credentialsStore.save(built.credentials)\n",
    "                built.credentials.proxyPassword =\n                    previousCredentials?.proxyPassword\n            }\n            built.credentials.remoteStorageUsername = previousCredentials?.remoteStorageUsername\n            built.credentials.remoteStoragePassword = previousCredentials?.remoteStoragePassword\n            credentialsStore.save(built.credentials)\n"
)
// EADDRINUSE recovery creates a second DB/service, so recreate the manager too.
replaceOnce(
    'src/desktop/main.ts',
    "        service = new LibraryService(database, dataDir)\n        const started = await startLibraryServer({\n",
    "        service = new LibraryService(database, dataDir)\n        remoteStorageManager = new RemoteStorageDesktopManager(\n            paths.remoteStorageConfig, credentialsStore, credentials, database, dataDir,\n            (value) => { credentials = value }\n        )\n        const started = await startLibraryServer({\n"
)

replaceOnce(
    'web/index.html',
    '                <article id="settings-mobile-bridge" class="panel">\n',
    `                <article id="settings-remote-storage" class="panel">\n                    <h3>远程存储 · WebDAV</h3>\n                    <p>把电脑已经下载的漫画增量同步到远程存储。Alpha7 使用 <code>PicaLibrary/v1</code> generation 结构；手机之后可在电脑关机时直接读取。</p>\n                    <p id="remote-storage-state" class="status"></p>\n                    <div class="settings-form">\n                        <label class="wide">WebDAV 地址<input id="remote-webdav-url" placeholder="https://dav.example.com/path" /></label>\n                        <label>根目录<input id="remote-root" value="PicaLibrary" /></label>\n                        <label>用户名<input id="remote-username" autocomplete="username" placeholder="留空沿用已保存用户名" /></label>\n                        <label>密码 / App Password<input id="remote-password" type="password" autocomplete="new-password" placeholder="留空沿用已保存密码" /></label>\n                    </div>\n                    <div class="actions">\n                        <button id="remote-test" type="button">测试连接</button>\n                        <button id="remote-save" type="button">保存设置</button>\n                        <button id="remote-plan" type="button">扫描同步计划</button>\n                        <button id="remote-sync" type="button" class="primary">同步已下载漫画</button>\n                    </div>\n                    <p id="remote-storage-message" class="status" role="status"></p>\n                    <div id="remote-sync-plan" hidden>\n                        <p><strong>同步计划</strong></p>\n                        <p class="status">本地 <span id="remote-plan-local">0</span> 部 · 云端 <span id="remote-plan-remote">0</span> 部 · 待上传/更新 <span id="remote-plan-upload">0</span> 部 · 不变 <span id="remote-plan-unchanged">0</span> 部 · 保留云端独有 <span id="remote-plan-retained">0</span> 部</p>\n                        <p class="status">预计上传 <span id="remote-plan-pages">0</span> 页 · <span id="remote-plan-bytes">0 B</span></p>\n                        <div id="remote-plan-list"></div>\n                    </div>\n                    <p class="status">默认只做增量/加法同步，不删除云端独有漫画。新 generation 完成后最后才切换 <code>current.json</code>。</p>\n                </article>\n                <article id="settings-mobile-bridge" class="panel">\n`
)
replaceOnce(
    'web/index.html',
    '        <script type="module" src="./app.js"></script>\n',
    '        <script type="module" src="./app.js"></script>\n        <script type="module" src="./alpha7-cloud.js"></script>\n'
)

console.log('Alpha7 integration patch applied')
