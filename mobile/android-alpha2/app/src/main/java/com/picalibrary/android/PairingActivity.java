package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;

public class PairingActivity extends Activity {
    private EditText host,code;private TextView status;
    @Override public void onCreate(Bundle b){super.onCreate(b);Ui.applyWindow(this);render();handleDeepLink(getIntent().getData());}
    private void render(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(Ui.dp(this,22),insets.getSystemWindowInsetTop()+Ui.dp(this,18),Ui.dp(this,22),insets.getSystemWindowInsetBottom()+Ui.dp(this,18));return insets;});root.addView(Ui.text(this,"连接电脑",28,Ui.TEXT,true));Ui.gap(root,this,8);root.addView(Ui.text(this,"手机和电脑连接同一 Wi‑Fi 后，在电脑的“手机连接”中查看地址和配对码。",14,Ui.MUTED,false));Ui.gap(root,this,18);host=new EditText(this);host.setHint("电脑地址，例如 http://192.168.1.12:7788");host.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI);host.setText(BridgeStore.host(this));Ui.styleField(host,this);root.addView(host);Ui.gap(root,this,10);code=new EditText(this);code.setHint("6 位配对码");code.setInputType(InputType.TYPE_CLASS_NUMBER);Ui.styleField(code,this);root.addView(code);status=Ui.text(this,"",13,Ui.MUTED,false);status.setPadding(0,Ui.dp(this,10),0,Ui.dp(this,6));root.addView(status);Button pair=Ui.button(this,"连接电脑",v->pair(),false);root.addView(pair);if(BridgeStore.paired(this)){Ui.gap(root,this,10);root.addView(Ui.button(this,"解除配对",v->{BridgeStore.clear(this);finish();},false));}setContentView(root);root.requestApplyInsets();}
    private void pair(){final String h=host.getText().toString().trim().replaceAll("/$","");final String c=code.getText().toString().trim();if(h.isEmpty()||c.length()!=6){status.setText("请填写电脑地址和 6 位配对码");return;}status.setText("正在连接…");new Thread(()->{try{JSONObject result=BridgeClient.pair(h,c);String token=result.optString("token"),name=result.optString("serverName","Pica Library Desktop");if(token.isEmpty())throw new IllegalStateException("配对失败");BridgeStore.save(this,h,token,name);try{ShelfStore.syncWithDesktop(this);}catch(Exception ignored){}SupporterSyncJobs.enqueue(this);runOnUiThread(()->{status.setText("配对成功");offerFavoriteImport();});}catch(Exception e){runOnUiThread(()->status.setText("连接失败："+(e.getMessage()==null?"请检查地址和配对码":e.getMessage())));}}).start();}
    private void offerFavoriteImport(){new AlertDialog.Builder(this).setTitle("配对成功").setMessage("是否同时缓存电脑收藏的封面？").setPositiveButton("同步收藏和封面",(d,w)->syncFavorites(true)).setNeutralButton("仅同步收藏",(d,w)->syncFavorites(false)).setNegativeButton("稍后",(d,w)->{Toast.makeText(this,"配对成功",Toast.LENGTH_SHORT).show();finish();}).setCancelable(false).show();}
    private void syncFavorites(boolean covers){FavoriteImportJobs.enqueue(this,covers);SupporterSyncJobs.enqueue(this);Toast.makeText(this,covers?"正在后台同步收藏和封面":"正在后台同步收藏",Toast.LENGTH_SHORT).show();finish();}
    private void handleDeepLink(Uri u){if(u==null||!"picalibrary".equals(u.getScheme()))return;String h=u.getQueryParameter("host"),c=u.getQueryParameter("code");if(h!=null)host.setText(h);if(c!=null)code.setText(c);if(h!=null&&c!=null)pair();}
}
