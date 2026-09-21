import fs from 'node:fs'
import path from 'node:path'

const ROOT=process.cwd()
const JAVA_ROOT=path.join(ROOT,'mobile/android-alpha2/app/src/main/java/com/picalibrary/android')
const METHODS=[
  'setText','setHint','setTitle','setMessage','setPositiveButton','setNegativeButton',
  'setNeutralButton','setContentDescription','setSummary','setLabel','setItems',
  'setSingleChoiceItems','setMultiChoiceItems'
]
const han=/[\u3400-\u9fff]/

function files(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const p=path.join(dir,entry.name)
    return entry.isDirectory()?files(p):entry.name.endsWith('.java')?[p]:[]
  })
}

function closingParen(src,open){
  let depth=0,quote='',escape=false
  for(let i=open;i<src.length;i++){
    const ch=src[i]
    if(quote){
      if(escape){escape=false;continue}
      if(ch==='\\'){escape=true;continue}
      if(ch===quote)quote=''
      continue
    }
    if(ch==='"'||ch==="'"){quote=ch;continue}
    if(ch==='(')depth++
    else if(ch===')'){depth--;if(depth===0)return i}
  }
  return -1
}

function wrapHanLiterals(fragment){
  let out='',last=0
  const re=/"((?:\\.|[^"\\])*)"/g
  let m
  while((m=re.exec(fragment))){
    const value=m[1]
    if(!han.test(value))continue
    const prefix=fragment.slice(Math.max(0,m.index-40),m.index)
    if(/LocalizedText\.ui\(\s*$/.test(prefix))continue
    out+=fragment.slice(last,m.index)+'LocalizedText.ui('+m[0]+')'
    last=m.index+m[0].length
  }
  return last?out+fragment.slice(last):fragment
}

function migrate(src){
  const starts=[]
  for(const method of METHODS){
    const re=new RegExp('\\.'+method+'\\s*\\(','g')
    let m
    while((m=re.exec(src)))starts.push({open:src.indexOf('(',m.index),kind:method})
  }
  {
    const re=/Toast\.makeText\s*\(/g
    let m
    while((m=re.exec(src)))starts.push({open:src.indexOf('(',m.index),kind:'Toast.makeText'})
  }
  starts.sort((a,b)=>b.open-a.open)
  let out=src,changed=0
  for(const item of starts){
    const close=closingParen(out,item.open)
    if(close<0)continue
    const before=out.slice(item.open+1,close)
    const after=wrapHanLiterals(before)
    if(after!==before){
      out=out.slice(0,item.open+1)+after+out.slice(close)
      changed++
    }
  }
  return {out,changed}
}

let filesChanged=0,callsChanged=0
for(const file of files(JAVA_ROOT)){
  const src=fs.readFileSync(file,'utf8')
  const {out,changed}=migrate(src)
  if(changed){
    fs.writeFileSync(file,out)
    filesChanged++
    callsChanged+=changed
    console.log(changed,path.relative(ROOT,file))
  }
}
console.log(JSON.stringify({filesChanged,callsChanged}))
