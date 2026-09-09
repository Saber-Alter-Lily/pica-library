package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.core.content.FileProvider;
import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** In-app preview updater: check → background system download → SHA-256 → system installer. */
public final class UpdateActivity extends Activity {
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private TextView status,notes;
    private ProgressBar loading;
    private Button action;
    private UpdateClient.Info info;
    private long downloadId=-1;
    private boolean registered;

    private final BroadcastReceiver receiver=new BroadcastReceiver(){@Override public void onReceive(Context context,Intent intent){long id=intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID,-1);if(id==downloadId)verifyDownloaded();}};

    @Override public void onCreate(Bundle saved){super.onCreate(saved);getWindow().setStatusBarColor(Ui.BG);getWindow().setNavigationBarColor(Ui.BG);render();register();check();}
    private Button button(String label,android.view.View.OnClickListener click){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextColor(Ui.PRIMARY);b.setOnClickListener(click);return b;}
    private void render(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setPadding(Ui.dp(this,18),Ui.dp(this,18),Ui.dp(this,18),Ui.dp(this,18));root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(Ui.dp(this,18),i.getSystemWindowInsetTop()+Ui.dp(this,12),Ui.dp(this,18),i.getSystemWindowInsetBottom()+Ui.dp(this,18));return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.addView(button("‹ 返回",v->finish()));bar.addView(Ui.text(this,"软件更新",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);status=Ui.text(this,"正在检查 Preview 更新…",14,Ui.MUTED,false);root.addView(status);loading=new ProgressBar(this);root.addView(loading);notes=Ui.text(this,"",13,Ui.TEXT,false);notes.setPadding(0,Ui.dp(this,12),0,Ui.dp(this,12));root.addView(notes);action=button("重新检查",v->check());action.setEnabled(false);root.addView(action);root.addView(Ui.text(this,"更新包会在应用内下载并校验 SHA-256。Android 系统仍会显示安装确认，这是系统安全边界；Pica Library 不会静默安装 APK。",12,Ui.MUTED,false));setContentView(root);root.requestApplyInsets();}
    private void register(){IntentFilter filter=new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);if(Build.VERSION.SDK_INT>=33)registerReceiver(receiver,filter,Context.RECEIVER_NOT_EXPORTED);else registerReceiver(receiver,filter);registered=true;}
    private void check(){loading.setVisibility(android.view.View.VISIBLE);action.setEnabled(false);status.setText("正在检查 Preview 更新…");worker.submit(()->{try{UpdateClient.Info value=UpdateClient.check(this);runOnUiThread(()->show(value));}catch(Exception e){runOnUiThread(()->{loading.setVisibility(android.view.View.GONE);status.setText("更新检查失败："+(e.getMessage()==null?"尚未发布 Android Preview":e.getMessage()));action.setText("重新检查");action.setEnabled(true);action.setOnClickListener(v->check());});}});}
    private void show(UpdateClient.Info value){info=value;loading.setVisibility(android.view.View.GONE);int current=UpdateClient.currentVersionCode(this);if(!UpdateClient.newer(this,value)){status.setText("当前已经是最新 Preview · versionCode "+current);notes.setText(value.notes);action.setText("重新检查");action.setEnabled(true);action.setOnClickListener(v->check());return;}status.setText("发现新版本 · "+value.versionName+" · versionCode "+value.versionCode);notes.setText(value.notes);action.setText("下载并更新");action.setEnabled(true);action.setOnClickListener(v->download());}
    private File target(){File dir=getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);if(dir==null)dir=getFilesDir();dir.mkdirs();return new File(dir,"Pica-Library-Android-Preview.apk");}
    private void download(){if(info==null)return;File file=target();if(file.exists())file.delete();DownloadManager.Request request=new DownloadManager.Request(Uri.parse(info.apkUrl));request.setTitle("Pica Library 更新 "+info.versionName);request.setDescription("正在下载 Android Preview");request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);request.setDestinationUri(Uri.fromFile(file));DownloadManager manager=(DownloadManager)getSystemService(DOWNLOAD_SERVICE);downloadId=manager.enqueue(request);status.setText("更新已转入系统后台下载，可以离开此页面；下载完成后重新进入更新页也可以继续安装。");action.setEnabled(false);getSharedPreferences("updater-v1",MODE_PRIVATE).edit().putString("sha256",info.sha256).putInt("versionCode",info.versionCode).putString("versionName",info.versionName).apply();}
    private void verifyDownloaded(){File file=target();String sha=getSharedPreferences("updater-v1",MODE_PRIVATE).getString("sha256","");loading.setVisibility(android.view.View.VISIBLE);status.setText("下载完成，正在校验 SHA-256…");worker.submit(()->{try{boolean ok=file.isFile()&&!sha.isEmpty()&&UpdateClient.verify(file,sha);runOnUiThread(()->{loading.setVisibility(android.view.View.GONE);if(!ok){file.delete();status.setText("更新包完整性校验失败，已删除损坏文件");action.setText("重新下载");action.setEnabled(info!=null);action.setOnClickListener(v->download());return;}status.setText("更新包校验通过");action.setText("安装更新");action.setEnabled(true);action.setOnClickListener(v->install(file));});}catch(Exception e){runOnUiThread(()->{loading.setVisibility(android.view.View.GONE);status.setText("校验失败："+e.getMessage());});}});}
    private void install(File file){if(Build.VERSION.SDK_INT>=26&&!getPackageManager().canRequestPackageInstalls()){new AlertDialog.Builder(this).setTitle("允许安装此来源应用").setMessage("Android 要求你先允许 Pica Library 请求安装下载的 APK。返回本页后再次点击安装即可。") .setNegativeButton("取消",null).setPositiveButton("打开系统设置",(d,w)->startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getPackageName())))).show();return;}Uri uri=FileProvider.getUriForFile(this,getPackageName()+".files",file);Intent intent=new Intent(Intent.ACTION_VIEW);intent.setDataAndType(uri,"application/vnd.android.package-archive");intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_ACTIVITY_NEW_TASK);startActivity(intent);}
    @Override protected void onResume(){super.onResume();File file=target();String sha=getSharedPreferences("updater-v1",MODE_PRIVATE).getString("sha256","");if(file.isFile()&&!sha.isEmpty()&&action!=null)verifyDownloaded();}
    @Override protected void onDestroy(){if(registered)try{unregisterReceiver(receiver);}catch(Exception ignored){}worker.shutdownNow();super.onDestroy();}
}
