package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native Pica discovery surface. Results are merged into the same unified mobile catalog. */
public final class PicaBrowseActivity extends Activity {
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private EditText search;
    private TextView status;
    private ProgressBar loading;
    private LinearLayout results;
    private int page=1;
    private String currentKeyword="",currentCategory="";
    private boolean destroyed;

    @Override public void onCreate(Bundle saved){super.onCreate(saved);getWindow().setStatusBarColor(Ui.BG);getWindow().setNavigationBarColor(Ui.BG);render();if(PicaAccountStore.load(this).signedIn())leaderboard();}
    private Button button(String label,View.OnClickListener action){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextColor(Ui.PRIMARY);b.setOnClickListener(action);return b;}
    private void render(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.addView(button("‹ 返回",v->finish()));bar.addView(Ui.text(this,"Pica 在线",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));bar.addView(button("账号",v->startActivity(new Intent(this,PicaAccountActivity.class))));root.addView(bar);
        search=new EditText(this);search.setSingleLine(true);search.setHint("搜索 Pica 漫画");search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);search.setOnEditorActionListener((v,id,e)->{if(id==EditorInfo.IME_ACTION_SEARCH){startSearch();return true;}return false;});root.addView(search);
        LinearLayout actions=new LinearLayout(this);actions.addView(button("搜索",v->startSearch()),new LinearLayout.LayoutParams(0,-2,1));actions.addView(button("24h 排行",v->leaderboard()),new LinearLayout.LayoutParams(0,-2,1));actions.addView(button("分类",v->chooseCategory()),new LinearLayout.LayoutParams(0,-2,1));root.addView(actions);
        status=Ui.text(this,PicaAccountStore.load(this).configured()?"可直接搜索、浏览并在线阅读":"请先配置 Pica 账号",12,Ui.MUTED,false);root.addView(status);loading=new ProgressBar(this);loading.setVisibility(View.GONE);root.addView(loading);
        ScrollView scroll=new ScrollView(this);results=new LinearLayout(this);results.setOrientation(LinearLayout.VERTICAL);results.setPadding(Ui.dp(this,10),Ui.dp(this,5),Ui.dp(this,10),Ui.dp(this,24));scroll.addView(results);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();
    }
    @Override protected void onResume(){super.onResume();if(!PicaAccountStore.load(this).configured())status.setText("请先配置 Pica 账号");}
    private boolean requireAccount(){if(PicaAccountStore.load(this).configured())return true;new AlertDialog.Builder(this).setTitle("需要 Pica 账号").setMessage("手机会直接连接 Pica API。先完成登录后即可搜索和在线阅读。") .setNegativeButton("取消",null).setPositiveButton("去登录",(d,w)->startActivity(new Intent(this,PicaAccountActivity.class))).show();return false;}
    private void startSearch(){if(!requireAccount())return;currentKeyword=search.getText().toString().trim();currentCategory="";page=1;if(currentKeyword.isEmpty()){leaderboard();return;}loadSearch();}
    private void loadSearch(){busy("正在搜索 Pica…");worker.submit(()->{try{PicaClient.ComicPage result=new PicaClient(this).search(currentKeyword,page,"ld",Collections.emptyList());UnifiedPicaCatalogSync.mergeAll(this,result.comics);runOnUiThread(()->showComics(result.comics,"搜索结果 · 第 "+result.page+" / "+result.pages+" 页",result.pages));}catch(Exception e){fail(e);}});}
    private void leaderboard(){if(!requireAccount())return;currentKeyword="";currentCategory="";page=1;busy("正在读取 24h 排行…");worker.submit(()->{try{List<PicaClient.Comic> comics=new PicaClient(this).leaderboard();UnifiedPicaCatalogSync.mergeAll(this,comics);runOnUiThread(()->showComics(comics,"24h 排行 · "+comics.size()+" 本",1));}catch(Exception e){fail(e);}});}
    private void chooseCategory(){if(!requireAccount())return;busy("正在读取分类…");worker.submit(()->{try{List<String> categories=new PicaClient(this).categories();runOnUiThread(()->{loading.setVisibility(View.GONE);new AlertDialog.Builder(this).setTitle("Pica 分类").setItems(categories.toArray(new String[0]),(d,index)->{currentCategory=categories.get(index);currentKeyword="";page=1;loadCategory();}).show();});}catch(Exception e){fail(e);}});}
    private void loadCategory(){busy("正在读取分类 · "+currentCategory);worker.submit(()->{try{PicaClient.ComicPage result=new PicaClient(this).browse(currentCategory,"","dd",page);UnifiedPicaCatalogSync.mergeAll(this,result.comics);runOnUiThread(()->showComics(result.comics,currentCategory+" · 第 "+result.page+" / "+result.pages+" 页",result.pages));}catch(Exception e){fail(e);}});}
    private void busy(String text){loading.setVisibility(View.VISIBLE);status.setText(text);}
    private void fail(Exception e){runOnUiThread(()->{if(destroyed)return;loading.setVisibility(View.GONE);status.setText("Pica 读取失败："+(e.getMessage()==null?"未知错误":e.getMessage()));});}
    private void showComics(List<PicaClient.Comic> comics,String label,int pages){
        if(destroyed)return;loading.setVisibility(View.GONE);status.setText(label);results.removeAllViews();
        for(PicaClient.Comic comic:comics){LinearLayout card=Ui.card(this);card.addView(Ui.text(this,comic.title,17,Ui.TEXT,true));card.addView(Ui.text(this,comic.author,12,Ui.MUTED,false));if(!comic.tags.isEmpty())card.addView(Ui.text(this,String.join(" · ",comic.tags.subList(0,Math.min(4,comic.tags.size()))),11,Ui.PRIMARY,false));card.addView(Ui.text(this,"Pica 在线 · "+comic.epsCount+" 章 · "+comic.pagesCount+" 页",11,Ui.MUTED,false));card.setOnClickListener(v->open(comic));results.addView(card);}
        if(pages>1){LinearLayout nav=new LinearLayout(this);Button previous=button("上一页",v->{if(page>1){page--;reloadCurrent();}});Button next=button("下一页",v->{if(page<pages){page++;reloadCurrent();}});nav.addView(previous,new LinearLayout.LayoutParams(0,-2,1));nav.addView(next,new LinearLayout.LayoutParams(0,-2,1));results.addView(nav);}
    }
    private void reloadCurrent(){if(!currentKeyword.isEmpty())loadSearch();else if(!currentCategory.isEmpty())loadCategory();else leaderboard();}
    private void open(PicaClient.Comic comic){UnifiedPicaCatalogSync.merge(this,comic);Intent i=new Intent(this,UnifiedComicDetailActivity.class);i.putExtra("comicId",comic.id);i.putExtra("title",comic.title);i.putExtra("author",comic.author);startActivity(i);}
    @Override protected void onDestroy(){destroyed=true;worker.shutdownNow();super.onDestroy();}
}
