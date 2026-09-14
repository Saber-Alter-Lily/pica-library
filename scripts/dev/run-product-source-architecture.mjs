import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const source='scripts/dev/apply-product-source-architecture.mjs'
let text=fs.readFileSync(source,'utf8')
const fixes=[
  [
    'once(p,"    type ComicProvider,\\n    type ProviderComic,\\n    type SearchRequest\\n", "    type ComicProvider,\\n    type EhSurface,\\n    type ProviderComic,\\n    type SearchRequest\\n",\'eh import surface\')',
    'once(p,"    ComicProvider,\\n    ProviderComic,\\n    SearchRequest\\n", "    CanonicalTag,\\n    ComicProvider,\\n    EhSurface,\\n    ProviderComic,\\n    SearchRequest\\n",\'eh import surface\')'
  ]
]
for(const [before,after] of fixes){if(!text.includes(before))throw new Error('wrapper anchor not found');text=text.replace(before,after)}
const temp='scripts/dev/.run-product-source-architecture.mjs'
fs.writeFileSync(temp,text)
try{await import(pathToFileURL(process.cwd()+'/'+temp).href+'?v='+Date.now())}finally{fs.rmSync(temp,{force:true})}
