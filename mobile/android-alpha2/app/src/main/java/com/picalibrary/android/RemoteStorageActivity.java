package com.picalibrary.android;

import android.app.Activity;
import android.os.Bundle;
import android.widget.*;
import java.util.Locale;

public class RemoteStorageActivity extends Activity {
    private EditText url,root,user,password;
    private TextView status,cacheStatus;

    @Override public void onCreate(Bundle b){super.onCreate(b);getWindow().setStatusBarColor(Ui.BG);getWindow().setNavigationBarColor(Ui.BG);render();}
    private Button button(String text){Button b=new Button(this);b.setText(text);b.setAllCaps(false);return b;}
    private void render(){
        RemoteConfigStore.Config c=RemoteConfigStore.load(this);
        ScrollView scroll=new ScrollView(this);LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setPadding(Ui.dp(this,16),Ui.dp(this,14),Ui.dp(this,16),Ui.dp(this,24));scroll.addView(p);
        p.addView(Ui.text(this,"远程存储",27,Ui.TEXT,true));p.addView(Ui.text(this,"WebDAV · 直接读取 PicaLibrary/v1 云端书库",13,Ui.MUTED,false));Ui.gap(p,this,14);
        url=field(p,"WebDAV 地址",c.baseUrl,"https://...");root=field(p,"根目录",c.root,"PicaLibrary");user=field(p,"用户名","","留空保留已保存用户名");password=field(p,"密码 / App Password","","留空保留已保存密码");password.setInputType(0x00000081);
        status=Ui.text(this,c.configured()?"已配置":"尚未配置",13,Ui.MUTED,false);p.addView(status);
        LinearLayout actions=new LinearLayout(this);Button test=button("测试");Button save=button("保存并测试");actions.addView(test,new LinearLayout.LayoutParams(0,-2,1));actions.addView(save,new LinearLayout.LayoutParams(0,-2,1));p.addView(actions);test.setOnClickListener(v->test(false));save.setOnClickListener(v->test(true));
        Button clear=button("清除网盘配置");clear.setOnClickListener(v->{RemoteConfigStore.clear(this);finish();});p.addView(clear);
        Ui.gap(p,this,18);p.addView(Ui.text(this,"本地阅读缓存",18,Ui.TEXT,true));cacheStatus=Ui.text(this,"已缓存 "+format(ReaderImages.cacheBytes(this))+" · 页面会优先从本地读取",13,Ui.MUTED,false);p.addView(cacheStatus);Button clearCache=button("清除阅读缓存");clearCache.setOnClickListener(v->{ReaderImages.clearCache(this);cacheStatus.setText("已缓存 0 B · 页面会优先从本地读取");});p.addView(clearCache);
        setContentView(scroll);
    }
    private EditText field(LinearLayout p,String label,String value,String hint){p.addView(Ui.text(this,label,13,Ui.TEXT,true));EditText e=new EditText(this);e.setSingleLine(true);e.setText(value);e.setHint(hint);p.addView(e,new LinearLayout.LayoutParams(-1,Ui.dp(this,50)));return e;}
    private void test(boolean save){
        status.setText(save?"正在保存并测试…":"正在测试 WebDAV…");
        new Thread(()->{try{
            RemoteConfigStore.Config old=RemoteConfigStore.load(this);RemoteConfigStore.Config candidate=RemoteConfigStore.candidate(url.getText().toString(),root.getText().toString(),user.getText().toString(),password.getText().toString(),old);
            boolean ok=new RemoteLibraryClient(candidate).test();if(save&&ok)RemoteConfigStore.save(this,candidate.baseUrl,candidate.root,candidate.username,candidate.password);
            runOnUiThread(()->{status.setText(ok?(save?"WebDAV 已保存并连接成功":"WebDAV 连接成功"):"WebDAV 服务未返回可用状态");if(save&&ok){password.setText("");user.setText("");}});
        }catch(Exception e){runOnUiThread(()->status.setText("失败："+e.getMessage()));}}).start();
    }
    private String format(long value){if(value<1024)return value+" B";if(value<1024L*1024)return String.format(Locale.ROOT,"%.1f KB",value/1024.0);if(value<1024L*1024*1024)return String.format(Locale.ROOT,"%.1f MB",value/1024.0/1024.0);return String.format(Locale.ROOT,"%.2f GB",value/1024.0/1024.0/1024.0);}
}
