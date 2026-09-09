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

/** Native Pica account setup; credentials and token are encrypted with Android Keystore. */
public final class PicaAccountActivity extends Activity {
    private EditText account,password;
    private TextView status;
    @Override public void onCreate(Bundle saved){super.onCreate(saved);getWindow().setStatusBarColor(Ui.BG);getWindow().setNavigationBarColor(Ui.BG);render();}
    private Button button(String label,android.view.View.OnClickListener action){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextColor(Ui.PRIMARY);b.setOnClickListener(action);return b;}
    private void render(){
        PicaAccountStore.Session session=PicaAccountStore.load(this);LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.addView(button("‹ 返回",v->finish()));bar.addView(Ui.text(this,"Pica 在线",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        ScrollView scroll=new ScrollView(this);LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setPadding(Ui.dp(this,18),Ui.dp(this,10),Ui.dp(this,18),Ui.dp(this,24));scroll.addView(p);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        p.addView(Ui.text(this,"手机直接连接 Pica",24,Ui.TEXT,true));p.addView(Ui.text(this,"登录后，电脑未下载且 WebDAV 没有正文的漫画也可以在手机直接读取。在线页面仍复用统一 Reader、缓存和预加载。",13,Ui.MUTED,false));Ui.gap(p,this,12);
        p.addView(Ui.text(this,"账号 / 邮箱",13,Ui.TEXT,true));account=new EditText(this);account.setSingleLine(true);account.setText(session.account);p.addView(account);
        p.addView(Ui.text(this,"密码",13,Ui.TEXT,true));password=new EditText(this);password.setSingleLine(true);password.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);password.setHint(session.password.isEmpty()?"Pica 密码":"留空保留已保存密码");p.addView(password);
        status=Ui.text(this,session.signedIn()?"已有有效会话缓存；可点击重新验证":"尚未登录",13,Ui.MUTED,false);p.addView(status);
        LinearLayout row=new LinearLayout(this);row.addView(button("登录 / 验证",v->login()),new LinearLayout.LayoutParams(0,-2,1));row.addView(button("退出登录",v->{PicaAccountStore.clear(this);account.setText("");password.setText("");status.setText("已清除 Pica 登录信息");}),new LinearLayout.LayoutParams(0,-2,1));p.addView(row);
        p.addView(Ui.text(this,"Pica 账号、密码和 token 均使用 Android Keystore 加密保存在本机，不写入 WebDAV、统一目录或日志。",12,Ui.MUTED,false));
        setContentView(root);root.requestApplyInsets();
    }
    private void login(){
        String a=account.getText().toString().trim();String entered=password.getText().toString();PicaAccountStore.Session old=PicaAccountStore.load(this);String p=entered.isEmpty()?old.password:entered;
        if(a.isEmpty()||p.isEmpty()){status.setText("请填写账号和密码");return;}status.setText("正在登录 Pica…");
        new Thread(()->{try{new PicaClient(this).login(a,p);PicaClient client=new PicaClient(this);java.util.List<String> categories=client.categories();runOnUiThread(()->{password.setText("");status.setText("Pica 登录成功 · 已验证在线 API"+(categories.isEmpty()?"":" · "+categories.size()+" 个分类"));});}catch(Exception e){runOnUiThread(()->status.setText("Pica 登录失败："+(e.getMessage()==null?"未知错误":e.getMessage())));}}).start();
    }
}
