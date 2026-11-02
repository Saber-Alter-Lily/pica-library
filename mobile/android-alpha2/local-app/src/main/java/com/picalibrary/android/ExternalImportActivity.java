package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.picalibrary.android.local.LocalComicImporter;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * First-party signed companion -> SOURCE-FREE original local library.
 * The host process supplies authenticated image bytes through Binder only.
 * The existing LocalComicStore validates/copies them inside THIS app identity.
 * There is no internet permission, new importer, alternate library or DB.
 */
public final class ExternalImportActivity extends Activity {
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private BoundSourceClient client;
    private TextView status;
    private Button select,read;
    private volatile boolean cancelled,busy;
    private String comic,title;
    private LocalComicStore.Comic saved;

    private String t(String zh,String en,String ja){return LocalCopy.ui(this,zh,en,ja);}
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private TextView text(String label,int sp){
        TextView v=new TextView(this);v.setText(label);v.setTextSize(sp);
        v.setTextColor(Color.WHITE);return v;
    }
    private Button button(LinearLayout root,String title){
        Button result=new Button(this);result.setText(title);result.setAllCaps(false);
        root.addView(result,new LinearLayout.LayoutParams(-1,dp(54)));return result;
    }
    private void busy(boolean state){
        busy=state;select.setEnabled(!state);read.setEnabled(!state&&saved!=null);
    }
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        comic=getIntent().getStringExtra("comicId");
        title=getIntent().getStringExtra("title");
        String scope=getIntent().getStringExtra("scope");
        if(comic==null||!comic.matches("hosted:[0-9a-f-]{36}:[0-9a-f]{64}")||
                title==null||title.isEmpty()||title.length()>500){
            finish();return;
        }
        try{client=new BoundSourceClient(this,scope);}
        catch(IllegalArgumentException invalid){finish();return;}
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(20,20,26));
        root.setPadding(dp(16),dp(26),dp(16),dp(16));
        root.addView(text(t("保存到原阅读器书库","Save to original Reader",
            "元の Reader に保存"),23));
        root.addView(text(title,17));
        root.addView(text(t(
            "只会复制你明确选择的一章。原书库、书架和阅读记录继续属于本应用；无需开放网络权限。",
            "Only the selected authorized chapter is copied to THIS Reader library. No network permission or separate database.",
            "選択した章だけこの Reader のローカル書庫へ保存します。通信権限は不要です。"),13));
        select=button(root,t("选择要保存的章节","Choose chapter to save","保存する章を選択"));
        read=button(root,t("阅读已保存的本地副本","Read saved local copy","保存済みの作品を読む"));
        read.setEnabled(false);
        status=text(t("尚未请求章节","No chapter requested yet","章をまだ取得していません"),13);
        root.addView(status);
        Button back=button(root,t("返回","Back","戻る"));
        back.setOnClickListener(v->finish());
        setContentView(root);
        select.setOnClickListener(v->selectChapter());
        read.setOnClickListener(v->{
            LocalComicStore.Comic local=saved;
            if(local!=null)startActivity(new Intent(this,LocalReaderActivity.class)
                .putExtra("source","local").putExtra("comicId",local.id)
                .putExtra("title",local.title));
        });
    }
    private void selectChapter(){
        if(busy||cancelled)return;
        busy(true);status.setText(t("读取当前授权的章节…","Loading authorized chapters…",
            "許可された章を取得中…"));
        executor.submit(()->{
            List<ReaderContent.Chapter> chapters=null;
            try{chapters=client.chapters(comic);}catch(Exception ignored){}
            List<ReaderContent.Chapter> result=chapters;
            runOnUiThread(()->{
                if(cancelled)return;
                busy(false);
                if(result==null||result.isEmpty()){
                    status.setText(t("来源不可用或会话已过期","Session expired or source unavailable",
                        "ソースまたはセッションが無効です"));return;
                }
                String[] labels=new String[result.size()];
                for(int i=0;i<labels.length;i++)labels[i]=result.get(i).title;
                new AlertDialog.Builder(this)
                    .setTitle(t("选择一章","Select one chapter","1章を選択"))
                    .setItems(labels,(d,idx)->confirmSave(result.get(idx)))
                    .setNegativeButton(android.R.string.cancel,null).show();
            });
        });
    }
    private void confirmSave(ReaderContent.Chapter chapter){
        if(busy||cancelled)return;
        new AlertDialog.Builder(this)
            .setTitle(t("确认保存到本地书库？","Save to this local library?",
                "ローカル書庫に保存しますか"))
            .setMessage(title+" · "+chapter.title+"\n"+t(
                "此操作需要已授权的 Host 会话。保存的文件经原导入器校验，不会修改 Host 收藏。",
                "Requires your authorized Host session. Original importer validates every image; Host favorites remain unchanged.",
                "許可された接続が必要。元のインポーターで画像を確認します。"))
            .setNegativeButton(android.R.string.cancel,null)
            .setPositiveButton(t("保存这一章","Save this chapter","この章を保存"),
                (d,w)->saveChapter(chapter))
            .show();
    }
    private void saveChapter(ReaderContent.Chapter chapter){
        if(cancelled||busy)return;
        busy(true);status.setText(t("保存中…","Saving chapter…","保存中…"));
        executor.submit(()->{
            LocalComicStore.Comic result=null;
            try{
                ReaderContent.ChapterData contents=client.chapter(comic,chapter.id);
                if(contents.pages.isEmpty()||
                        contents.pages.size()>LocalComicImporter.MAX_PAGES)
                    throw new IOException("SOURCE_HOST_TOO_LARGE");
                List<LocalComicImporter.Open> streams=new ArrayList<>();
                for(ReaderContent.Page page:contents.pages){
                    streams.add(()->{
                        HttpURLConnection connection=null;
                        try{
                            connection=client.image(page.url);
                            if(connection.getResponseCode()!=200)
                                throw new IOException("SOURCE_HOST_UNAVAILABLE");
                            InputStream input=connection.getInputStream();
                            HttpURLConnection owned=connection;
                            return new FilterInputStream(input){
                                private boolean closed;
                                @Override public void close()throws IOException{
                                    if(closed)return;
                                    closed=true;
                                    try{super.close();}finally{owned.disconnect();}
                                }
                            };
                        }catch(Exception failure){
                            if(connection!=null)connection.disconnect();
                            throw new IOException("SOURCE_HOST_SAVE_FAILED");
                        }
                    });
                }
                String identity=LocalComicImporter.identity(DeviceIdentity.id(this),
                    "folder","signed-source-chapter-v1\n"+comic+"\n"+chapter.id);
                String label=truncate(title,120)+" · "+truncate(contents.episode.title,70);
                LocalComicImporter.Cancellation check=()->{
                    if(cancelled||Thread.currentThread().isInterrupted())
                        throw new IOException("SOURCE_HOST_CANCELLED");
                    client.check();
                };
                try(LocalComicStore.Preview preview=LocalComicStore.prepareRasterPages(
                        this,identity,label,streams,check,(complete,total)->
                            runOnUiThread(()->{
                                if(!cancelled)status.setText(complete+" / "+total);
                            }))){
                    check.check();
                    result=LocalComicStore.confirm(this,preview,check);
                }
            }catch(Exception failure){
                // The original importer cancels/removes only its own staging
                // generation. Never delete a previous book on a failed copy.
            }
            LocalComicStore.Comic completed=result;
            runOnUiThread(()->{
                if(cancelled)return;
                saved=completed;
                busy(false);
                status.setText(completed==null?
                    t("保存失败或会话已撤销，原文件保持不变",
                      "Save failed or authorization expired. Existing files unchanged.",
                      "保存失敗／許可期限切れ。既存ファイルは変更しません。"):
                    t("已进入原书库：","Saved in original library: ",
                      "元の書庫に保存：")+completed.title);
            });
        });
    }
    private static String truncate(String value,int size){
        return value.length()<=size?value:value.substring(0,size-1)+"…";
    }
    @Override protected void onDestroy(){
        cancelled=true;executor.shutdownNow();
        if(client!=null)client.close();
        super.onDestroy();
    }
}
