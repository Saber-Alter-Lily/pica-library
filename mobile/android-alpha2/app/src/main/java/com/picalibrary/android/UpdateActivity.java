package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import java.io.File;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Resilient in-app updater: observable DownloadManager state, cancellation, retry, verification and install. */
public final class UpdateActivity extends Activity {
    private static final String PREFS="updater-v2",P_SHA="sha256",P_CODE="versionCode",P_NAME="versionName",P_DOWNLOAD="downloadId",P_LAST_BYTES="lastBytes",P_LAST_PROGRESS="lastProgressAt";
    private static final long STALL_MS=120_000L;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private TextView status,notes,detail;
    private ProgressBar loading;
    private Button action,cancel;
    private UpdateClient.Info info;
    private long downloadId=-1,lastBytes=-1,lastProgressAt=0;
    private boolean registered,destroyed;
    private final Runnable poll=new Runnable(){@Override public void run(){if(destroyed)return;updateDownloadState();if(downloadId>=0)handler.postDelayed(this,1000);}};
    private final BroadcastReceiver receiver=new BroadcastReceiver(){@Override public void onReceive(Context context,Intent intent){long id=intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID,-1);long expected=downloadId>=0?downloadId:prefs().getLong(P_DOWNLOAD,-1);if(id==expected){downloadId=id;updateDownloadState();}}};

    private static final class DownloadState{
        final boolean found;final int status,reason;final long bytes,total;
        DownloadState(boolean found,int status,int reason,long bytes,long total){this.found=found;this.status=status;this.reason=reason;this.bytes=bytes;this.total=total;}
    }

    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);downloadId=prefs().getLong(P_DOWNLOAD,-1);lastBytes=prefs().getLong(P_LAST_BYTES,-1);lastProgressAt=prefs().getLong(P_LAST_PROGRESS,0);render();register();check();}
    private android.content.SharedPreferences prefs(){return getSharedPreferences(PREFS,MODE_PRIVATE);}
    private Button button(String label,View.OnClickListener click){return Ui.button(this,label,click,false);}

    private void render(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(Ui.dp(this,18),i.getSystemWindowInsetTop()+Ui.dp(this,12),Ui.dp(this,18),i.getSystemWindowInsetBottom()+Ui.dp(this,18));return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"软件更新",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        status=Ui.text(this,"正在检查更新…",15,Ui.TEXT,true);status.setPadding(0,Ui.dp(this,16),0,0);root.addView(status);
        detail=Ui.text(this,"",13,Ui.MUTED,false);detail.setPadding(0,Ui.dp(this,6),0,Ui.dp(this,8));root.addView(detail);
        loading=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);loading.setMax(100);loading.setIndeterminate(true);root.addView(loading,new LinearLayout.LayoutParams(-1,Ui.dp(this,8)));
        notes=Ui.text(this,"",13,Ui.MUTED,false);notes.setPadding(0,Ui.dp(this,14),0,Ui.dp(this,14));root.addView(notes);
        LinearLayout buttons=new LinearLayout(this);action=button("重新检查",v->check());action.setEnabled(false);buttons.addView(action,new LinearLayout.LayoutParams(0,-2,1));Ui.gap(buttons,this,8);cancel=button("取消下载",v->cancelCurrent(false));cancel.setVisibility(View.GONE);buttons.addView(cancel,new LinearLayout.LayoutParams(0,-2,1));root.addView(buttons);
        TextView hint=Ui.text(this,"下载、校验和安装都可在这里完成；异常任务可以直接终止并重新开始。",12,Ui.MUTED,false);hint.setPadding(0,Ui.dp(this,12),0,0);root.addView(hint);
        setContentView(root);root.requestApplyInsets();
    }

    private void register(){IntentFilter filter=new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);ContextCompat.registerReceiver(this,receiver,filter,ContextCompat.RECEIVER_EXPORTED);registered=true;}

    private void check(){
        stopPolling();loading.setVisibility(View.VISIBLE);loading.setIndeterminate(true);action.setEnabled(false);cancel.setVisibility(View.GONE);status.setText("正在检查更新…");detail.setText("");
        worker.submit(()->{try{UpdateClient.Info value=UpdateClient.check(this);runOnUiThread(()->{if(!destroyed)show(value);});}catch(Exception e){runOnUiThread(()->{if(destroyed)return;loading.setVisibility(View.GONE);status.setText("检查更新失败");detail.setText("请检查网络后重试");retryCheckButton();});}});
    }

    private void show(UpdateClient.Info value){
        info=value;loading.setVisibility(View.GONE);notes.setText(value.notes);
        int savedCode=prefs().getInt(P_CODE,-1);
        if(downloadId>=0&&savedCode>0&&savedCode!=value.versionCode)cancelCurrent(false);
        if(!UpdateClient.newer(this,value)){status.setText("当前已是最新版本");detail.setText(value.versionName);retryCheckButton();return;}
        status.setText("发现新版本 · "+value.versionName);detail.setText("准备下载更新");
        File existing=target();String savedSha=prefs().getString(P_SHA,"");
        if(existing.isFile()&&value.sha256.equalsIgnoreCase(savedSha)){verifyDownloaded();return;}
        downloadId=prefs().getLong(P_DOWNLOAD,-1);
        if(downloadId>=0){startPolling();updateDownloadState();return;}
        readyDownloadButton("下载并更新");
    }

    private void retryCheckButton(){action.setText("重新检查");action.setEnabled(true);action.setOnClickListener(v->check());cancel.setVisibility(View.GONE);}
    private void readyDownloadButton(String label){loading.setVisibility(View.GONE);action.setText(label);action.setEnabled(info!=null);action.setOnClickListener(v->download());cancel.setVisibility(View.GONE);}

    private File target(){File dir=getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);if(dir==null)dir=getFilesDir();dir.mkdirs();return new File(dir,"Pica-Library-Android-Preview.apk");}

    private void download(){
        if(info==null)return;stopPolling();File file=target();if(file.exists())file.delete();
        try{
            DownloadManager.Request request=new DownloadManager.Request(Uri.parse(info.apkUrl));request.setTitle("Pica Library 更新 "+info.versionName);request.setDescription("正在下载更新");request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);request.setAllowedOverMetered(true);request.setAllowedOverRoaming(false);request.setDestinationUri(Uri.fromFile(file));
            DownloadManager manager=(DownloadManager)getSystemService(DOWNLOAD_SERVICE);downloadId=manager.enqueue(request);lastBytes=-1;lastProgressAt=System.currentTimeMillis();prefs().edit().putString(P_SHA,info.sha256).putInt(P_CODE,info.versionCode).putString(P_NAME,info.versionName).putLong(P_DOWNLOAD,downloadId).putLong(P_LAST_BYTES,lastBytes).putLong(P_LAST_PROGRESS,lastProgressAt).apply();status.setText("正在下载更新");detail.setText("等待系统下载服务…");action.setText("下载中");action.setEnabled(false);cancel.setText("取消下载");cancel.setVisibility(View.VISIBLE);startPolling();
        }catch(Exception e){clearDownloadState(false);status.setText("无法启动下载");detail.setText(e.getMessage()==null?"请稍后重试":e.getMessage());readyDownloadButton("重新下载");}
    }

    private void startPolling(){handler.removeCallbacks(poll);handler.post(poll);}
    private void stopPolling(){handler.removeCallbacks(poll);}

    private DownloadState query(long id){
        DownloadManager manager=(DownloadManager)getSystemService(DOWNLOAD_SERVICE);Cursor cursor=null;
        try{cursor=manager.query(new DownloadManager.Query().setFilterById(id));if(cursor==null||!cursor.moveToFirst())return new DownloadState(false,0,0,0,0);int si=cursor.getColumnIndex(DownloadManager.COLUMN_STATUS),ri=cursor.getColumnIndex(DownloadManager.COLUMN_REASON),bi=cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR),ti=cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);return new DownloadState(true,si<0?0:cursor.getInt(si),ri<0?0:cursor.getInt(ri),bi<0?0:cursor.getLong(bi),ti<0?-1:cursor.getLong(ti));}catch(Exception e){return new DownloadState(false,0,0,0,0);}finally{if(cursor!=null)cursor.close();}
    }

    private void updateDownloadState(){
        if(downloadId<0)return;DownloadState d=query(downloadId);
        if(!d.found){stopPolling();clearDownloadState(false);status.setText("下载任务已失效");detail.setText("系统已找不到原下载任务，可以重新开始");readyDownloadButton("重新下载");return;}
        if(d.status==DownloadManager.STATUS_SUCCESSFUL){stopPolling();verifyDownloaded();return;}
        if(d.status==DownloadManager.STATUS_FAILED){stopPolling();String reason=reasonText(d.status,d.reason);clearDownloadState(true);status.setText("下载失败");detail.setText(reason);readyDownloadButton("重新下载");return;}

        long now=System.currentTimeMillis();if(d.bytes>lastBytes){lastBytes=d.bytes;lastProgressAt=now;prefs().edit().putLong(P_LAST_BYTES,lastBytes).putLong(P_LAST_PROGRESS,lastProgressAt).apply();}
        if(lastProgressAt<=0){lastProgressAt=now;prefs().edit().putLong(P_LAST_PROGRESS,lastProgressAt).apply();}
        boolean stalled=(d.status==DownloadManager.STATUS_RUNNING||d.status==DownloadManager.STATUS_PENDING)&&now-lastProgressAt>STALL_MS;
        loading.setVisibility(View.VISIBLE);cancel.setVisibility(View.VISIBLE);action.setEnabled(false);
        if(d.total>0){loading.setIndeterminate(false);int pct=(int)Math.max(0,Math.min(100,(d.bytes*100L)/d.total));loading.setProgress(pct);detail.setText(formatBytes(d.bytes)+" / "+formatBytes(d.total)+" · "+pct+"%");}else{loading.setIndeterminate(true);detail.setText(d.bytes>0?"已下载 "+formatBytes(d.bytes):reasonText(d.status,d.reason));}
        if(stalled){status.setText("下载长时间没有进度");detail.setText((d.total>0?detail.getText()+" · ":"")+"可以终止错误任务并重新开始");action.setText("终止并重新开始");action.setEnabled(true);action.setOnClickListener(v->cancelCurrent(true));cancel.setText("取消下载");return;}
        if(d.status==DownloadManager.STATUS_PENDING){status.setText("等待开始下载");if(d.bytes==0)detail.setText(reasonText(d.status,d.reason));}
        else if(d.status==DownloadManager.STATUS_PAUSED){status.setText("下载已暂停");detail.setText(reasonText(d.status,d.reason));action.setText("终止并重新开始");action.setEnabled(true);action.setOnClickListener(v->cancelCurrent(true));}
        else status.setText("正在下载更新");
        if(d.status!=DownloadManager.STATUS_PAUSED){action.setText("下载中");action.setEnabled(false);}cancel.setText("取消下载");
    }

    private String reasonText(int status,int reason){
        if(status==DownloadManager.STATUS_PENDING)return "等待系统下载服务或网络";
        if(status==DownloadManager.STATUS_RUNNING)return "正在下载";
        if(status==DownloadManager.STATUS_PAUSED){if(reason==DownloadManager.PAUSED_WAITING_TO_RETRY)return "网络异常，系统正在等待重试";if(reason==DownloadManager.PAUSED_WAITING_FOR_NETWORK)return "等待可用网络";if(reason==DownloadManager.PAUSED_QUEUED_FOR_WIFI)return "等待 Wi‑Fi";return "系统暂停了下载任务";}
        if(status==DownloadManager.STATUS_FAILED){if(reason==DownloadManager.ERROR_INSUFFICIENT_SPACE)return "设备存储空间不足";if(reason==DownloadManager.ERROR_CANNOT_RESUME)return "下载无法继续，需要重新开始";if(reason==DownloadManager.ERROR_DEVICE_NOT_FOUND)return "下载存储位置不可用";if(reason==DownloadManager.ERROR_FILE_ERROR)return "写入更新文件失败";if(reason==DownloadManager.ERROR_TOO_MANY_REDIRECTS)return "下载地址重定向次数过多";if(reason==DownloadManager.ERROR_HTTP_DATA_ERROR)return "下载连接中断";if(reason==DownloadManager.ERROR_UNHANDLED_HTTP_CODE)return "服务器返回异常状态";return "系统下载服务报告错误 "+reason;}
        return "等待下载状态更新";
    }

    private String formatBytes(long value){if(value<0)return "未知";if(value<1024)return value+" B";if(value<1024L*1024)return String.format(Locale.ROOT,"%.1f KB",value/1024.0);return String.format(Locale.ROOT,"%.2f MB",value/1024.0/1024.0);}

    private void cancelCurrent(boolean restart){
        long id=downloadId;if(id>=0)try{((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).remove(id);}catch(Exception ignored){}stopPolling();clearDownloadState(true);status.setText(restart?"正在重新开始…":"下载已取消");detail.setText("");if(restart&&info!=null)handler.postDelayed(this::download,250);else readyDownloadButton("重新下载");
    }

    private void clearDownloadState(boolean deleteFile){downloadId=-1;lastBytes=-1;lastProgressAt=0;prefs().edit().remove(P_DOWNLOAD).remove(P_LAST_BYTES).remove(P_LAST_PROGRESS).apply();if(deleteFile){File f=target();if(f.exists())f.delete();}}

    private void verifyDownloaded(){
        File file=target();String sha=prefs().getString(P_SHA,"");int expectedCode=prefs().getInt(P_CODE,-1);if(!file.isFile()||sha.isEmpty()){clearDownloadState(false);readyDownloadButton("重新下载");return;}loading.setVisibility(View.VISIBLE);loading.setIndeterminate(true);status.setText("下载完成，正在验证更新包…");detail.setText("正在校验 SHA-256、包名、版本号和签名");cancel.setVisibility(View.GONE);action.setEnabled(false);
        worker.submit(()->{try{if(!UpdateClient.verify(file,sha))throw new IllegalStateException("SHA-256 mismatch");UpdateClient.verifyPackage(getApplicationContext(),file,expectedCode);runOnUiThread(()->{if(destroyed)return;loading.setVisibility(View.GONE);loading.setIndeterminate(false);loading.setProgress(100);clearDownloadState(false);status.setText("更新已准备好");detail.setText("验证通过，可以安装");action.setText("安装更新");action.setEnabled(true);action.setOnClickListener(v->install(file));});}catch(Exception e){runOnUiThread(()->{if(destroyed)return;file.delete();clearDownloadState(false);loading.setVisibility(View.GONE);status.setText("更新包验证失败");detail.setText("已删除异常文件，请重新下载");readyDownloadButton("重新下载");});}});
    }

    private void install(File file){if(Build.VERSION.SDK_INT>=26&&!getPackageManager().canRequestPackageInstalls()){new AlertDialog.Builder(this).setTitle("允许安装更新").setMessage("请允许 Pica Library 安装下载的更新。返回后再次点击“安装更新”即可。") .setNegativeButton("取消",null).setPositiveButton("打开设置",(d,w)->startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getPackageName())))).show();return;}Uri uri=FileProvider.getUriForFile(this,getPackageName()+".files",file);Intent intent=new Intent(Intent.ACTION_VIEW);intent.setDataAndType(uri,"application/vnd.android.package-archive");intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_ACTIVITY_NEW_TASK);startActivity(intent);}

    @Override protected void onResume(){super.onResume();if(action==null)return;downloadId=prefs().getLong(P_DOWNLOAD,downloadId);if(downloadId>=0){startPolling();updateDownloadState();return;}File file=target();String sha=prefs().getString(P_SHA,"");if(file.isFile()&&!sha.isEmpty())verifyDownloaded();}
    @Override protected void onDestroy(){destroyed=true;stopPolling();if(registered)try{unregisterReceiver(receiver);}catch(Exception ignored){}worker.shutdownNow();super.onDestroy();}
}
