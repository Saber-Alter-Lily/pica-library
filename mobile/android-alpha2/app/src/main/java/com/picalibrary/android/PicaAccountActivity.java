package com.picalibrary.android;

import android.app.Activity;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Native Pica account setup. */
public final class PicaAccountActivity extends Activity {
    private EditText account,password;
    private TextView status;
    private boolean busy;
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);render();onboarding();}
    private void onboarding() {
        LinearLayout p=(LinearLayout)account.getParent();
        LinearLayout guide=new LinearLayout(this);
        guide.setOrientation(LinearLayout.VERTICAL);
        guide.addView(Ui.text(this,"第一次使用 Pica？",20,Ui.TEXT,true));
        guide.addView(Ui.text(this,"已有账号：填写哔咔的账号标识和密码，不是 GitHub 账号，也不是昵称。原账号不一定是邮箱。",14,Ui.MUTED,false));
        guide.addView(button("没有账号？注册 Pica",v->{if(!busy)startActivity(new android.content.Intent(this,PicaRegisterActivity.class));}));
        guide.addView(Ui.text(this,"没有账号可在手机独立注册，无需先连接电脑。登录超时请检查网络或设备代理；注册不代表已获评论等额外权限。",13,Ui.MUTED,false));
        guide.addView(button("暂不登录，返回使用本地 / LAN / WebDAV",v->{if(!busy)finish();}));
        p.addView(guide,0);
        password.setSaveEnabled(false);
    }
    private Button button(String label,android.view.View.OnClickListener action){return Ui.button(this,label,action,false);}
    private void render(){PicaAccountStore.Session session=PicaAccountStore.load(this);LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"Pica 账号",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(Ui.BG);LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setPadding(Ui.dp(this,18),Ui.dp(this,16),Ui.dp(this,18),Ui.dp(this,24));scroll.addView(p);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));p.addView(Ui.text(this,"账号 / 邮箱",13,Ui.TEXT,true));account=new EditText(this);account.setSingleLine(true);account.setText(session.account);Ui.styleField(account,this);p.addView(account);Ui.gap(p,this,10);p.addView(Ui.text(this,"密码",13,Ui.TEXT,true));password=new EditText(this);password.setSingleLine(true);password.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);password.setHint(session.password.isEmpty()?"Pica 密码":"留空则保留已保存密码");Ui.styleField(password,this);p.addView(password);status=Ui.text(this,session.signedIn()?"已登录":"尚未登录",13,Ui.MUTED,false);status.setPadding(0,Ui.dp(this,10),0,Ui.dp(this,8));p.addView(status);LinearLayout row=new LinearLayout(this);row.addView(button("登录",v->login()),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(row,this,8);row.addView(button("退出登录",v->logout()),new LinearLayout.LayoutParams(0,-2,1));p.addView(row);p.addView(Ui.text(this,"账号信息仅保存在本机。",12,Ui.MUTED,false));setContentView(root);root.requestApplyInsets();}
    private void login(){if(busy)return;String a=account.getText().toString().trim();String entered=password.getText().toString();PicaAccountStore.Session old=PicaAccountStore.load(this);String p=entered.isEmpty()&&a.equals(old.account)?old.password:entered;if(a.isEmpty()||p.isEmpty()){status.setText("请填写账号和密码");return;}busy=true;status.setText("正在登录…");new Thread(()->{try{new PicaClient(this).login(a,p);PicaBootstrapJobs.enqueue(this);runOnUiThread(()->{busy=false;password.setText("");status.setText("登录成功，可前往在线浏览或查看收藏。");});}catch(Exception e){runOnUiThread(()->{busy=false;status.setText("登录失败："+PicaAccountErrors.message(e));});}}).start();}
    private void logout(){if(busy)return;PicaBootstrapJobs.cancel(this);PicaAccountStore.clear(this);UnifiedPicaCatalogSync.clearAvailability(this);account.setText("");password.setText("");status.setText("已退出登录");}
}
