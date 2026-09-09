package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.util.Locale;

/** User-facing cache, prefetch, portable-data and future phone-download storage settings. */
public final class StorageSettingsActivity extends Activity {
    private static final int PICK_DOWNLOAD_TREE=401;
    private LinearLayout content;

    @Override public void onCreate(Bundle saved){super.onCreate(saved);getWindow().setStatusBarColor(Ui.BG);getWindow().setNavigationBarColor(Ui.BG);render();}

    private Button button(String label,android.view.View.OnClickListener action){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextColor(Ui.PRIMARY);b.setOnClickListener(action);return b;}
    private void render(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);Button back=button("‹ 返回",v->finish());bar.addView(back);TextView title=Ui.text(this,"存储与预加载",22,Ui.TEXT,true);bar.addView(title,new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,12),Ui.dp(this,8),Ui.dp(this,12),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();renderContent();
    }
    private void renderContent(){
        content.removeAllViews();StoragePolicy.Usage usage=StoragePolicy.usage(this);
        LinearLayout summary=Ui.card(this);summary.addView(Ui.text(this,"当前占用",18,Ui.TEXT,true));summary.addView(Ui.text(this,"阅读页 "+fmt(usage.pages)+" · 封面 "+fmt(usage.covers)+" · 元数据 "+fmt(usage.metadata)+"\n合计 "+fmt(usage.total),13,Ui.MUTED,false));content.addView(summary);

        LinearLayout pages=Ui.card(this);pages.addView(Ui.text(this,"阅读页缓存",18,Ui.TEXT,true));pages.addView(Ui.text(this,"上限："+StorageSettings.limitLabel(StorageSettings.pageMb(this))+" · 达到上限后按最近最少使用 LRU 自动清理。主动下载到手机的漫画不属于缓存，不会被这里删除。",13,Ui.MUTED,false));pages.addView(button("调整阅读页缓存上限",v->chooseLong("阅读页缓存上限",StorageSettings.PAGE_MB,StorageSettings.pageMb(this),value->{StorageSettings.setPageMb(this,value);renderContent();})));content.addView(pages);

        LinearLayout covers=Ui.card(this);covers.addView(Ui.text(this,"封面缓存",18,Ui.TEXT,true));covers.addView(Ui.text(this,"上限："+StorageSettings.limitLabel(StorageSettings.coverMb(this))+"。Desktop、WebDAV 和后续 Pica 封面会逐步收敛到同一封面缓存策略。",13,Ui.MUTED,false));covers.addView(button("调整封面缓存上限",v->chooseLong("封面缓存上限",StorageSettings.COVER_MB,StorageSettings.coverMb(this),value->{StorageSettings.setCoverMb(this,value);renderContent();})));content.addView(covers);

        LinearLayout prefetch=Ui.card(this);prefetch.addView(Ui.text(this,"阅读预加载",18,Ui.TEXT,true));prefetch.addView(Ui.text(this,"当前：提前 "+StorageSettings.prefetchPages(this)+" 页。预加载使用低优先级队列，当前页始终优先；快速跳页时旧预加载目标会被淘汰。",13,Ui.MUTED,false));prefetch.addView(button("调整预加载页数",v->choosePrefetch()));content.addView(prefetch);

        LinearLayout roots=Ui.card(this);roots.addView(Ui.text(this,"手机数据与缓存位置",18,Ui.TEXT,true));roots.addView(Ui.text(this,"统一目录、收藏和书架："+(StorageSettings.dataExternal(this)?"应用外部存储":"应用内部存储")+"\n阅读缓存："+(StorageSettings.cacheExternal(this)?"应用外部存储":"应用内部存储")+"\n账号凭据和安全配置始终保存在应用内部存储。",13,Ui.MUTED,false));
        roots.addView(button("切换目录数据库位置",v->chooseDataRoot()));roots.addView(button("切换缓存位置",v->chooseCacheRoot()));content.addView(roots);

        LinearLayout downloads=Ui.card(this);downloads.addView(Ui.text(this,"手机下载目录",18,Ui.TEXT,true));String tree=StorageSettings.downloadTreeUri(this);downloads.addView(Ui.text(this,tree.isEmpty()?"尚未选择。后续 Pica 手机下载会要求先选择一个持久目录。":"已选择："+tree,12,Ui.MUTED,false));downloads.addView(button("选择手机下载文件夹",v->pickDownloadTree()));content.addView(downloads);

        LinearLayout clean=Ui.card(this);clean.addView(Ui.text(this,"清理",18,Ui.TEXT,true));LinearLayout row=new LinearLayout(this);row.addView(button("清阅读页",v->{StoragePolicy.clearPages(this);renderContent();}),new LinearLayout.LayoutParams(0,-2,1));row.addView(button("清封面",v->{StoragePolicy.clearCovers(this);renderContent();}),new LinearLayout.LayoutParams(0,-2,1));clean.addView(row);clean.addView(button("清元数据缓存",v->new AlertDialog.Builder(this).setTitle("清理元数据缓存？").setMessage("会清除可重新获取的本地目录/收藏/书架缓存，但不会删除 WebDAV 漫画、账号或密码。重新刷新后会恢复。") .setNegativeButton("取消",null).setPositiveButton("清理",(d,w)->{StoragePolicy.clearMetadata(this);renderContent();}).show()));content.addView(clean);
    }

    private interface LongChoice{void selected(long value);}
    private void chooseLong(String title,long[] values,long current,LongChoice choice){String[] labels=new String[values.length];int selected=0;for(int i=0;i<values.length;i++){labels[i]=StorageSettings.limitLabel(values[i]);if(values[i]==current)selected=i;}final int initial=selected;new AlertDialog.Builder(this).setTitle(title).setSingleChoiceItems(labels,selected,null).setNegativeButton("取消",null).setPositiveButton("保存",(d,w)->{AlertDialog dialog=(AlertDialog)d;int index=dialog.getListView().getCheckedItemPosition();if(index<0)index=initial;choice.selected(values[index]);}).show();}
    private void choosePrefetch(){int[] values=StorageSettings.PREFETCH;String[] labels=new String[values.length];int selected=0;int current=StorageSettings.prefetchPages(this);for(int i=0;i<values.length;i++){labels[i]=values[i]==0?"关闭":values[i]+" 页";if(values[i]==current)selected=i;}final int initial=selected;new AlertDialog.Builder(this).setTitle("页面预加载").setSingleChoiceItems(labels,selected,null).setNegativeButton("取消",null).setPositiveButton("保存",(d,w)->{int index=((AlertDialog)d).getListView().getCheckedItemPosition();if(index<0)index=initial;StorageSettings.setPrefetchPages(this,values[index]);renderContent();}).show();}
    private void chooseDataRoot(){if(!MobileStoragePaths.externalAvailable(this)){Toast.makeText(this,"当前设备没有可用的应用外部存储",Toast.LENGTH_LONG).show();return;}String[] labels={"应用内部存储（推荐，最稳定）","应用外部存储（便于释放内部空间）"};int selected=StorageSettings.dataExternal(this)?1:0;new AlertDialog.Builder(this).setTitle("目录数据库位置").setMessage("这里只迁移统一目录、收藏和书架等可移植数据库；账号凭据不会移动。") .setSingleChoiceItems(labels,selected,null).setNegativeButton("取消",null).setPositiveButton("迁移",(d,w)->{int index=((AlertDialog)d).getListView().getCheckedItemPosition();try{MobileStoragePaths.migrateDataRoot(this,index==1);renderContent();}catch(Exception e){Toast.makeText(this,"迁移失败："+e.getMessage(),Toast.LENGTH_LONG).show();}}).show();}
    private void chooseCacheRoot(){if(!MobileStoragePaths.externalAvailable(this)){Toast.makeText(this,"当前设备没有可用的应用外部存储",Toast.LENGTH_LONG).show();return;}String[] labels={"应用内部存储","应用外部存储"};int selected=StorageSettings.cacheExternal(this)?1:0;new AlertDialog.Builder(this).setTitle("缓存位置").setMessage("切换后新缓存写入新位置；旧缓存不会自动复制，可按需清理。") .setSingleChoiceItems(labels,selected,null).setNegativeButton("取消",null).setPositiveButton("保存",(d,w)->{int index=((AlertDialog)d).getListView().getCheckedItemPosition();StorageSettings.setCacheExternal(this,index==1);renderContent();}).show();}
    private void pickDownloadTree(){Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);startActivityForResult(intent,PICK_DOWNLOAD_TREE);}
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);if(requestCode!=PICK_DOWNLOAD_TREE||resultCode!=RESULT_OK||data==null||data.getData()==null)return;Uri uri=data.getData();int flags=data.getFlags()&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);try{getContentResolver().takePersistableUriPermission(uri,flags);}catch(Exception ignored){}StorageSettings.setDownloadTreeUri(this,uri.toString());renderContent();}
    private String fmt(long value){if(value<1024)return value+" B";if(value<1024L*1024)return String.format(Locale.ROOT,"%.1f KB",value/1024.0);if(value<1024L*1024*1024)return String.format(Locale.ROOT,"%.1f MB",value/1024.0/1024.0);return String.format(Locale.ROOT,"%.2f GB",value/1024.0/1024.0/1024.0);}
}
