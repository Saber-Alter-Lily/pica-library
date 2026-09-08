package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private FrameLayout body;
    private LinearLayout nav;
    private int current=0;
    private String libraryScope="downloaded";
    private String librarySort="latest";
    private String libraryText="";
    private ComicGridAdapter gridAdapter;
    private int requestSerial=0;

    @Override public void onCreate(Bundle b){super.onCreate(b);getWindow().setStatusBarColor(Ui.BG);getWindow().setNavigationBarColor(Ui.BG);renderShell();}
    @Override protected void onResume(){super.onResume();if(body!=null)showTab();}
    @Override protected void onDestroy(){if(gridAdapter!=null)gridAdapter.close();super.onDestroy();}

    private void renderShell(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());return insets;});
        body=new FrameLayout(this);root.addView(body,new LinearLayout.LayoutParams(-1,0,1f));
        nav=new LinearLayout(this);nav.setGravity(Gravity.CENTER);nav.setPadding(Ui.dp(this,8),Ui.dp(this,4),Ui.dp(this,8),Ui.dp(this,5));nav.setBackgroundColor(0xfff3f1f5);root.addView(nav,new LinearLayout.LayoutParams(-1,-2));
        String[] labels={"书库","推荐","图鉴","我的"};
        for(int i=0;i<labels.length;i++){
            final int idx=i;Button bt=new Button(this);bt.setText(labels[i]);bt.setAllCaps(false);bt.setTextSize(13);bt.setTextColor(idx==current?Ui.PRIMARY:Ui.MUTED);bt.setBackgroundColor(Color.TRANSPARENT);bt.setOnClickListener(v->{current=idx;showTab();});nav.addView(bt,new LinearLayout.LayoutParams(0,Ui.dp(this,52),1));
        }
        setContentView(root);root.requestApplyInsets();showTab();
    }

    private void showTab(){
        requestSerial++;
        if(gridAdapter!=null){gridAdapter.close();gridAdapter=null;}
        body.removeAllViews();
        for(int i=0;i<nav.getChildCount();i++)((Button)nav.getChildAt(i)).setTextColor(i==current?Ui.PRIMARY:Ui.MUTED);
        if(current==0)library();else if(current==1)recommendations();else if(current==2)atlas();else profile();
    }

    private void library(){
        LinearLayout page=new LinearLayout(this);page.setOrientation(LinearLayout.VERTICAL);page.setBackgroundColor(Ui.BG);body.addView(page,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout header=new LinearLayout(this);header.setOrientation(LinearLayout.VERTICAL);header.setPadding(Ui.dp(this,16),Ui.dp(this,14),Ui.dp(this,16),Ui.dp(this,7));page.addView(header);

        LinearLayout titleRow=new LinearLayout(this);titleRow.setGravity(Gravity.CENTER_VERTICAL);header.addView(titleRow);
        LinearLayout titleCopy=new LinearLayout(this);titleCopy.setOrientation(LinearLayout.VERTICAL);TextView title=Ui.text(this,"漫画库",29,Ui.TEXT,true);titleCopy.addView(title);TextView subtitle=Ui.text(this,scopeSubtitle(),13,Ui.MUTED,false);titleCopy.addView(subtitle);titleRow.addView(titleCopy,new LinearLayout.LayoutParams(0,-2,1));
        Button sort=new Button(this);sort.setAllCaps(false);sort.setText(sortLabel());sort.setTextSize(12);sort.setOnClickListener(v->{librarySort=librarySort.equals("latest")?"title":"latest";showTab();});titleRow.addView(sort,new LinearLayout.LayoutParams(Ui.dp(this,92),Ui.dp(this,46)));

        LinearLayout tabs=new LinearLayout(this);tabs.setPadding(0,Ui.dp(this,10),0,Ui.dp(this,6));header.addView(tabs);
        addScope(tabs,"已下载","downloaded");addScope(tabs,"收藏","favorites");addScope(tabs,"最近阅读","recent");

        if(!libraryScope.equals("recent")){
            EditText search=new EditText(this);search.setSingleLine(true);search.setText(libraryText);search.setHint("搜索标题或作者");search.setTextSize(14);search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);search.setPadding(Ui.dp(this,12),0,Ui.dp(this,12),0);search.setBackground(Ui.rounded(Color.WHITE,12,this));search.setOnEditorActionListener((v,action,event)->{if(action==EditorInfo.IME_ACTION_SEARCH){libraryText=v.getText().toString().trim();showTab();return true;}return false;});header.addView(search,new LinearLayout.LayoutParams(-1,Ui.dp(this,46)));
        }

        TextView status=Ui.text(this,"",12.5f,Ui.MUTED,false);status.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,3));header.addView(status);
        if(!BridgeStore.paired(this)){status.setText("尚未配对 Desktop");page.addView(connectionCard());return;}

        ProgressBar progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setIndeterminate(true);page.addView(progress,new LinearLayout.LayoutParams(-1,Ui.dp(this,3)));
        GridView grid=new GridView(this);grid.setNumColumns(2);grid.setHorizontalSpacing(Ui.dp(this,9));grid.setVerticalSpacing(Ui.dp(this,9));grid.setPadding(Ui.dp(this,10),Ui.dp(this,8),Ui.dp(this,10),Ui.dp(this,18));grid.setClipToPadding(false);grid.setStretchMode(GridView.STRETCH_COLUMN_WIDTH);page.addView(grid,new LinearLayout.LayoutParams(-1,0,1));
        status.setText("正在读取 Desktop…");
        final int serial=requestSerial;
        new Thread(()->{try{
            BridgeClient.device(this);
            List<BridgeClient.ComicItem> items;
            if(libraryScope.equals("recent")){
                List<BridgeClient.RecentItem> recent=BridgeClient.recent(this,80);items=new ArrayList<>();for(BridgeClient.RecentItem item:recent)items.add(item.comic);
            } else items=BridgeClient.library(this,libraryScope,300,libraryText,librarySort);
            runOnUiThread(()->{
                if(current!=0||serial!=requestSerial)return;progress.setVisibility(View.GONE);status.setText("Desktop 在线 · "+items.size()+" 部");gridAdapter=new ComicGridAdapter(this,items,this::openComic);grid.setAdapter(gridAdapter);
                if(items.isEmpty())status.setText("Desktop 在线 · 没有匹配结果");
            });
        }catch(Exception e){runOnUiThread(()->{if(current!=0||serial!=requestSerial)return;progress.setVisibility(View.GONE);status.setText("已配对 · Desktop 当前不可用："+e.getMessage());});}}).start();
    }

    private String scopeSubtitle(){if(libraryScope.equals("downloaded"))return "电脑已下载 · 局域网直接读取";if(libraryScope.equals("favorites"))return "Desktop 收藏";return "跨端阅读进度";}
    private String sortLabel(){return librarySort.equals("title")?"标题排序":"最近更新";}
    private void addScope(LinearLayout tabs,String label,String scope){TextView t=Ui.pill(this,label,libraryScope.equals(scope)?Ui.PRIMARY:Ui.PRIMARY_SOFT,libraryScope.equals(scope)?Color.WHITE:Ui.PRIMARY);t.setClickable(true);t.setOnClickListener(v->{libraryScope=scope;if(scope.equals("recent"))libraryText="";showTab();});LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-2,-2);lp.setMargins(0,0,Ui.dp(this,7),0);tabs.addView(t,lp);}

    private void openComic(BridgeClient.ComicItem item){Intent i=new Intent(this,ComicDetailActivity.class);i.putExtra("comicId",item.id);i.putExtra("title",item.title);i.putExtra("author",item.author);i.putExtra("coverPath",item.coverPath);i.putExtra("downloadedPictures",item.downloadedPictures);startActivity(i);}

    private View connectionCard(){LinearLayout c=Ui.card(this);c.addView(Ui.text(this,"连接 Pica Library Desktop",18,Ui.TEXT,true));c.addView(Ui.text(this,"手机和电脑保持同一 Wi‑Fi，在电脑 Settings → 手机连接 中查看地址和 6 位配对码。",13,Ui.MUTED,false));Button b=new Button(this);b.setText("开始配对");b.setAllCaps(false);b.setOnClickListener(v->startActivity(new Intent(this,PairingActivity.class)));c.addView(b);return c;}

    private LinearLayout scrollPage(String title,String subtitle){ScrollView scroll=new ScrollView(this);LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(0,0,0,Ui.dp(this,20));scroll.addView(content,new ScrollView.LayoutParams(-1,-2));body.addView(scroll,new FrameLayout.LayoutParams(-1,-1));Ui.gap(content,this,18);TextView t=Ui.text(this,title,29,Ui.TEXT,true);t.setPadding(Ui.dp(this,18),0,Ui.dp(this,18),0);content.addView(t);TextView s=Ui.text(this,subtitle,13,Ui.MUTED,false);s.setPadding(Ui.dp(this,18),Ui.dp(this,4),Ui.dp(this,18),Ui.dp(this,10));content.addView(s);return content;}

    private void recommendations(){LinearLayout content=scrollPage("为你推荐","Desktop Recommendation V3");if(!BridgeStore.paired(this)){content.addView(connectionCard());return;}LinearLayout wait=Ui.card(this);wait.addView(Ui.text(this,"正在读取推荐…",14,Ui.MUTED,false));content.addView(wait);final int serial=requestSerial;new Thread(()->{try{List<BridgeClient.RecommendationItem> items=BridgeClient.recommendations(this,18);runOnUiThread(()->{if(current!=1||serial!=requestSerial)return;body.removeAllViews();LinearLayout c=scrollPage("为你推荐","Desktop Recommendation V3");for(BridgeClient.RecommendationItem r:items){LinearLayout card=Ui.card(this);card.addView(Ui.text(this,r.title,18,Ui.TEXT,true));card.addView(Ui.text(this,r.author,13,Ui.MUTED,false));card.addView(Ui.text(this,r.reason,13,Ui.PRIMARY,false));c.addView(card);}if(items.isEmpty())atlasCard(c,"暂无推荐","稍后重试或先在电脑端生成推荐。 ");});}catch(Exception e){runOnUiThread(()->{if(current!=1||serial!=requestSerial)return;body.removeAllViews();LinearLayout c=scrollPage("为你推荐","读取失败");atlasCard(c,"Desktop 暂时没有返回推荐",e.getMessage());});}}).start();}

    private void atlas(){LinearLayout content=scrollPage("收藏图鉴","Desktop Taste Chronicle");if(!BridgeStore.paired(this)){content.addView(connectionCard());return;}LinearLayout wait=Ui.card(this);wait.addView(Ui.text(this,"正在读取图鉴…",14,Ui.MUTED,false));content.addView(wait);final int serial=requestSerial;new Thread(()->{try{JSONObject root=BridgeClient.atlas(this);runOnUiThread(()->{if(current!=2||serial!=requestSerial)return;body.removeAllViews();LinearLayout c=scrollPage("收藏图鉴","Desktop Taste Chronicle");JSONObject snapshot=root.optJSONObject("snapshot");if(snapshot==null){atlasCard(c,"尚未生成图鉴","先在电脑端生成 Taste Chronicle。 ");return;}atlasCard(c,"收藏总体画像",snapshot.optInt("favoriteCount",0)+" 部收藏");atlasTop(c,snapshot,"tags","主要兴趣主题");atlasTop(c,snapshot,"authors","偏好作者");atlasTop(c,snapshot,"categories","兴趣分类");});}catch(Exception e){runOnUiThread(()->{if(current!=2||serial!=requestSerial)return;body.removeAllViews();LinearLayout c=scrollPage("收藏图鉴","读取失败");atlasCard(c,"Desktop 当前不可用",e.getMessage());});}}).start();}

    private void atlasTop(LinearLayout content,JSONObject snapshot,String key,String title){JSONArray a=snapshot.optJSONArray(key);StringBuilder b=new StringBuilder();if(a!=null)for(int i=0;i<Math.min(8,a.length());i++){JSONObject o=a.optJSONObject(i);if(o==null)continue;String v=o.optString("value",o.optString("tag",o.optString("name","")));if(!v.isEmpty()){if(b.length()>0)b.append(" · ");b.append(v);}}atlasCard(content,title,b.length()==0?"暂无数据":b.toString());}
    private void atlasCard(LinearLayout content,String title,String text){LinearLayout c=Ui.card(this);c.addView(Ui.text(this,title,18,Ui.TEXT,true));Ui.gap(c,this,6);c.addView(Ui.text(this,text==null?"":text,14,Ui.MUTED,false));content.addView(c);}

    private void profile(){LinearLayout content=scrollPage("我的","连接、阅读和应用状态");LinearLayout pair=Ui.card(this);TextView connection=Ui.text(this,BridgeStore.paired(this)?"已配对 · 正在检查连接":"尚未配对 Desktop",18,Ui.TEXT,true);pair.addView(connection);pair.addView(Ui.text(this,BridgeStore.paired(this)?BridgeStore.serverName(this)+"\n"+BridgeStore.host(this):"手机不保存 Pica 账号密码。",13,Ui.MUTED,false));Button b=new Button(this);b.setAllCaps(false);b.setText(BridgeStore.paired(this)?"管理连接":"开始配对");b.setOnClickListener(v->startActivity(new Intent(this,PairingActivity.class)));pair.addView(b);content.addView(pair);if(BridgeStore.paired(this))new Thread(()->{try{BridgeClient.device(this);runOnUiThread(()->connection.setText("Desktop 在线"));}catch(Exception e){runOnUiThread(()->connection.setText("已配对 · Desktop 离线"));}}).start();atlasCard(content,"阅读器","双击缩放 · 双指缩放 · 左右滑动/点击翻页 · 音量键翻页 · 邻页预加载 · 章节切换 · 进度回写");atlasCard(content,"关于","Pica Library Android 0.1.0-alpha4 · MH-ARK-informed product rebuild");}
}
