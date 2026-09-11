import fs from 'node:fs'

function edit(file, transform) {
  const before = fs.readFileSync(file, 'utf8')
  const after = transform(before)
  if (after === before) throw new Error(`${file}: transform made no change`)
  fs.writeFileSync(file, after, 'utf8')
}

function rep(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`${label}: anchor not found`)
  return source.replace(before, after)
}

edit('web/alpha8-product.js', (source) => {
  let out = rep(
    source,
    'panel.innerHTML = `<h3>外观</h3><p>基础明暗模式永久免费，并与手机端保持同一套视觉语义。</p><div class="a83-row"></div>`',
    'panel.innerHTML = `<h3>外观</h3><div class="a83-row"></div>`',
    'desktop appearance microcopy'
  )
  out = rep(
    out,
    '<p>感谢你使用本软件(๑´ㅂ\\`๑)<br>软件是完全免费的，若有余力的小伙伴能够充电支持，我将感受到你对我作品的肯定而备受鼓舞，这也是我不断更新的动力ヽ(✿ﾟ▽ﾟ)ノ</p>',
    '<p>感谢你使用 Pica Library。</p>',
    'support copy'
  )
  out = rep(
    out,
    '<p class="status">GitHub 收藏项目有小惊喜。</p>',
    '',
    'remove star surprise copy'
  )
  out = rep(
    out,
    "const enabled = Boolean(p.supporter && Array.isArray(p.features) && p.features.includes('theme-packs'))",
    "const enabled = p.starUnlocked === true && Number(p.starUserId || 0) > 0 && p.starAuthMethod === 'github-account-device-flow'",
    'strict desktop theme unlock'
  )
  out = rep(
    out,
    '<p>把 AI 或你自己制作的 <code>.pica-theme</code> 装扮包拖到这里。电脑会先做安全校验；已安装装扮可通过局域网同步给手机。</p>',
    '',
    'theme panel helper copy'
  )
  return out
})

edit('web/alpha8-7-desktop-hub.js', (source) => {
  let out = rep(source, "subtitle: '账号、连接、外观、存储、维护和软件更新统一在这里管理。',", "subtitle: '',", 'zh settings subtitle')
  out = rep(out, "storageCopy: '下载目录与下载性能在“基本设置”中统一保存；这里集中管理缓存和下载任务显示。',", "storageCopy: '',", 'zh storage copy')
  out = rep(out, "subtitle: 'Manage account, connections, appearance, storage, maintenance and updates in one place.',", "subtitle: '',", 'en settings subtitle')
  out = rep(out, "storageCopy: 'The library folder and download profile are saved under General. Cache controls and download visibility live here.',", "storageCopy: '',", 'en storage copy')
  out = rep(out, '#a87-settings-heading{margin-bottom:18px}', '#a87-settings-heading{margin-bottom:18px}\n#a87-settings-subtitle:empty,#a87-storage-intro p:empty{display:none}', 'hide empty helper copy')
  return out
})

edit('src/mobile/bridge-server.ts', (source) => {
  let out = rep(
    source,
    `            if (url.pathname === '/mobile/v1/themes' && request.method === 'GET')\n                return json(response, 200, {\n                    ...personalization.status(),\n                    packs: personalization.listThemePacks()\n                })`,
    `            if (url.pathname === '/mobile/v1/themes' && request.method === 'GET') {\n                if (!personalization.starProof())\n                    return json(response, 403, { error: 'GitHub Star authentication required' })\n                return json(response, 200, {\n                    ...personalization.status(),\n                    packs: personalization.listThemePacks()\n                })\n            }`,
    'mobile theme list auth gate'
  )
  out = rep(
    out,
    `            if (themeRoute && request.method === 'GET') {\n                const pack = personalization.themePack(`,
    `            if (themeRoute && request.method === 'GET') {\n                if (!personalization.starProof())\n                    return json(response, 403, { error: 'GitHub Star authentication required' })\n                const pack = personalization.themePack(`,
    'mobile theme blob auth gate'
  )
  return out
})

edit('src/desktop/main.ts', (source) => rep(
  source,
  `if (['0.3.2', '0.3.3'].includes(PRODUCT_VERSION)) {\n    try { personalization.installBundledTesterGrant() } catch { /* tester access never blocks startup */ }\n}\n`,
  '',
  'remove legacy tester auto-grant'
))

