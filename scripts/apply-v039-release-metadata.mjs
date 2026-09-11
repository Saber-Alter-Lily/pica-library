import fs from 'node:fs'

function edit(file, transform) {
  const before = fs.readFileSync(file, 'utf8')
  const after = transform(before)
  if (after === before) throw new Error(`${file}: transform made no change`)
  fs.writeFileSync(file, after, 'utf8')
}

function req(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`${label}: anchor not found`)
  return source.replace(before, after)
}

edit('scripts/build-windows-package.ps1', (source) => {
  let out = req(
    source,
    "} elseif ($version -eq '0.3.8') {\n    'Pica-Library-v0.3.8-windows-x64'\n} elseif ($version -eq '0.2.0-dev.0') {",
    "} elseif ($version -eq '0.3.8') {\n    'Pica-Library-v0.3.8-windows-x64'\n} elseif ($version -eq '0.3.9') {\n    'Pica-Library-v0.3.9-windows-x64'\n} elseif ($version -eq '0.2.0-dev.0') {",
    'v0.3.9 package name'
  )
  out = req(
    out,
    "'0.3.6','0.3.7','0.3.8')) {",
    "'0.3.6','0.3.7','0.3.8','0.3.9')) {",
    'stable package list'
  )
  out = req(
    out,
    "} elseif ($version -eq '0.3.8') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.7-windows-x64.zip'\n    }",
    "} elseif ($version -eq '0.3.8') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.7-windows-x64.zip'\n    } elseif ($version -eq '0.3.9') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.8-windows-x64.zip'\n    }",
    'v0.3.9 previous package'
  )
  out = req(
    out,
    "'0.3.6','0.3.7','0.3.8')) {\n            # Stable v0.3.1+ packages",
    "'0.3.6','0.3.7','0.3.8','0.3.9')) {\n            # Stable v0.3.1+ packages",
    'stable launcher list'
  )
  return out
})

edit('README.md', (source) => {
  let out = source
    .replace('- **Windows / Desktop：v0.3.8**', '- **Windows / Desktop：v0.3.9**')
    .replace('- **Android Preview：v35 · 0.1.0-alpha8.8-account-auth-theme-decouple**', '- **Android Preview：v36 · 0.1.0-alpha8.9-auth-ux-204-fix**')
    .replace('- **当前公开源码：Alpha8.8**', '- **当前公开源码：Alpha8.9**')
  const marker = '## Alpha8.8\n'
  const section = `## Alpha8.9\n\n- **修复 GitHub Star 成功却报错**：Desktop 代理网络层正确处理 HTTP 204/205/304 无响应体状态，不再出现 \`Response constructor: Invalid response status code 204\`。\n- **认证流程改为先看码、再跳转**：Desktop 点击后先在当前页面显示一次性验证码，并提供“复制验证码 / 打开 GitHub 授权页”两个明确步骤；不再自动跳走。\n- **Android 验证码不再消失**：手机同样先显示验证码再由用户主动打开 GitHub；从浏览器返回时认证页面不重建，验证码与等待状态保持。\n- **Android 开屏安全区修复**：免责声明页面显式避让状态栏、刘海与底部系统导航区域。\n- **延续 Alpha8.8**：GitHub 本人账号认证、OAuth Token 不持久化、Desktop/Android 当前主题独立、主题包可同步等逻辑保持不变。\n\n`
  if (!out.includes(marker)) throw new Error('README Alpha8.8 marker missing')
  return out.replace(marker, section + marker)
})

edit('README.en.md', (source) => {
  let out = source
    .replace('- **Windows / Desktop:** v0.3.8', '- **Windows / Desktop:** v0.3.9')
    .replace('- **Android Preview:** v35 · 0.1.0-alpha8.8-account-auth-theme-decouple', '- **Android Preview:** v36 · 0.1.0-alpha8.9-auth-ux-204-fix')
    .replace('- **Public source:** Alpha8.8', '- **Public source:** Alpha8.9')
  const marker = '## Alpha8.8\n'
  const section = `## Alpha8.9\n\n- **HTTP 204 Star success fix:** the Desktop proxy fetch layer now constructs bodyless 204/205/304 responses correctly instead of throwing \`Invalid response status code 204\`.\n- **See the code before leaving the app:** Desktop now renders the GitHub device code first and exposes separate Copy Code and Open GitHub actions; it no longer opens GitHub automatically.\n- **Android device-code persistence:** Android follows the same explicit two-step flow and does not rebuild the theme-auth page when returning from the external browser while authorization is pending.\n- **Android disclaimer insets:** the startup notice reserves status-bar, display-cutout, and bottom-system-bar space.\n- **Alpha8.8 security model retained:** authenticated GitHub identity, transient OAuth access tokens, per-device active themes, and theme-pack sync remain unchanged.\n\n`
  if (!out.includes(marker)) throw new Error('README.en Alpha8.8 marker missing')
  return out.replace(marker, section + marker)
})

console.log('v0.3.9 release metadata transforms applied')
