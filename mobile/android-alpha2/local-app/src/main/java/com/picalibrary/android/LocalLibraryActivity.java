package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Explicit SAF import -> original LocalComicStore preview/commit -> original Reader.
 * Separate app identity and storage; no second importer, reader, account or source SDK.
 */
public final class LocalLibraryActivity extends Activity {
    private static final int PICK_FOLDER=7101, PICK_CBZ=7102;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final ArrayList<LocalComicReaderPort.Book> books=new ArrayList<>();
    private volatile boolean destroyed, cancelImport;
    private LocalComicStore.Preview pending;
    private Button folderButton,cbzButton,cancelButton;
    private TextView status;
    private ProgressBar indicator,pageProgress;
    private ArrayAdapter<LocalComicReaderPort.Book> adapter;
    private boolean busy;

    private String copy(String zh,String en,String ja){return LocalCopy.ui(this,zh,en,ja);}
    private int dp(int number){return Math.round(number*getResources().getDisplayMetrics().density);}
    private TextView label(String value,int size){
        TextView label=new TextView(this);
        label.setText(value);
        label.setTextColor(Color.WHITE);
        label.setTextSize(size);
        return label;
    }
    private Button action(String value){
        Button button=new Button(this);
        button.setText(value);
        button.setAllCaps(false);
        return button;
    }

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16),dp(20),dp(16),dp(12));
        root.setBackgroundColor(Color.rgb(20,20,26));
        root.setOnApplyWindowInsetsListener((view,insets)->{
            view.setPadding(dp(16),insets.getSystemWindowInsetTop()+dp(12),
                            dp(16),insets.getSystemWindowInsetBottom()+dp(12));
            return insets;
        });
        TextView title=label(copy("本地漫画书库","Local library","ローカル書庫"),22);
        root.addView(title);
        TextView description=label(copy(
            "仅管理本应用导入的文件；不需要账号或网络。",
            "Only imported files in this app; no account or network.",
            "このアプリに取り込んだファイルのみ。アカウントや通信は不要です。"),12);
        description.setPadding(0,dp(6),0,dp(12));
        root.addView(description);

        LinearLayout actions=new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        folderButton=action(copy("导入文件夹","Import folder","フォルダー取込"));
        cbzButton=action(copy("导入 CBZ","Import CBZ","CBZ 取込"));
        actions.addView(folderButton,new LinearLayout.LayoutParams(0,dp(52),1));
        actions.addView(cbzButton,new LinearLayout.LayoutParams(0,dp(52),1));
        root.addView(actions);
        LinearLayout localSections=new LinearLayout(this);
        Button historyButton=action(copy("阅读历史","History","閲覧履歴"));
        Button shelvesButton=action(copy("书架","Shelves","本棚"));
        localSections.addView(shelvesButton,new LinearLayout.LayoutParams(0,dp(48),1));
        localSections.addView(historyButton,new LinearLayout.LayoutParams(0,dp(48),1));
        root.addView(localSections);
        historyButton.setOnClickListener(v->startActivity(new Intent(this,LocalHistoryActivity.class)));
        shelvesButton.setOnClickListener(v->startActivity(new Intent(this,LocalShelvesActivity.class)));
        folderButton.setOnClickListener(v->choose(PICK_FOLDER));
        cbzButton.setOnClickListener(v->choose(PICK_CBZ));

        LinearLayout taskBar=new LinearLayout(this);
        taskBar.setGravity(android.view.Gravity.CENTER_VERTICAL);
        indicator=new ProgressBar(this);
        indicator.setIndeterminate(true);
        taskBar.addView(indicator,new LinearLayout.LayoutParams(dp(28),dp(28)));
        status=label(copy("读取书库中…","Loading library…","書庫を読み込み中…"),13);
        status.setPadding(dp(8),dp(10),dp(8),dp(10));
        taskBar.addView(status,new LinearLayout.LayoutParams(0,-2,1));
        cancelButton=action(copy("取消","Cancel","キャンセル"));
        taskBar.addView(cancelButton);
        cancelButton.setOnClickListener(v->{
            if(!busy)return;
            cancelImport=true;
            cancelButton.setEnabled(false);
            status.setText(copy("正在取消导入…","Cancelling import…","取り込みを中止中…"));
        });
        root.addView(taskBar);
        // Reuse the original importer's per-page callback; keep the spinner for
        // SAF inventory and CBZ staging, and show determinate copy progress.
        pageProgress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
        pageProgress.setVisibility(View.GONE);
        root.addView(pageProgress,new LinearLayout.LayoutParams(-1,dp(4)));

        ListView list=new ListView(this);
        list.setDividerHeight(dp(1));
        adapter=new ArrayAdapter<LocalComicReaderPort.Book>(this,android.R.layout.simple_list_item_1,books){
            @Override public View getView(int position,View convertView,ViewGroup parent){
                TextView item=convertView instanceof TextView?(TextView)convertView:label("",16);
                LocalComicReaderPort.Book book=getItem(position);
                if(book!=null)item.setText(book.title+"\n"+book.pageCount+
                    copy(" 页 · 点击阅读，长按删除"," pages · Tap to read; hold to remove",
                         " ページ · タップで読む、長押しで削除"));
                item.setPadding(dp(10),dp(13),dp(10),dp(13));
                item.setMinHeight(dp(64));
                return item;
            }
        };
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent,view,position,id)->{
            if(busy||position<0||position>=books.size())return;
            LocalComicReaderPort.Book book=books.get(position);
            Intent open=new Intent(this,LocalReaderActivity.class);
            open.putExtra("source","local");
            open.putExtra("comicId",book.id);
            open.putExtra("title",book.title);
            startActivity(open);
        });
        list.setOnItemLongClickListener((parent,view,position,id)->{
            if(busy||position<0||position>=books.size())return true;
            LocalComicReaderPort.Book book=books.get(position);
            new AlertDialog.Builder(this)
                .setTitle(copy("删除此本地副本？","Remove local copy?","ローカルコピーを削除しますか？"))
                .setMessage(book.title)
                .setNegativeButton(android.R.string.cancel,null)
                .setPositiveButton(copy("删除","Remove","削除"),(dialog,which)->remove(book.id)).show();
            return true;
        });
        root.addView(list,new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);
        setWorking(false,false);
        refresh();
    }

    @Override protected void onResume(){
        super.onResume();
        if(adapter!=null&&!busy&&pending==null)refresh();
    }

    private void setWorking(boolean working,boolean canCancel){
        busy=working;
        folderButton.setEnabled(!working&&pending==null);
        cbzButton.setEnabled(!working&&pending==null);
        indicator.setVisibility(working?View.VISIBLE:View.GONE);
        if(!working)pageProgress.setVisibility(View.GONE);
        cancelButton.setVisibility(working&&canCancel?View.VISIBLE:View.GONE);
        cancelButton.setEnabled(canCancel);
    }

    private void choose(int request){
        if(busy||pending!=null)return;
        Intent picker;
        if(request==PICK_FOLDER){
            picker=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        }else{
            picker=new Intent(Intent.ACTION_OPEN_DOCUMENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType("*/*");
        }
        picker.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(picker,request);
    }

    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(result!=RESULT_OK||data==null||data.getData()==null||busy||pending!=null)return;
        if(request!=PICK_FOLDER&&request!=PICK_CBZ)return;
        startImport(data.getData(),request==PICK_FOLDER?"folder":"cbz");
    }

    private void refresh(){
        worker.execute(()->{
            List<LocalComicReaderPort.Book> found=new LocalComicReaderPort(getApplicationContext()).books();
            found.sort(Comparator.comparing((LocalComicReaderPort.Book b)->b.updatedAt).reversed());
            runOnUiThread(()->{
                if(destroyed)return;
                books.clear();
                books.addAll(found);
                adapter.notifyDataSetChanged();
                if(!busy&&pending==null)status.setText(found.isEmpty()?
                    copy("书库为空，选择文件夹或 CBZ 导入。","Empty library. Import a folder or CBZ.",
                         "書庫は空です。フォルダーか CBZ を取り込んでください。"):
                    copy("本地作品：","Imported comics:","取込済み作品：")+found.size());
            });
        });
    }

    private void startImport(Uri uri,String kind){
        cancelImport=false;
        pageProgress.setVisibility(View.GONE);
        setWorking(true,true);
        status.setText(copy("正在导入并检查图片…","Importing and checking pages…",
                            "ページを取り込み・確認中…"));
        worker.execute(()->{
            LocalComicStore.Preview staged=null;
            try{
                staged=LocalComicStore.prepare(getApplicationContext(),uri,kind,()->{
                    if(cancelImport||destroyed||Thread.currentThread().isInterrupted())
                        throw new IOException("Import cancelled");
                },(complete,total)->{
                    if(complete!=1&&complete!=total&&complete%8!=0)return;
                    runOnUiThread(()->{
                        if(destroyed||cancelImport||pending!=null||!busy)return;
                        pageProgress.setVisibility(View.VISIBLE);
                        pageProgress.setMax(total);
                        pageProgress.setProgress(complete);
                        status.setText(copy("正在导入图片 ","Importing pages ","画像を取り込み中 ")+complete+"/"+total);
                    });
                });
                LocalComicStore.Preview ready=staged;
                staged=null;
                runOnUiThread(()->{
                    if(destroyed){ready.close();return;}
                    pending=ready;
                    setWorking(false,false);
                    new AlertDialog.Builder(this)
                        .setTitle(copy("确认导入？","Import this comic?","取り込みますか？"))
                        .setMessage(ready.title)
                        .setNegativeButton(android.R.string.cancel,(dialog,which)->discard(ready))
                        .setOnCancelListener(dialog->discard(ready))
                        .setPositiveButton(copy("保存到书库","Save to library","書庫に保存"),
                            (dialog,which)->commit(ready))
                        .show();
                });
            }catch(Exception error){
                String message=error.getMessage();
                runOnUiThread(()->{
                    if(destroyed)return;
                    setWorking(false,false);
                    status.setText(cancelImport?
                        copy("导入已取消","Import cancelled","取込を中止しました"):
                        copy("导入失败：","Import failed: ","取込失敗：")+
                        (message==null?"":message.substring(0,Math.min(180,message.length()))));
                });
            }finally{if(staged!=null)staged.close();}
        });
    }

    private void discard(LocalComicStore.Preview ready){
        if(pending==ready)pending=null;
        ready.close();
        setWorking(false,false);
        status.setText(copy("已取消保存","Save cancelled","保存を中止しました"));
    }

    private void commit(LocalComicStore.Preview ready){
        pending=null;
        pageProgress.setVisibility(View.GONE);
        setWorking(true,false);
        status.setText(copy("正在保存到书库…","Saving comic…","書庫に保存中…"));
        worker.execute(()->{
            try{
                LocalComicStore.confirm(getApplicationContext(),ready,()->{
                    if(destroyed||Thread.currentThread().isInterrupted())
                        throw new IOException("Import interrupted");
                });
                runOnUiThread(()->{
                    if(destroyed)return;
                    setWorking(false,false);
                    status.setText(copy("导入完成","Import complete","取込が完了しました"));
                    refresh();
                });
            }catch(Exception error){
                String message=error.getMessage();
                runOnUiThread(()->{
                    if(destroyed)return;
                    setWorking(false,false);
                    status.setText(copy("保存失败：","Save failed: ","保存失敗：")+
                        (message==null?"":message.substring(0,Math.min(180,message.length()))));
                });
            }finally{ready.close();}
        });
    }

    private void remove(String comicId){
        pageProgress.setVisibility(View.GONE);
        setWorking(true,false);
        status.setText(copy("正在删除本地副本…","Removing local copy…","ローカルコピーを削除中…"));
        worker.execute(()->{
            try{
                LocalComicStore.remove(getApplicationContext(),comicId);
                runOnUiThread(()->{
                    if(destroyed)return;
                    setWorking(false,false);
                    refresh();
                });
            }catch(Exception error){
                runOnUiThread(()->{
                    if(destroyed)return;
                    setWorking(false,false);
                    status.setText(copy("删除失败","Remove failed","削除できませんでした"));
                });
            }
        });
    }

    @Override protected void onDestroy(){
        destroyed=true;
        cancelImport=true;
        if(pending!=null){pending.close();pending=null;}
        worker.shutdownNow();
        super.onDestroy();
    }
}
