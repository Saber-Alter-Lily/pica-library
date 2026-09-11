import fs from 'node:fs'

function read(path){return fs.readFileSync(path,'utf8')}
function write(path,value){fs.writeFileSync(path,value,'utf8')}
function replaceRequired(source,before,after,label){if(!source.includes(before))throw new Error(`${label}: anchor not found`);return source.replace(before,after)}
function replaceRegex(source,re,replacement,label){if(!re.test(source))throw new Error(`${label}: pattern not found`);return source.replace(re,replacement)}

// Desktop/Web: remove payment QR UI and styling; keep only a normal GitHub project link.
{
  let s=read('web/alpha8-product.js')
  s=s.replace(/\.a83-support-grid\{[^\n]*?figcaption\{padding-top:7px;font-weight:700\}/,'')
  s=s.replace('@media(max-width:640px){.a83-support-grid{grid-template-columns:1fr 1fr}.a83-row>*{flex:1 1 auto}}','@media(max-width:640px){.a83-row>*{flex:1 1 auto}}')
  s=replaceRegex(s,/function supportPanel\(\) \{[\s\S]*?\n\}\n\nasync function personalizationPanel\(\)/,
`function supportPanel() {
    const settings = $('#settings')
    if (!settings || $('#a83-support')) return
    const panel = document.createElement('article')
    panel.id = 'a83-support'; panel.className = 'panel a83-panel'
    panel.innerHTML = \`<h3>支持项目</h3><p>感谢你使用 Pica Library。</p><div class="a83-row"><button type="button" id="a83-star">⭐ GitHub 项目主页</button></div>\`
    panel.querySelector('#a83-star').onclick = () => window.open('https://github.com/Saber-Alter-Lily/pica-library', '_blank', 'noopener')
    settings.appendChild(panel)
}

async function personalizationPanel()`, 'Desktop support panel')
  write('web/alpha8-product.js',s)
}

// Android: remove both payment destinations, QR renderer, and QR UI.
{
  let s=read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java')
  s=replaceRegex(s,/LinearLayout about=Ui\.card\(this\);about\.addView\(Ui\.text\(this,"支持项目",18,Ui\.TEXT,true\)\);TextView thanks=Ui\.text\(this,"感谢你使用 Pica Library。",13,Ui\.MUTED,false\);thanks\.setPadding\(0,Ui\.dp\(this,8\),0,Ui\.dp\(this,10\)\);about\.addView\(thanks\);LinearLayout qrs=[\s\S]*?about\.addView\(support\);p\.addView\(about\);/,
'LinearLayout about=Ui.card(this);about.addView(Ui.text(this,"支持项目",18,Ui.TEXT,true));TextView thanks=Ui.text(this,"感谢你使用 Pica Library。",13,Ui.MUTED,false);thanks.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,10));about.addView(thanks);LinearLayout support=new LinearLayout(this);support.addView(compact("⭐ GitHub 项目主页",v->openUrl(REPO_URL)),new LinearLayout.LayoutParams(-1,-2));about.addView(support);p.addView(about);', 'Android support card')
  s=replaceRegex(s,/\n    private LinearLayout supportQr[\s\S]*?\n    private void openUrl/,'\n    private void openUrl','Android QR helper methods')
  write('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java',s)
}

for(const path of [
  'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/SupportQr.java',
  'web/support-wechat.svg',
  'web/support-alipay.svg'
]){
  if(!fs.existsSync(path))throw new Error(`missing payment asset: ${path}`)
  fs.unlinkSync(path)
}

{
  let s=read('mobile/android-alpha2/app/build.gradle')
  s=replaceRequired(s,"    implementation 'com.google.zxing:core:3.5.3'\n",'', 'ZXing dependency')
  s=replaceRequired(s,'versionCode 37','versionCode 38','Android versionCode')
  s=replaceRequired(s,"versionName '0.1.0-alpha8.10-release-readiness'","versionName '0.1.0-alpha8.11-no-payment'",'Android versionName')
  write('mobile/android-alpha2/app/build.gradle',s)
}

{
  let s=read('package.json')
  s=replaceRequired(s,'"version": "0.3.10"','"version": "0.3.11"','Desktop version')
  write('package.json',s)
}

{
  let s=read('scripts/build-windows-package.ps1')
  s=replaceRequired(s,
"} elseif ($version -eq '0.3.10') {\n    'Pica-Library-v0.3.10-windows-x64'\n} elseif ($version -eq '0.2.0-dev.0') {",
"} elseif ($version -eq '0.3.10') {\n    'Pica-Library-v0.3.10-windows-x64'\n} elseif ($version -eq '0.3.11') {\n    'Pica-Library-v0.3.11-windows-x64'\n} elseif ($version -eq '0.2.0-dev.0') {",'Windows package name')
  s=s.replaceAll("'0.3.9','0.3.10'))","'0.3.9','0.3.10','0.3.11'))")
  s=replaceRequired(s,
"    } elseif ($version -eq '0.3.10') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.9-windows-x64.zip'\n    }",
"    } elseif ($version -eq '0.3.10') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.9-windows-x64.zip'\n    } elseif ($version -eq '0.3.11') {\n        Join-Path $root 'artifacts\\Pica-Library-v0.3.10-windows-x64.zip'\n    }",'Windows previous base')
  s=s.replaceAll("'0.3.8','0.3.9','0.3.10')) {","'0.3.8','0.3.9','0.3.10','0.3.11')) {")
  write('scripts/build-windows-package.ps1',s)
}

// Marketing docs: present themes as a product capability, not as a Star reward.
{
  let s=read('README.md')
  s=s.replace('- **个性化装扮**：完成本人 GitHub 账号认证并确认 Star 后，可使用和同步 `.pica-theme` 主题包。','- **个性化装扮**：支持 `.pica-theme` 主题包，Desktop 可创建、导入并同步到 Android；两端可独立选择当前主题。')
  s=s.replace(/\n## 个性化装扮[\s\S]*?\n## 下载与更新/,'\n## 下载与更新')
  s=s.replaceAll('v0.3.10','v0.3.11').replaceAll('v37','v38')
  s=s.replace('`v0.3.0 / v0.3.1 / ... / v0.3.9 → v0.3.11`','`v0.3.0 / v0.3.1 / ... / v0.3.10 → v0.3.11`')
  write('README.md',s)
}
{
  let s=read('README.en.md')
  s=s.replace('- **Personalization:** authenticated GitHub Star access unlocks `.pica-theme` packs and cross-device theme-pack sync.','- **Personalization:** `.pica-theme` packs can be created or imported on Desktop and synced to Android; each device keeps its own active theme.')
  s=s.replace(/\n## Personalization[\s\S]*?\n## Downloads and updates/,'\n## Downloads and updates')
  s=s.replaceAll('v0.3.10','v0.3.11').replaceAll('v37','v38')
  write('README.en.md',s)
}

for(const [path,title] of [
  ['docs/desktop-guide.zh-CN.md','Desktop'],['docs/android-guide.zh-CN.md','Android']
]){
  let s=read(path)
  if(title==='Desktop'){
    s=s.replace('- **外观与个性化**：明暗模式、GitHub Star 验证、主题包。','- **外观与个性化**：明暗模式与主题包。')
    s=s.replace(/\n## 6\. 个性化装扮与 GitHub Star[\s\S]*?\n## 7\. 软件更新/,'\n## 6. 个性化装扮\n\nDesktop 支持导入 `.pica-theme` 主题包，并把可用主题包同步到 Android。若某项主题功能需要额外验证，请按应用内提示完成。Desktop 与 Android 各自保存当前启用主题，不强制保持一致。\n\n## 7. 软件更新')
  }else{
    s=s.replace('基础明暗模式不需要 GitHub Star 验证。','基础明暗模式可以直接使用。')
    s=s.replace(/\n## 6\. 个性化装扮[\s\S]*?\n## 7\. 阅读电脑已下载内容/,'\n## 6. 个性化装扮\n\nAndroid 可以使用本机已有主题包，也可以在与 Desktop 配对后同步可用主题包。若某项主题功能需要额外验证，请按应用内提示完成。主题包可以同步，但当前主题仍由手机独立选择。\n\n## 7. 阅读电脑已下载内容')
  }
  s=s.replaceAll('v0.3.10','v0.3.11').replaceAll('v37','v38').replaceAll('Alpha8.10','Alpha8.11')
  write(path,s)
}
for(const path of ['docs/desktop-guide.en.md','docs/android-guide.en.md']){
  let s=read(path)
  s=s.replace(/GitHub Star[^\n]*/g,'theme access')
  s=s.replaceAll('v0.3.10','v0.3.11').replaceAll('v37','v38').replaceAll('Alpha8.10','Alpha8.11')
  write(path,s)
}

console.log('v0.3.11 no-payment transform applied')
