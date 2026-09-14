import fs from 'node:fs'

function replaceOne(path,before,after,label){let text=fs.readFileSync(path,'utf8');const first=text.indexOf(before);if(first<0)throw new Error(`missing ${label}`);if(text.indexOf(before,first+before.length)>=0)throw new Error(`duplicate ${label}`);fs.writeFileSync(path,text.slice(0,first)+after+text.slice(first+before.length))}

const browse='mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaBrowseActivity.java'
replaceOne(
  browse,
  'LinearLayout actions=new LinearLayout(this);actions.addView(button("搜索",v->startSearch()),new LinearLayout.LayoutParams(0,-2,1));actions.addView(button("Pica 收藏",v->favorites()),new LinearLayout.LayoutParams(0,-2,1));actions.addView(button("Pica 24h",v->leaderboard()),new LinearLayout.LayoutParams(0,-2,1));actions.addView(button("Pica 分类",v->chooseCategory()),new LinearLayout.LayoutParams(0,-2,1));root.addView(actions);',
  'LinearLayout actions=new LinearLayout(this);actions.addView(button("搜索",v->startSearch()),new LinearLayout.LayoutParams(0,-2,1));actions.addView(button("Pica 功能 ▾",v->showPicaActions()),new LinearLayout.LayoutParams(0,-2,1));root.addView(actions);',
  'compact Pica action row'
)
replaceOne(
  browse,
  '    private void chooseSource(){',
  '    private void showPicaActions(){String[] labels={"收藏","24h 排行","分类"};new AlertDialog.Builder(this).setTitle("Pica 功能").setItems(labels,(d,w)->{if(w==0)favorites();else if(w==1)leaderboard();else if(w==2)chooseCategory();}).setNegativeButton("取消",null).show();}\n    private void chooseSource(){',
  'Pica action list method'
)

const account='mobile/android-alpha2/app/src/main/java/com/picalibrary/android/EhAccountActivity.java'
replaceOne(
  account,
  'LinearLayout links=new LinearLayout(this);links.addView(button("官方登录页",v->open("https://forums.e-hentai.org/index.php?act=Login")),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(links,this,8);links.addView(button("官方注册页",v->open("https://forums.e-hentai.org/index.php?act=Reg&CODE=00")),new LinearLayout.LayoutParams(0,-2,1));p.addView(links);Ui.gap(p,this,12);',
  'p.addView(button("官方账号 ▾",v->showOfficialAccountActions()));Ui.gap(p,this,12);',
  'official account list'
)
replaceOne(
  account,
  'editor.addView(cfClearance);status=',
  'editor.addView(cfClearance);editor.addView(button("保存并验证",v->saveAndVerify()));status=',
  'save button inside expanded editor'
)
replaceOne(
  account,
  'p.addView(status);LinearLayout row1=new LinearLayout(this);row1.addView(button("保存并验证",v->saveAndVerify()),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(row1,this,8);row1.addView(button("同步云收藏",v->syncFavorites()),new LinearLayout.LayoutParams(0,-2,1));p.addView(row1);LinearLayout row2=new LinearLayout(this);row2.addView(button("探测 ExH",v->probe()),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(row2,this,8);row2.addView(button("清除会话",v->clearSession()),new LinearLayout.LayoutParams(0,-2,1));p.addView(row2);',
  'p.addView(status);p.addView(button("账号功能 ▾",v->showAccountActions()));',
  'compact E-H account actions'
)
replaceOne(
  account,
  '    private void open(String url){startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}\n',
  '    private void open(String url){startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}\n    private void showOfficialAccountActions(){String[] labels={"打开官方登录页","打开官方注册页"};new AlertDialog.Builder(this).setTitle("E-H 官方账号").setItems(labels,(d,w)->{if(w==0)open("https://forums.e-hentai.org/index.php?act=Login");else if(w==1)open("https://forums.e-hentai.org/index.php?act=Reg&CODE=00");}).setNegativeButton("取消",null).show();}\n    private void showAccountActions(){String[] labels={"同步 E-H 云收藏","探测 ExH 权限","清除本机会话"};new AlertDialog.Builder(this).setTitle("账号功能").setItems(labels,(d,w)->{if(w==0)syncFavorites();else if(w==1)probe();else if(w==2)confirmClearSession();}).setNegativeButton("取消",null).show();}\n    private void confirmClearSession(){new AlertDialog.Builder(this).setTitle("清除 E-H 会话？").setMessage("只删除本机加密会话，不删除漫画、书架或本地收藏。") .setNegativeButton("取消",null).setPositiveButton("清除",(d,w)->clearSession()).show();}\n',
  'E-H account list methods'
)

const navTest='test/unit/eh-product-navigation.test.ts'
let test=fs.readFileSync(navTest,'utf8')
replaceOne(navTest,"    expect(browse).toContain('setSingleChoiceItems(labels,checked')","    expect(browse).toContain('setSingleChoiceItems(labels,checked')",'navigation test anchor')
test=fs.readFileSync(navTest,'utf8')
const anchor="    expect(browse).not.toContain('bar.addView(button(\"E-H 账号\"')\n"
if(!test.includes(anchor))throw new Error('compact UI test anchor not found')
test=test.replace(anchor,anchor+"    expect(browse).toContain('button(\"Pica 功能 ▾\"')\n    expect(browse).not.toContain('actions.addView(button(\"Pica 收藏\"')\n    expect(browse).not.toContain('actions.addView(button(\"Pica 24h\"')\n    expect(browse).not.toContain('actions.addView(button(\"Pica 分类\"')\n")
const accountAnchor="    expect(account).toContain('editor.setVisibility(android.view.View.GONE)')\n"
if(!test.includes(accountAnchor))throw new Error('E-H compact UI test anchor not found')
test=test.replace(accountAnchor,accountAnchor+"    expect(account).toContain('button(\"官方账号 ▾\"')\n    expect(account).toContain('button(\"账号功能 ▾\"')\n    expect(account).toContain('editor.addView(button(\"保存并验证\"')\n    expect(account).not.toContain('links.addView(button(\"官方登录页\"')\n")
fs.writeFileSync(navTest,test)

console.log('ANDROID_COMPACT_SOURCE_UI=APPLIED')
