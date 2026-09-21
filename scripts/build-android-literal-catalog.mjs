import fs from 'node:fs'
import path from 'node:path'
import { translations } from '../web/i18n.js'

const zh=translations['zh-CN']
const en=translations.en
const ja=translations.ja
const byLanguage={ 'zh-CN':{}, en:{}, ja:{} }
const conflicts=[]

function add(target, source, value, key){
    if(!source||!value||source===value)return
    const existing=target[source]
    if(existing&&existing!==value){conflicts.push({source,existing,value,key});return}
    target[source]=value
}

for(const key of Object.keys(en)){
    const z=zh[key], e=en[key], j=ja[key]
    add(byLanguage.en,z,e,key)
    add(byLanguage.ja,z,j,key)
    add(byLanguage.ja,e,j,key)
    add(byLanguage['zh-CN'],e,z,key)
}
if(conflicts.length){
    console.error(JSON.stringify(conflicts,null,2))
    process.exit(1)
}
const out=path.resolve('mobile/android-alpha2/app/src/main/assets/locales/shared-literals.json')
fs.mkdirSync(path.dirname(out),{recursive:true})
fs.writeFileSync(out,JSON.stringify({schemaVersion:1,generatedFrom:'web/i18n.js',byLanguage},null,2)+'\n')
console.log('generated',out,Object.fromEntries(Object.entries(byLanguage).map(([k,v])=>[k,Object.keys(v).length])))
