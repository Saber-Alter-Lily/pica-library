let ranks=new Map(),previous=[],forceNew=false
export function stableShuffle(items){
    const ids=items.map(b=>b.comicId)
    if(!ids.length)return []
    if(forceNew||!ids.every(id=>ranks.has(id))){
        const shuffled=[...ids]
        for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]}
        if(shuffled.length>1&&previous.length===shuffled.length&&shuffled.every((id,i)=>id===previous[i]))shuffled.push(shuffled.shift())
        ranks=new Map(shuffled.map((id,i)=>[id,i]));previous=shuffled;forceNew=false
    }
    return [...items].sort((a,b)=>ranks.get(a.comicId)-ranks.get(b.comicId))
}
let env,cache={authors:[],updates:[]},active='',dialog,grid,tabs,msg,manage,trigger,token='',writeEpoch=0
const endpoint='/api/v1/desktop/reader-subscriptions'
const tr=(zh,en,ja)=>env.language()==='en'?en:env.language()==='ja'?ja:zh
const el=(tag,txt)=>{const n=document.createElement(tag);if(txt)n.textContent=txt;return n}
const btn=(s,cb)=>{const b=el('button',s);b.type='button';b.onclick=async()=>{b.disabled=true;try{await cb()}catch(e){if(dialog?.open)msg.textContent=e.message;else window.alert(e.message)}finally{b.disabled=false}};return b}
async function request(data){
    let epoch=++writeEpoch
    if(data&&!token){const s=await fetch('/api/v1/desktop/status');if(!s.ok)throw Error(tr('需要桌面服务','Desktop required','デスクトップが必要'));token=(await s.json()).csrfToken}
    const r=await fetch(endpoint,data?{method:'POST',headers:{'content-type':'application/json','x-pica-csrf':token},body:JSON.stringify(data)}:{})
    if(!r.ok){if(r.status===403)token='';throw Error(tr('无法读取订阅：','Updates unavailable: ','購読を読み込めません：')+r.status)}
    const next=await r.json();if(epoch===writeEpoch){cache=next;badge();if(dialog?.open)paint()}return next
}
function badge(){const n=document.querySelector('#reader-inbox');if(n)n.textContent=tr('订阅更新','Updates','購読更新')+(cache.updates.length?' · '+cache.updates.length:'')}
function paint(){
    const s=cache;grid.replaceChildren();tabs.replaceChildren();manage.replaceChildren()
    if(!s.authors.some(a=>a.id===active))active=''
    for(const a of [{id:'',label:tr('全部更新','All updates','すべて')},...s.authors]){
        const b=btn(a.label,()=>{active=a.id;paint()});b.setAttribute('aria-pressed',String(active===a.id));tabs.append(b)
        if(a.id)manage.append(btn(tr('取消订阅 · ','Unsubscribe · ','購読解除 · ')+a.label,async()=>{if(window.confirm(tr('取消订阅这位作者？','Unsubscribe from this author?','この作者の購読を解除しますか？')))await request({action:'unfollow',authorId:a.id})}))
    }
    const rows=s.updates.filter(r=>!active||r.authorId===active)
    msg.textContent=(rows.length?tr('待看作品：','Unread works: ','未読作品：')+rows.length:tr('暂无更新。首次订阅不补发历史作品。','No updates. Existing works are not announced.','更新はありません。過去の作品は通知しません。'))+(s.partial?tr(' · 部分来源或作者尚未查全',' · partial source coverage',' · 一部未確認'):'')
    for(const r of rows){const n=Math.min(...r.chapters),card=el('article'),im=el('img');im.loading='lazy';im.alt='';im.src='/api/v1/covers/'+encodeURIComponent(r.comicId);im.onerror=()=>{im.hidden=true}
        const read=btn(r.title,()=>{dialog.close();return env.open(r.comicId,true,n)});read.prepend(im);card.append(read,el('small',r.author+' · '+tr('第 ','Ch. ','第 ')+n),btn(tr('标记本章已看','Mark chapter seen','この話を既読にする'),()=>request({action:'seen',comicId:r.comicId,chapter:n})));grid.append(card)}
}
function makeDialog(){
    dialog=el('dialog');dialog.id='reader-inbox-dialog';dialog.setAttribute('aria-labelledby','reader-inbox-title')
    const h=el('h2',tr('订阅更新','Subscription updates','購読更新'));h.id='reader-inbox-title'
    const bar=el('div');bar.className='actions';bar.append(h,btn(tr('检查更新','Check now','更新確認'),()=>request({action:'refresh',force:true})),btn(tr('关闭','Close','閉じる'),()=>dialog.close()))
    tabs=el('div');tabs.className='actions';grid=el('div');grid.className='reader-inbox-grid';msg=el('p');msg.setAttribute('role','status')
    const details=el('details');manage=el('div');manage.className='actions';details.append(el('summary',tr('管理订阅作者','Manage authors','購読の管理')),manage)
    dialog.append(bar,tabs,msg,grid,details);document.body.append(dialog);dialog.addEventListener('close',()=>trigger?.focus())
}
async function openInbox(){
    if(!dialog)makeDialog();active='';trigger=document.activeElement;paint();dialog.showModal()
    if(!env.connected()){msg.textContent=tr('请在运行桌面服务时打开订阅。','Connect to Desktop to view updates.','デスクトップに接続してください。');return}
    try{await request();if(cache.authors.length)await request({action:'refresh'})}catch(e){msg.textContent=e.message}
}
export const subscriptionUi={
    bind(e){env=e;document.addEventListener('click',ev=>{if(ev.target.closest('#reader-shuffle')){forceNew=true;document.querySelector('#sort-mode').value='shuffle';e.render()}if(ev.target.closest('#reader-inbox'))void openInbox()})
        document.addEventListener('change',ev=>{if(ev.target.id==='sort-mode'){if(ev.target.value==='shuffle')forceNew=true;document.querySelector('#apply-filter')?.click()}})
        window.addEventListener('load',()=>{setTimeout(async()=>{if(!env.connected())return;try{await request();if(cache.authors.length)await request({action:'refresh'})}catch{/* badge is not a network error dialog */}},1100)},{once:true})},
    followButton(id,author,parent){const draw=()=>{b.textContent=cache.authors.some(a=>a.label===author)?tr('查看订阅','View subscriptions','購読を見る'):tr('订阅作者','Subscribe to author','作者を購読')};const b=btn('',async()=>{if(cache.authors.some(a=>a.label===author)){document.querySelector('#recommend-detail-dialog')?.close();return openInbox()}await request({action:'follow',comicId:id});draw()});draw();parent.append(b);request().then(draw).catch(()=>{})},
    acknowledge(id,n){if(!Number.isInteger(n)||!cache.updates.some(r=>r.comicId===id&&r.chapters.includes(n)))return;return request({action:'seen',comicId:id,chapter:n}).catch(()=>{})}
}
