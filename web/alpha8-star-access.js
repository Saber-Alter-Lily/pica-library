import './alpha8-disclaimer.js'
import './alpha8-7-desktop-hub.js'

const a88$=(s)=>document.querySelector(s)
const wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms))
let authAttempt=0

async function status(){const r=await fetch('/api/v1/desktop/status',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}
async function post(body){const current=await status();const r=await fetch('/api/v1/desktop/settings',{method:'POST',headers:{'content-type':'application/json','x-pica-csrf':current.csrfToken||''},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw new Error(v.error||`HTTP ${r.status}`);return v}

function supportCopy(){const panel=a88$('#a83-support');if(!panel)return;const star=a88$('#a83-star');if(star)star.textContent='⭐ 给项目 Star'}
function fallbackCopy(text){const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove()}
async function copyCode(text){try{await navigator.clipboard.writeText(text)}catch{fallbackCopy(text)}}

function lockedMarkup(){return `<div class="a86-star-hero"><div><p class="eyebrow">GitHub Account</p><h3>GitHub 账号验证</h3><p>个性化装扮仍然通过 Star 解锁，但不再允许输入任意公开用户名。你需要在 GitHub 官方页面登录自己的账号，Pica Library 随后只检查<strong>当前已认证账号</strong>是否 Star 本项目。</p><span class="a86-star-preview">✓ 账号本人认证 · 不保存 GitHub Token</span><p class="a86-star-note">验证使用 GitHub 一次性设备授权。访问令牌只在内存中用于读取账号身份和检查 <code>/user/starred/Saber-Alter-Lily/pica-library</code>，完成后不会写入磁盘。</p></div><div class="a86-star-actions"><button type="button" id="a88-open-repo">⭐ 打开项目页面</button><button type="button" class="primary" id="a88-start-auth">生成 GitHub 验证码</button><div id="a88-device-box" class="a86-star-note" hidden><strong>步骤 1 · 记住或复制验证码</strong><div id="a88-device-code" style="font-size:1.65rem;font-weight:800;letter-spacing:.12em;margin:8px 0"></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><button type="button" id="a88-copy-device">复制验证码</button><button type="button" class="primary" id="a88-open-device">步骤 2 · 打开 GitHub 授权页</button></div><p id="a88-auth-state" class="status">验证码生成后不会自动跳转，确认看见验证码后再打开 GitHub。</p></div></div></div><p id="a88-star-message" class="status a86-star-note">不要把 GitHub 密码或一次性验证码发送给其他人。Pica Library 不会要求你在本软件内输入 GitHub 密码。</p>`}

async function beginAuth(){
    const attempt=++authAttempt
    const button=a88$('#a88-start-auth'),message=a88$('#a88-star-message'),box=a88$('#a88-device-box'),code=a88$('#a88-device-code'),state=a88$('#a88-auth-state'),open=a88$('#a88-open-device'),copy=a88$('#a88-copy-device')
    button.disabled=true
    message.textContent='正在向 GitHub 请求一次性授权码…'
    try{
        const started=await post({personalizationAction:'github-auth-start'})
        if(attempt!==authAttempt)return
        const flow=started.githubAuth
        if(!flow?.flowId||!flow?.userCode||!flow?.verificationUri)throw new Error('GitHub 登录启动响应不完整')
        box.hidden=false
        code.textContent=flow.userCode
        state.textContent='验证码已生成。请先确认或复制验证码，再主动打开 GitHub 授权页。返回本页后验证码会继续保留，软件会自动完成 Star 检查。'
        message.textContent='已生成验证码；本页面不会自动跳转。'
        copy.onclick=async()=>{await copyCode(flow.userCode);message.textContent=`验证码 ${flow.userCode} 已复制。`}
        open.onclick=async()=>{await copyCode(flow.userCode);state.textContent='验证码已复制，并已打开 GitHub 授权页。完成授权后回到这里即可。';window.open(flow.verificationUri,'_blank','noopener')}
        button.textContent='重新生成验证码'
        let delay=Math.max(1200,Number(flow.pollAfterMs||5000))
        while(attempt===authAttempt){
            await wait(delay)
            if(attempt!==authAttempt)return
            const result=await post({personalizationAction:'github-auth-poll',flowId:flow.flowId})
            const auth=result.githubAuth
            if(auth?.state==='pending'){delay=Math.max(1200,Number(auth.pollAfterMs||5000));continue}
            if(auth?.state==='complete'){
                const p=result.personalization||{}
                if(!p.starUnlocked)throw new Error('GitHub 账号已认证，但 Star 状态没有解锁')
                state.textContent=`已验证 GitHub 账号 ${p.starUser||''}`
                message.textContent='GitHub 账号和 Star 均已验证，正在重新载入个性化装扮…'
                setTimeout(()=>location.reload(),350)
                return
            }
            throw new Error('GitHub 登录状态异常')
        }
    }catch(error){if(attempt===authAttempt)message.textContent=`验证失败：${error.message}`}
    finally{if(attempt===authAttempt)button.disabled=false}
}

async function render(){supportCopy();let current;try{current=await status()}catch{return}const p=current.personalization||{};if(p.starUnlocked||p.supporter)return;const settings=a88$('#settings');if(!settings)return;let panel=a88$('#a83-personalization');if(!panel){panel=document.createElement('article');panel.id='a83-personalization';panel.className='panel a83-panel a86-star-panel';settings.appendChild(panel)}panel.classList.add('a86-star-panel');panel.innerHTML=lockedMarkup();a88$('#a88-open-repo').onclick=()=>window.open('https://github.com/Saber-Alter-Lily/pica-library','_blank','noopener');a88$('#a88-start-auth').onclick=()=>void beginAuth()}

async function bootstrap(){for(let i=0;i<25;i++){if(a88$('#settings'))break;await wait(160)}supportCopy();await render()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void bootstrap());else void bootstrap();
