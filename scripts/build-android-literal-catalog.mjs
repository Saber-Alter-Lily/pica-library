import fs from 'node:fs'
import path from 'node:path'
import { translations } from '../web/i18n.js'

const zh=translations['zh-CN']
const en=translations.en
const ja=translations.ja
const candidates={ 'zh-CN':new Map(), en:new Map(), ja:new Map() }

function offer(language,source,value,key){
    if(!source||!value||source===value)return
    let row=candidates[language].get(source)
    if(!row){row=new Map();candidates[language].set(source,row)}
    let keys=row.get(value)
    if(!keys){keys=[];row.set(value,keys)}
    keys.push(key)
}

for(const key of Object.keys(en)){
    const z=zh[key], e=en[key], j=ja[key]
    offer('en',z,e,key)
    offer('ja',z,j,key)
    offer('ja',e,j,key)
    offer('zh-CN',e,z,key)
}

const byLanguage={ 'zh-CN':{}, en:{}, ja:{} }
const ambiguous=[]
for(const [language,rows] of Object.entries(candidates)){
    for(const [source,targets] of rows){
        if(targets.size===1){
            byLanguage[language][source]=[...targets.keys()][0]
            continue
        }
        ambiguous.push({
            language,
            source,
            targets:[...targets.entries()].map(([value,keys])=>({value,keys}))
        })
    }
}

const out=path.resolve('mobile/android-alpha2/app/src/main/assets/locales/shared-literals.json')
fs.mkdirSync(path.dirname(out),{recursive:true})
fs.writeFileSync(out,JSON.stringify({
    schemaVersion:1,
    generatedFrom:'web/i18n.js',
    policy:'unambiguous-literals-only',
    ambiguousExcluded:ambiguous,
    byLanguage
},null,2)+'\n')
console.log('generated',out,Object.fromEntries(Object.entries(byLanguage).map(([k,v])=>[k,Object.keys(v).length])))
console.log('ambiguous-excluded',ambiguous.length)
if(ambiguous.length)
    console.log(ambiguous.map(row=>`${row.language}\t${JSON.stringify(row.source)}\t${row.targets.map(x=>x.keys.join(',')).join(' | ')}`).join('\n'))
