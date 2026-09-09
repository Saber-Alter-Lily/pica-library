package com.picalibrary.android;

import android.app.Activity;
import android.os.Bundle;
import android.widget.*;
import java.util.Locale;

public class RemoteStorageActivity extends Activity {
    private EditText url,root,user,password;
    private TextView status,storageStatus;

    @Override public void onCreate(Bundle b){super.onCreate(b);getWindow().setStatusBarColor(Ui.BG);getWindow().setNavigationBarColor(Ui.BG);render();}
    @Override protected void onResume(){super.onResume();if(storageStatus!=null)refreshStorageStatus();}
    private Button button(String text){Button b=new Button(this);b.setText(text);b.setAllCaps(false);return b;}
    private void render(){
        StoragePolicy.maintain(this);
        RemoteConfigStore.Config c=RemoteConfigStore.load(this);
        ScrollView scroll=new ScrollView(this);LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setPadding(Ui.dp(this,16),Ui.dp(this,14),Ui.dp(this,16),Ui.dp(this,24));scroll.addView(p);
        p.addView(Ui.text(this,"远程存储",27,Ui.TEXT,true));p.addView(Ui.text(this,"WebDAV · 手机直接连接网盘并读取 PicaLibrary/v1",13,Ui.MUTED,false));Ui.gap(p,this,10);
        LinearLayout network=Ui.card(this);network.addView(Ui.text(this,"网络说明",16,Ui.TEXT,true));network.addView(Ui.text(this,"正常情况下不需要开启梯子，也不会继承电脑端的 Pica 代理。手机会直接访问下面的 WebDAV 地址；如果偶发超时，优先尝试切换 Wi‑Fi / 移动网络。系统级 VPN 开启时，Android 网络会自然经过该 VPN。",12,Ui.MUTED,false));p.addView(network);Ui.gap(p,this,10);
        url=field(p,"WebDAV 地址",c.baseUrl,"https://...");root=field(p,"根目录",c.root,"PicaLibrary");user=field(p,"用户名","","留空保留已保存用户名");password=field(p,"密码 / App Password","","留空保留已保存密码");password.setInputType(0x00000081);
        status=Ui.text(this,c.configured()?"已配置":"尚未配置",13,Ui.MUTED,false);p.addView(status);
        LinearLayout actions=new LinearLayout(this);Button test=button("测试");Button save=button("保存并测试");actions.addView(test,new LinearLayout.LayoutParams(0,-2,1));actions.addView(save,new LinearLayout.LayoutParams(0,-2,1));p.addView(actions);test.setOnClickListener(v->test(false));save.setOnClickListener(v->test(true));
        Button refreshState=button("刷新便携状态");refreshState.setOnClickListener(v->refreshPortableState());p.addView(refreshState);
        Button clear=button("清除网盘配置");clear.setOnClickListener(v->{RemoteConfigStore.clear(this);finish();});p.addView(clear);

        Ui.gap(p,this,18);p.addView(Ui.text(this,"手机存储管理",18,Ui.TEXT,true));
        p.addView(Ui.text(this,"阅读页缓存默认上限约 1 GB；封面缓存和 WebDAV 元数据分别有独立上限。清理缓存不会删除收藏、网盘漫画、阅读进度或登录信息。",12,Ui.MUTED,false));
        storageStatus=Ui.text(this,"",13,Ui.MUTED,false);p.addView(storageStatus);refreshStorageStatus();
        LinearLayout clearRow1=new LinearLayout(this);Button clearPages=button("清阅读页");Button clearCovers=button("清封面");clearRow1.addView(clearPages,new LinearLayout.LayoutParams(0,-2,1));clearRow1.addView(clearCovers,new LinearLayout.LayoutParams(0,-2,1));p.addView(clearRow1);
        LinearLayout clearRow2=new LinearLayout(this);Button clearMetadata=button("清元数据缓存");Button clearAll=button("清全部缓存");clearRow2.addView(clearMetadata,new LinearLayout.LayoutParams(0,-2,1));clearRow2.addView(clearAll,new LinearLayout.LayoutParams(0,-2,1));p.addView(clearRow2);
        clearPages.setOnClickListener(v->{StoragePolicy.clearPages(this);refreshStorageStatus();});
        clearCovers.setOnClickListener(v->{StoragePolicy.clearCovers(this);refreshStorageStatus();});
        clearMetadata.setOnClickListener(v->{StoragePolicy.clearMetadata(this);refreshStorageStatus();});
        clearAll.setOnClickListener(v->{StoragePolicy.clearAllCaches(this);refreshStorageStatus();});
        setContentView(scroll);
    }
    private EditText field(LinearLayout p,String label,String value,String hint){p.addView(Ui.text(this,label,13,Ui.TEXT,true));EditText e=new EditText(this);e.setSingleLine(true);e.setText(value);e.setHint(hint);p.addView(e,new LinearLayout.LayoutParams(-1,Ui.dp(this,50)));return e;}
    private void refreshStorageStatus(){StoragePolicy.Usage u=StoragePolicy.usage(this);storageStatus.setText("阅读页 "+format(u.pages)+" · 封面 "+format(u.covers)+" · 元数据 "+format(u.metadata)+" · 合计 "+format(u.total));}
    private void test(boolean save){
        status.setText(save?"正在保存并测试…":"正在测试 WebDAV…");
        new Thread(()->{try{
            RemoteConfigStore.Config old=RemoteConfigStore.load(this);RemoteConfigStore.Config candidate=RemoteConfigStore.candidate(url.getText().toString(),root.getText().toString(),user.getText().toString(),password.getText().toString(),old);
            boolean ok=new RemoteLibraryClient(candidate).test();String portable="";
            if(save&&ok){
                RemoteConfigStore.save(this,candidate.baseUrl,candidate.root,candidate.username,candidate.password);
                try{FavoriteCacheStore.Snapshot snapshot=FavoriteCacheStore.syncFromRemote(this);portable=" · 已导入 "+snapshot.items.size()+" 本云端收藏";}catch(Exception ignored){portable=" · 便携状态将在电脑下一次云同步后可用";}
            }
            final String suffix=portable;runOnUiThread(()->{status.setText(ok?(save?"WebDAV 已保存并连接成功"+suffix:"WebDAV 连接成功"):("WebDAV 服务未返回可用状态"));if(save&&ok){password.setText("");user.setText("");refreshStorageStatus();}});
        }catch(Exception e){runOnUiThread(()->status.setText("失败："+(e.getMessage()==null?"未知网络错误":e.getMessage())));}}).start();
    }
    private void refreshPortableState(){
        if(!RemoteConfigStore.load(this).configured()){status.setText("请先保存 WebDAV 配置");return;}
        status.setText("正在刷新便携状态…");new Thread(()->{try{FavoriteCacheStore.Snapshot snapshot=FavoriteCacheStore.syncFromRemote(this);ReaderSettingsStore.reconcile(this);StoragePolicy.maintain(this);runOnUiThread(()->{status.setText("便携状态已刷新 · 收藏 "+snapshot.items.size()+" 本 · 阅读进度/设置会自动同步");refreshStorageStatus();});}catch(Exception e){runOnUiThread(()->status.setText("便携状态刷新失败："+(e.getMessage()==null?"尚未由电脑发布":e.getMessage())));}}).start();
    }
    private String format(long value){if(value<1024)return value+" B";if(value<1024L*1024)return String.format(Locale.ROOT,"%.1f KB",value/1024.0);if(value<1024L*1024*1024)return String.format(Locale.ROOT,"%.1f MB",value/1024.0/1024.0);return String.format(Locale.ROOT,"%.2f GB",value/1024.0/1024.0/1024.0);}
}
