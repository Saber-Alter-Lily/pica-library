const selector='.info-tip[data-info-tip]'
let active=null
let pinned=false

function popover(){
    let node=document.querySelector('#pica-info-tip-popover')
    if(node)return node
    node=document.createElement('div')
    node.id='pica-info-tip-popover'
    node.setAttribute('role','tooltip')
    node.dataset.open='false'
    node.dataset.pinned='false'
    document.body.appendChild(node)
    return node
}

function place(button){
    const node=popover()
    const rect=button.getBoundingClientRect()
    const margin=8
    const maxWidth=Math.min(360,window.innerWidth-28)
    node.style.maxWidth=`${maxWidth}px`
    node.style.left='14px'
    node.style.top='14px'
    const measured=node.getBoundingClientRect()
    let left=rect.left+rect.width/2-measured.width/2
    left=Math.max(14,Math.min(window.innerWidth-measured.width-14,left))
    let top=rect.bottom+margin
    if(top+measured.height>window.innerHeight-14)
        top=Math.max(14,rect.top-measured.height-margin)
    node.style.left=`${Math.round(left)}px`
    node.style.top=`${Math.round(top)}px`
}

function show(button,pin=false){
    if(!button)return
    const text=button.dataset.infoTip||''
    if(!text)return
    if(active&&active!==button)active.setAttribute('aria-expanded','false')
    active=button
    pinned=pin
    const node=popover()
    node.textContent=text
    node.dataset.open='true'
    node.dataset.pinned=pin?'true':'false'
    button.setAttribute('aria-expanded','true')
    requestAnimationFrame(()=>place(button))
}

function hide(force=false){
    if(pinned&&!force)return
    const node=popover()
    node.dataset.open='false'
    node.dataset.pinned='false'
    if(active)active.setAttribute('aria-expanded','false')
    active=null
    pinned=false
}

document.addEventListener('mouseover',(event)=>{
    const button=event.target.closest?.(selector)
    if(button&&!pinned)show(button,false)
})
document.addEventListener('mouseout',(event)=>{
    const button=event.target.closest?.(selector)
    if(!button||pinned)return
    const related=event.relatedTarget
    if(related&&button.contains(related))return
    hide()
})
document.addEventListener('focusin',(event)=>{
    const button=event.target.closest?.(selector)
    if(button&&!pinned)show(button,false)
})
document.addEventListener('focusout',(event)=>{
    const button=event.target.closest?.(selector)
    if(button&&!pinned)hide()
})
document.addEventListener('click',(event)=>{
    const button=event.target.closest?.(selector)
    if(button){
        event.preventDefault()
        event.stopPropagation()
        if(active===button&&pinned)hide(true)
        else show(button,true)
        return
    }
    if(pinned&&!event.target.closest?.('#pica-info-tip-popover'))hide(true)
})
document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'&&active)hide(true)
})
window.addEventListener('resize',()=>{if(active)place(active)})
window.addEventListener('scroll',()=>{
    if(active&&!pinned&&!active.matches(':hover'))hide()
},true)
