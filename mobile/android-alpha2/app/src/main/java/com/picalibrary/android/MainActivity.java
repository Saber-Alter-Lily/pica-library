package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.Arrays;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private LinearLayout content;private LinearLayout nav;private int current=0;
    @Override public void onCreate(Bundle b){super.onCreate(b);getWindow().setStatusBarColor(Ui.BG);renderShell();}
    @Override protected void onResume(){super.onResume();if(content!=null)showTab();}

    private void renderShell(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);scroll.addView(content,new ScrollView.LayoutParams(-1,-2));root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1f));
        nav=new LinearLayout(this);nav.setGravity(Gravity.CENTER);nav.setPadding(Ui.dp(this,8),Ui.dp(this,7),Ui.dp(this,8),Ui.dp(this,9));root.addView(nav,new LinearLayout.LayoutParams(-1,-2));setContentView(root);
        String[] labels={"漫画库","推荐","图鉴","我的"};for(int i=0;i<labels.length;i++){final int idx=i;Button bt=new Button(this);bt.setText(labels[i]);bt.setAllCaps(false);bt.setTextSize(13);bt.setOnClickListener(v->{current=idx;showTab();});nav.addView(bt,new LinearLayout.LayoutParams(0,Ui.dp(this,52),1));}showTab();
    }

    private void showTab(){content.removeAllViews();if(current==0)library();else if(current==1)recommendations();else if(current==2)atlas();else profile();}
    private void hero(String title,String subtitle){Ui.gap(content,this,16);TextView t=Ui.text(this,title,30,Ui.TEXT,true);t.setPadding(Ui.dp(this,20),0,Ui.dp(this,20),0);content.addView(t);TextView s=Ui.text(this,subtitle,14,Ui.MUTED,false);s.setPadding(Ui.dp(this,20),Ui.dp(this,6),Ui.dp(this,20),Ui.dp(this,10));content.addView(s);}

    private void library(){
        hero("漫画库",BridgeStore.paired(this)?"正在读取 Desktop 的真实收藏与下载状态":"先连接 Desktop，再读取真实漫画库");
        LinearLayout chips=new LinearLayout(this);chips.setPadding(Ui.dp(this,16),0,Ui.dp(this,16),Ui.dp(this,8));for(String x:new String[]{"收藏","已下载","书架","最近阅读"}){TextView p=Ui.pill(this,x,Ui.PRIMARY_SOFT,Ui.PRIMARY);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-2,-2);lp.setMargins(0,0,Ui.dp(this,8),0);chips.addView(p,lp);}content.addView(chips);
        if(!BridgeStore.paired(this)){connectionCard();comicCard("夜航书库","Demo · 本地原型","demo-night",0);return;}
        LinearLayout loading=Ui.card(this);loading.addView(Ui.text(this,"已连接 "+BridgeStore.serverName(this),14,Ui.GOOD,true));loading.addView(Ui.text(this,"正在读取收藏…",13,Ui.MUTED,false));content.addView(loading);
        new Thread(()->{try{List<BridgeClient.ComicItem> items=BridgeClient.library(this,"favorites",120);runOnUiThread(()->{if(current!=0)return;content.removeAllViews();hero("漫画库","Desktop 实时收藏 · 已下载作品可直接阅读");for(BridgeClient.ComicItem it:items)comicCard(it.title,it.author+(it.downloadedPictures>0?" · 已下载 "+it.downloadedPictures+" 页":" · 未下载"),it.id,it.downloadedPictures);if(items.isEmpty())emptyCard("还没有收藏数据");});}catch(Exception e){runOnUiThread(()->{if(current!=0)return;content.removeAllViews();hero("漫画库","Desktop 连接异常");errorCard(e.getMessage());});}}).start();
    }

    private void connectionCard(){LinearLayout c=Ui.card(this);c.addView(Ui.text(this,"尚未连接电脑",18,Ui.TEXT,true));c.addView(Ui.text(this,"打开“我的 → 连接 Pica Library Desktop”完成配对。",13,Ui.MUTED,false));Button b=new Button(this);b.setText("去连接");b.setAllCaps(false);b.setOnClickListener(v->{current=3;showTab();});c.addView(b);content.addView(c);}
    private void emptyCard(String s){LinearLayout c=Ui.card(this);c.addView(Ui.text(this,s,15,Ui.MUTED,false));content.addView(c);}
    private void errorCard(String s){LinearLayout c=Ui.card(this);c.addView(Ui.text(this,"连接失败",17,0xffa43b3b,true));c.addView(Ui.text(this,s==null?"未知错误":s,13,Ui.MUTED,false));content.addView(c);}

    private void comicCard(String title,String author,String id,int downloaded){LinearLayout c=Ui.card(this);c.setClickable(true);c.addView(Ui.text(this,title,19,Ui.TEXT,true));c.addView(Ui.text(this,author,13,Ui.MUTED,false));Ui.gap(c,this,8);LinearLayout row=new LinearLayout(this);row.addView(Ui.pill(this,downloaded>0?"继续阅读":"查看",downloaded>0?Ui.PRIMARY:Ui.PRIMARY_SOFT,downloaded>0?0xffffffff:Ui.PRIMARY));c.addView(row);c.setOnClickListener(v->{Intent i=new Intent(this,ReaderActivity.class);i.putExtra("title",title);i.putExtra("comicId",id);startActivity(i);});content.addView(c);}

    private void recommendations(){
        hero("为你推荐",BridgeStore.paired(this)?"由 Desktop Recommendation V3 生成":"连接 Desktop 后加载真实推荐");
        if(!BridgeStore.paired(this)){connectionCard();return;}
        emptyCard("正在生成 / 读取推荐…");
        new Thread(()->{try{List<BridgeClient.RecommendationItem> items=BridgeClient.recommendations(this,18);runOnUiThread(()->{if(current!=1)return;content.removeAllViews();hero("为你推荐","Recommendation V3 · Desktop 算法权威");for(BridgeClient.RecommendationItem r:items){LinearLayout c=Ui.card(this);c.addView(Ui.text(this,r.title,18,Ui.TEXT,true));c.addView(Ui.text(this,r.author,13,Ui.MUTED,false));c.addView(Ui.text(this,r.reason,13,Ui.PRIMARY,false));c.setOnClickListener(v->{Intent i=new Intent(this,ReaderActivity.class);i.putExtra("title",r.title);i.putExtra("comicId",r.id);startActivity(i);});content.addView(c);}if(items.isEmpty())emptyCard("暂时没有可展示推荐");});}catch(Exception e){runOnUiThread(()->{if(current==1){content.removeAllViews();hero("为你推荐","读取失败");errorCard(e.getMessage());}});}}).start();
    }

    private void atlas(){
        hero("收藏图鉴",BridgeStore.paired(this)?"读取 Desktop 的真实收藏画像":"连接 Desktop 后展示你的收藏画像");if(!BridgeStore.paired(this)){connectionCard();return;}emptyCard("正在读取收藏图鉴…");
        new Thread(()->{try{JSONObject root=BridgeClient.atlas(this);runOnUiThread(()->{if(current!=2)return;content.removeAllViews();hero("收藏图鉴","由 Desktop Atlas / Taste Chronicle 提供");JSONObject snapshot=root.optJSONObject("snapshot");if(snapshot==null){emptyCard("尚未生成收藏图鉴，请先在电脑端同步并打开收藏图鉴。 ");return;}atlasCard("收藏总体画像",snapshot.optInt("favoriteCount",0)+" 部收藏");atlasTop(snapshot,"tags","主要兴趣主题");atlasTop(snapshot,"authors","偏好作者");atlasTop(snapshot,"categories","兴趣宇宙");});}catch(Exception e){runOnUiThread(()->{if(current==2){content.removeAllViews();hero("收藏图鉴","读取失败");errorCard(e.getMessage());}});}}).start();
    }
    private void atlasTop(JSONObject snapshot,String key,String title){JSONArray a=snapshot.optJSONArray(key);StringBuilder b=new StringBuilder();if(a!=null)for(int i=0;i<Math.min(8,a.length());i++){JSONObject o=a.optJSONObject(i);if(o==null)continue;String v=o.optString("value",o.optString("tag",o.optString("name","")));if(!v.isEmpty()){if(b.length()>0)b.append(" · ");b.append(v);}}atlasCard(title,b.length()==0?"暂无数据":b.toString());}
    private void atlasCard(String title,String body){LinearLayout c=Ui.card(this);c.addView(Ui.text(this,title,18,Ui.TEXT,true));Ui.gap(c,this,6);c.addView(Ui.text(this,body,14,Ui.MUTED,false));content.addView(c);}

    private void profile(){hero("我的","连接、阅读设置和缓存");LinearLayout pair=Ui.card(this);pair.addView(Ui.text(this,BridgeStore.paired(this)?"Desktop 已连接":"连接 Pica Library Desktop",18,Ui.TEXT,true));pair.addView(Ui.text(this,BridgeStore.paired(this)?BridgeStore.serverName(this)+"\n"+BridgeStore.host(this):"同一 Wi‑Fi 下用电脑显示的地址 + 6 位配对码连接。手机不保存 Pica 账号密码。",13,Ui.MUTED,false));Button b=new Button(this);b.setAllCaps(false);b.setText(BridgeStore.paired(this)?"管理连接":"开始配对");b.setOnClickListener(v->startActivity(new Intent(this,PairingActivity.class)));pair.addView(b);content.addView(pair);for(String[] x:Arrays.asList(new String[][]{{"阅读设置","左右点击翻页 · 音量键翻页 · 进度回写"},{"缓存","Alpha 2 当前按页读取，下一版加入有界缓存"},{"关于","Pica Library Android 0.1.0-alpha2 · Clean-room build"}})){LinearLayout c=Ui.card(this);c.addView(Ui.text(this,x[0],17,Ui.TEXT,true));c.addView(Ui.text(this,x[1],13,Ui.MUTED,false));content.addView(c);}}
}
