const DISCLAIMER_VERSION = '1'
const DISCLAIMER_KEY = 'pica-library-disclaimer-v1'

function accepted() {
    try {
        const value = JSON.parse(localStorage.getItem(DISCLAIMER_KEY) || '{}')
        return value.version === DISCLAIMER_VERSION && Boolean(value.acceptedAt)
    } catch {
        return false
    }
}

function remember() {
    localStorage.setItem(
        DISCLAIMER_KEY,
        JSON.stringify({ version: DISCLAIMER_VERSION, acceptedAt: new Date().toISOString() })
    )
}

function mount() {
    if (accepted() || document.querySelector('#pica-disclaimer-gate')) return
    const style = document.createElement('style')
    style.id = 'pica-disclaimer-style'
    style.textContent = `
#pica-disclaimer-gate{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:22px;background:rgba(17,12,24,.72);backdrop-filter:blur(14px)}
#pica-disclaimer-card{width:min(760px,100%);max-height:min(88vh,860px);overflow:auto;background:var(--a83-surface,#fff);color:var(--a83-text,#201e24);border:1px solid var(--a83-line,#d8d2dc);border-radius:24px;box-shadow:0 24px 80px rgba(0,0,0,.28);padding:26px;box-sizing:border-box}
#pica-disclaimer-card h2{margin:0 0 6px;font-size:1.65rem}#pica-disclaimer-card .lead{margin:0 0 18px;color:var(--a83-muted,#68636e);line-height:1.65}
#pica-disclaimer-card ol{padding-left:1.35rem;line-height:1.7;margin:12px 0 18px}#pica-disclaimer-card li{margin:.48rem 0}
#pica-disclaimer-confirm{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;background:var(--a83-action,#f0edf3);line-height:1.55}
#pica-disclaimer-confirm input{margin-top:.25rem;flex:0 0 auto}
#pica-disclaimer-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}
#pica-disclaimer-actions button{min-width:150px}.pica-disclaimer-note{font-size:.86rem;color:var(--a83-muted,#68636e);margin-top:14px}
@media(max-width:600px){#pica-disclaimer-gate{padding:10px}#pica-disclaimer-card{padding:20px;border-radius:18px}#pica-disclaimer-actions{display:grid;grid-template-columns:1fr}#pica-disclaimer-actions button{width:100%}}
`
    document.head.appendChild(style)

    const gate = document.createElement('div')
    gate.id = 'pica-disclaimer-gate'
    gate.setAttribute('role', 'dialog')
    gate.setAttribute('aria-modal', 'true')
    gate.setAttribute('aria-labelledby', 'pica-disclaimer-title')
    gate.innerHTML = `
      <section id="pica-disclaimer-card">
        <p class="eyebrow">Pica Library · 开源工具使用提示</p>
        <h2 id="pica-disclaimer-title">使用提示与免责声明</h2>
        <p class="lead">Pica Library 是开源、本地优先的个人数字内容管理工具。继续前请确认你理解以下边界。</p>
        <ol>
          <li><strong>非官方关系：</strong>除非另有明确说明，本项目与 Pica 内容服务、GitHub 及第三方内容提供者不存在隶属、代理、授权、背书或担保关系。</li>
          <li><strong>授权与合规：</strong>请自行确保账号使用、内容访问、下载、保存、阅读与备份符合所在地法律法规、平台条款以及版权或其他授权范围。</li>
          <li><strong>不提供内容资源：</strong>Pica Library 本身不销售、托管或重新分发漫画内容，只在用户主动配置且有权访问的数据源上工作。</li>
          <li><strong>禁止未经授权的再分发：</strong>请勿利用本软件传播、公开分享或重新分发你无权传播的内容。</li>
          <li><strong>第三方服务：</strong>网络、GitHub API、内容平台、代理和 WebDAV 可能变更、限流、中断或失效，本项目不保证其持续可用。</li>
          <li><strong>本地数据：</strong>收藏数据库、下载内容和阅读进度主要保存在你的设备上，请自行负责设备安全、磁盘空间和必要备份。</li>
        </ol>
        <label id="pica-disclaimer-confirm"><input id="pica-disclaimer-check" type="checkbox"><span>我已阅读并理解上述提示，并确认只访问、下载和使用我有权访问或使用的内容。</span></label>
        <div id="pica-disclaimer-actions">
          <button id="pica-disclaimer-exit" type="button">不同意并退出</button>
          <button id="pica-disclaimer-accept" type="button" class="primary" disabled>同意并继续</button>
        </div>
        <p class="pica-disclaimer-note">本确认仅记录在当前设备/浏览器中；免责声明版本更新后会再次提示。</p>
      </section>`
    document.body.appendChild(gate)

    const checkbox = document.querySelector('#pica-disclaimer-check')
    const accept = document.querySelector('#pica-disclaimer-accept')
    checkbox.addEventListener('change', () => { accept.disabled = !checkbox.checked })
    accept.addEventListener('click', () => {
        if (!checkbox.checked) return
        remember()
        gate.remove()
    })
    document.querySelector('#pica-disclaimer-exit').addEventListener('click', () => {
        document.body.innerHTML = '<main style="font-family:system-ui;padding:32px;max-width:720px;margin:auto"><h2>Pica Library 已停止显示主界面</h2><p>你没有接受本次使用提示。关闭此页面即可。</p></main>'
    })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
else mount()