edit('package.json', (source) => rep(source, '"version": "0.3.9"', '"version": "0.3.10"', 'desktop version'))

edit('mobile/android-alpha2/app/build.gradle', (source) => {
  let out = rep(source, 'versionCode 36', 'versionCode 37', 'android versionCode')
  out = rep(out, "versionName '0.1.0-alpha8.9-auth-ux-204-fix'", "versionName '0.1.0-alpha8.10-release-readiness'", 'android versionName')
  return out
})

edit('scripts/build-windows-package.ps1', (source) => {
  let out = rep(
    source,
    `} elseif ($version -eq '0.3.9') {\n    'Pica-Library-v0.3.9-windows-x64'\n} elseif ($version -eq '0.2.0-dev.0') {`,
    `} elseif ($version -eq '0.3.9') {\n    'Pica-Library-v0.3.9-windows-x64'\n} elseif ($version -eq '0.3.10') {\n    'Pica-Library-v0.3.10-windows-x64'\n} elseif ($version -eq '0.2.0-dev.0') {`,
    'windows package name'
  )
  out = out.replaceAll("'0.3.7','0.3.8','0.3.9'))", "'0.3.7','0.3.8','0.3.9','0.3.10'))")
  out = rep(
    out,
    `    } elseif ($version -eq '0.3.9') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.8-windows-x64.zip'\n    }`,
    `    } elseif ($version -eq '0.3.9') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.8-windows-x64.zip'\n    } elseif ($version -eq '0.3.10') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.9-windows-x64.zip'\n    }`,
    'windows v0.3.10 base'
  )
  out = out.replaceAll("'0.3.7','0.3.8','0.3.9')) {", "'0.3.7','0.3.8','0.3.9','0.3.10')) {")
  return out
})

edit('README.md', (source) => {
  let out = source.replace('- **Windows / Desktop：v0.3.9**', '- **Windows / Desktop：v0.3.10**')
  out = out.replace('- **Android Preview：v36 · 0.1.0-alpha8.9-auth-ux-204-fix**', '- **Android Preview：v37 · 0.1.0-alpha8.10-release-readiness**')
  out = out.replace('- **当前公开源码：Alpha8.9**', '- **当前公开源码：Alpha8.10**')
  const marker='## Alpha8.9\n'
  const note=`## Alpha8.10\n\n- **全量 v0.3.x 升级兼容**：正式发布门禁覆盖 v0.3.0–v0.3.9 到当前版本的直接应用内升级。\n- **界面收敛**：Desktop/Web 与 Android 删除重复技术说明和冗余小字，保留必要状态、错误和安全提示。\n- **个性化锁定复核**：未完成 GitHub 本人认证时，Desktop 与 Android 均不能导入、同步、启用或读取个性化装扮；移动端主题桥接接口同步加锁。\n- **移除 Star 惊喜文案**：Star 按钮旁不再显示“收藏项目有小惊喜”等暗示性说明。\n\n`
  if(!out.includes(marker))throw new Error('README Alpha8.9 marker missing')
  return out.replace(marker,note+marker)
})

edit('README.en.md', (source) => {
  let out = source.replace('- **Windows / Desktop:** v0.3.9', '- **Windows / Desktop:** v0.3.10')
  out = out.replace('- **Android Preview:** v36 · 0.1.0-alpha8.9-auth-ux-204-fix', '- **Android Preview:** v37 · 0.1.0-alpha8.10-release-readiness')
  out = out.replace('- **Public source:** Alpha8.9', '- **Public source:** Alpha8.10')
  const marker='## Alpha8.9\n'
  const note=`## Alpha8.10\n\n- **All v0.3.x upgrade compatibility:** release gates cover direct in-app upgrades from v0.3.0 through v0.3.9.\n- **UI cleanup:** redundant helper copy is removed across Desktop/Web and Android while status, errors, and essential safety messaging remain.\n- **Strict personalization gate:** themes cannot be imported, synced, activated, or served before authenticated GitHub Star proof is present.\n- **Star surprise copy removed:** the Star action no longer carries teaser microcopy.\n\n`
  if(!out.includes(marker))throw new Error('README.en Alpha8.9 marker missing')
  return out.replace(marker,note+marker)
})

console.log('v0.3.10 release-readiness transforms applied')
