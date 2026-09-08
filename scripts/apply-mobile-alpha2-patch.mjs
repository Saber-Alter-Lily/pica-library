import fs from 'node:fs'

function replaceOnce(file, before, after) {
    const source = fs.readFileSync(file, 'utf8')
    if (!source.includes(before))
        throw new Error(
            `Patch anchor missing in ${file}: ${before.slice(0, 80)}`
        )
    const first = source.indexOf(before)
    const second = source.indexOf(before, first + before.length)
    if (second >= 0)
        throw new Error(
            `Patch anchor is not unique in ${file}: ${before.slice(0, 80)}`
        )
    fs.writeFileSync(file, source.replace(before, after), 'utf8')
}

// Expose an explicit code rotation operation. Merely re-reading status must not
// invalidate a code while the user is typing it on the phone.
replaceOnce(
    'src/mobile/bridge-server.ts',
    "    status: () => MobileBridgeStatus\n    close: () => Promise<void>\n",
    "    status: () => MobileBridgeStatus\n    rotatePairingCode: () => MobileBridgeStatus\n    close: () => Promise<void>\n"
)
replaceOnce(
    'src/mobile/bridge-server.ts',
    "    return {\n        server,\n        status,\n        close: async () => {\n",
    "    return {\n        server,\n        status,\n        rotatePairingCode: () => { rotatePairingCode(); return status() },\n        close: async () => {\n"
)

replaceOnce(
    'src/desktop/main.ts',
    "import { LibraryService } from '../library/service'\n",
    "import { LibraryService } from '../library/service'\nimport { startMobileBridge, type MobileBridgeController } from '../mobile/bridge-server'\n"
)
replaceOnce(
    'src/desktop/main.ts',
    "let server: Server | null = null\nlet database: LibraryDatabase | null = null\n",
    "let server: Server | null = null\nlet mobileBridge: MobileBridgeController | null = null\nlet database: LibraryDatabase | null = null\n"
)
replaceOnce(
    'src/desktop/main.ts',
    "async function closeEngine() {\n    await service?.quiesceLocalDownloads()\n",
    "async function closeEngine() {\n    await mobileBridge?.close()\n    mobileBridge = null\n    await service?.quiesceLocalDownloads()\n"
)
replaceOnce(
    'src/desktop/main.ts',
    "            browserLiteExportProgress\n        }),\n",
    "            browserLiteExportProgress,\n            mobileBridge: mobileBridge?.status() ?? null\n        }),\n"
)
replaceOnce(
    'src/desktop/main.ts',
    "    instance.publish(currentUrl)\n    log.write(`Desktop engine ${PRODUCT_VERSION} started at ${currentUrl}`)\n",
    "    try {\n        mobileBridge = await startMobileBridge({\n            database: database!,\n            service: service!,\n            host: '0.0.0.0',\n            port: 7788,\n            stateFile: path.join(paths.runtimeState, 'mobile-bridge.json')\n        })\n        const mobile = mobileBridge.status()\n        log.write(\n            `Mobile Bridge started at ${\n                mobile.addresses.join(', ') || `port ${mobile.port}`\n            }`\n        )\n    } catch (error) {\n        mobileBridge = null\n        log.write(`Mobile Bridge unavailable: ${String(error)}`)\n    }\n    instance.publish(currentUrl)\n    log.write(`Desktop engine ${PRODUCT_VERSION} started at ${currentUrl}`)\n"
)

replaceOnce(
    'web/index.html',
    '                <article class="panel preview-cache-panel">\n',
    `                <article id="settings-mobile-bridge" class="panel">\n                    <h3>手机连接</h3>\n                    <p>让 Pica Library Android 在同一 Wi-Fi 下直接读取这台电脑的漫画库、推荐和已下载章节。</p>\n                    <p id="mobile-bridge-state" class="status"></p>\n                    <div id="mobile-bridge-details" hidden>\n                        <p><strong>电脑地址</strong></p>\n                        <code id="mobile-bridge-address"></code>\n                        <p><strong>6 位配对码</strong></p>\n                        <div id="mobile-bridge-code" style="font-size:2rem;font-weight:700;letter-spacing:.18em"></div>\n                        <p id="mobile-bridge-expiry" class="status"></p>\n                        <p id="mobile-bridge-devices" class="status"></p>\n                        <p class="status">首次连接如 Windows 弹出防火墙提示，请允许“专用网络”。</p>\n                    </div>\n                    <button id="mobile-bridge-refresh" type="button">生成新配对码</button>\n                </article>\n                <article class="panel preview-cache-panel">\n`
)

replaceOnce(
    'web/app.js',
    'async function loadDesktop() {\n',
    `function renderMobileBridge() {\n    const panel = $('#mobile-bridge-details')\n    const stateLabel = $('#mobile-bridge-state')\n    if (!panel || !stateLabel) return\n    const mobile = desktop?.mobileBridge\n    if (!mobile?.enabled) {\n        panel.hidden = true\n        stateLabel.textContent = 'Mobile Bridge 未启动。请查看日志。'\n        return\n    }\n    panel.hidden = false\n    stateLabel.textContent = 'Mobile Bridge 已启动'\n    const addresses = Array.isArray(mobile.addresses) ? mobile.addresses : []\n    $('#mobile-bridge-address').textContent =\n        addresses[0] || '端口 ' + mobile.port\n    $('#mobile-bridge-code').textContent = mobile.pairingCode || '------'\n    const expiry = mobile.pairingExpiresAt ? new Date(mobile.pairingExpiresAt) : null\n    $('#mobile-bridge-expiry').textContent = expiry && Number.isFinite(expiry.getTime())\n        ? '有效至 ' + expiry.toLocaleTimeString()\n        : ''\n    const devices = Array.isArray(mobile.pairedDevices)\n        ? mobile.pairedDevices\n        : []\n    $('#mobile-bridge-devices').textContent = devices.length\n        ? '已配对：' + devices.map((item) => item.deviceName).join('、')\n        : '尚无已配对设备'\n}\n\nasync function loadDesktop() {\n`
)
replaceOnce(
    'web/app.js',
    '        renderTimestamps()\n        if (!desktop.configured) {\n',
    '        renderTimestamps()\n        renderMobileBridge()\n        if (!desktop.configured) {\n'
)
replaceOnce(
    'web/app.js',
    "$('#language-select').onchange = (event) =>\n    applyLanguage(event.target.value, true)\n",
    "$('#language-select').onchange = (event) =>\n    applyLanguage(event.target.value, true)\n$('#mobile-bridge-refresh')?.addEventListener('click', async () => {\n    try {\n        await desktopPost('/api/v1/desktop/test-connection', { mobileBridgeAction: 'rotate' })\n        await loadDesktop()\n    } catch (error) {\n        $('#mobile-bridge-state').textContent = localizeError(language, error)\n    }\n})\n"
)

console.log('mobile alpha2 patch applied')
