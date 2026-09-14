import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const source='scripts/dev/apply-product-source-architecture.mjs'
let text=fs.readFileSync(source,'utf8')
const originalOnce="const once=(p,a,b,label)=>{let s=read(p);const i=s.indexOf(a);if(i<0)throw new Error(`missing ${label}`);if(s.indexOf(a,i+a.length)>=0)throw new Error(`duplicate ${label}`);write(p,s.slice(0,i)+b+s.slice(i+a.length))}"
const robustOnce="const once=(p,a,b,label)=>{let s=read(p);const i=s.indexOf(a);if(i<0){if(label==='web pica account disclosure'){const r=/<label[\\s\\S]{0,700}?id=\\\"settings-account\\\"[\\s\\S]{0,700}?<\\/label\\s*>[\\s\\S]{0,300}?<label[\\s\\S]{0,700}?id=\\\"settings-password\\\"[\\s\\S]{0,700}?<\\/label\\s*>/;const m=s.match(r);if(!m)throw new Error(`missing ${label}`);write(p,s.replace(r,b));return}throw new Error(`missing ${label}`)}if(s.indexOf(a,i+a.length)>=0)throw new Error(`duplicate ${label}`);write(p,s.slice(0,i)+b+s.slice(i+a.length))}"
if(!text.includes(originalOnce))throw new Error('once helper anchor not found')
text=text.replace(originalOnce,robustOnce)
const fixes=[
  [
    'once(p,"    type ComicProvider,\\n    type ProviderComic,\\n    type SearchRequest\\n", "    type ComicProvider,\\n    type EhSurface,\\n    type ProviderComic,\\n    type SearchRequest\\n",\'eh import surface\')',
    'once(p,"    ComicProvider,\\n    ProviderComic,\\n    SearchRequest\\n", "    ComicProvider,\\n    EhSurface,\\n    ProviderComic,\\n    SearchRequest\\n",\'eh import surface\')'
  ]
]
for(const [before,after] of fixes){if(!text.includes(before))throw new Error('wrapper anchor not found');text=text.replace(before,after)}
const marker="console.log('PRODUCT_SOURCE_ARCHITECTURE_PATCH=APPLIED')"
if(!text.includes(marker))throw new Error('patch completion marker not found')
text=text.replace(marker,"once('src/providers/eh-provider.ts', '.map(ehMetadataToComic)', \".map((item) => ehMetadataToComic(item, 'eh'))\", 'E-H metadata mapper callback')\n\n"+marker)
const temp='scripts/dev/.run-product-source-architecture.mjs'
fs.writeFileSync(temp,text)
try{await import(pathToFileURL(process.cwd()+'/'+temp).href+'?v='+Date.now())}finally{fs.rmSync(temp,{force:true})}
