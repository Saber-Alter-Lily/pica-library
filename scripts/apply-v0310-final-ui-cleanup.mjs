import fs from 'node:fs'

function edit(file, transform) {
  const before=fs.readFileSync(file,'utf8')
  const after=transform(before)
  if(after===before)throw new Error(`${file}: no change`)
  fs.writeFileSync(file,after,'utf8')
}

function rep(source,before,after,label){if(!source.includes(before))throw new Error(`${label}: anchor missing`);return source.replace(before,after)}

edit('web/alpha8-star-access.js',s=>rep(s,'<p class="eyebrow">GitHub Account</p>','','locked auth eyebrow'))
edit('web/alpha8-product.js',s=>rep(s,'<p class="eyebrow">支持者功能</p>','','unlocked theme eyebrow'))

edit('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java',source=>{
  let out=source.replace(
    /TextView thanks=Ui\.text\(this,"感谢你使用本软件[\s\S]*?这也是我不断更新的动力ヽ\(✿ﾟ▽ﾟ\)ノ",13,Ui\.MUTED,false\);/,
    'TextView thanks=Ui.text(this,"感谢你使用 Pica Library。",13,Ui.MUTED,false);'
  )
  if(out===source)throw new Error('mobile support copy anchor missing')
  const beforeHint='TextView starHint=Ui.text(this,"GitHub 收藏项目有小惊喜。",12.5f,Ui.PRIMARY,false);starHint.setPadding(0,Ui.dp(this,10),0,Ui.dp(this,4));about.addView(starHint);'
  out=rep(out,beforeHint,'','mobile star surprise copy')
  const support='LinearLayout support=new LinearLayout(this);support.addView(compact("⭐ 给项目 Star",v->openUrl(REPO_URL)),new LinearLayout.LayoutParams(-1,-2));about.addView(support);'
  out=rep(out,support,'LinearLayout support=new LinearLayout(this);support.setPadding(0,Ui.dp(this,10),0,0);support.addView(compact("⭐ 给项目 Star",v->openUrl(REPO_URL)),new LinearLayout.LayoutParams(-1,-2));about.addView(support);','restore support spacing')
  return out
})

console.log('final UI cleanup applied')
