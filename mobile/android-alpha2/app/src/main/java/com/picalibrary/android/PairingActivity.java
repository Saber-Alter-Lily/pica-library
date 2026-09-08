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
    private EditText host;
    private EditText code;
    private TextView status;

    @Override public void onCreate(Bundle b){super.onCreate(b);getWindow().setStatusBarColor(Ui.BG);render();handleDeepLink(getIntent().getData());}

    private void render(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(Ui.dp(this,22),insets.getSystemWindowInsetTop()+Ui.dp(this,18),Ui.dp(this,22),insets.getSystemWindowInsetBottom()+Ui.dp(this,18));return insets;});
        root.addView(Ui.text(this,"连接 Pica Library",28,Ui.TEXT,true));Ui.gap(root,this,8);
        root.addView(Ui.text(this,"确保手机和电脑连接同一 Wi‑Fi。在电脑 Pica Library → Settings → 手机连接 中查看地址和 6 位配对码。",14,Ui.MUTED,false));Ui.gap(root,this,18);
        host=new EditText(this);host.setHint("电脑地址，例如 http://192.168.1.12:7788");host.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI);host.setText(BridgeStore.host(this));root.addView(host);
        code=new EditText(this);code.setHint("6 位配对码");code.setInputType(InputType.TYPE_CLASS_NUMBER);root.addView(code);
        status=Ui.text(this,"",13,Ui.MUTED,false);root.addView(status);
        Button pair=new Button(this);pair.setText("连接电脑");pair.setAllCaps(false);pair.setOnClickListener(v->pair());root.addView(pair);
        if(BridgeStore.paired(this)){Ui.gap(root,this,12);Button clear=new Button(this);clear.setText("解除配对");clear.setAllCaps(false);clear.setOnClickListener(v->{BridgeStore.clear(this);finish();});root.addView(clear);}setContentView(root);root.requestApplyInsets();
    }

    private void pair(){
        final String h=host.getText().toString().trim().replaceAll("/$",""); final String c=code.getText().toString().trim();
        if(h.isEmpty()||c.length()!=6){status.setText("请填写电脑地址和 6 位配对码");return;}
        status.setText("正在连接…");
        new Thread(()->{try{
            JSONObject result=BridgeClient.pair(h,c);String token=result.optString("token");String name=result.optString("serverName","Pica Library Desktop");
            if(token.isEmpty())throw new IllegalStateException("配对响应缺少 token");
            BridgeStore.save(this,h,token,name);
            runOnUiThread(this::offerFavoriteImport);
        }catch(Exception e){runOnUiThread(()->status.setText("连接失败："+e.getMessage()));}}).start();
    }

    private void offerFavoriteImport(){
        status.setText("配对成功");
        new AlertDialog.Builder(this)
            .setTitle("导入电脑收藏到手机？")
            .setMessage("收藏元数据本身很小。你还可以把封面一起缓存到手机，之后电脑离线时仍能浏览收藏列表。")
            .setPositiveButton("收藏 + 封面",(d,w)->syncFavorites(true))
            .setNeutralButton("仅收藏",(d,w)->syncFavorites(false))
            .setNegativeButton("稍后",(d,w)->{Toast.makeText(this,"配对成功",Toast.LENGTH_SHORT).show();finish();})
            .setCancelable(false)
            .show();
    }

    private void syncFavorites(boolean covers){
        status.setText(covers?"正在导入收藏并缓存封面…":"正在导入收藏…");
        new Thread(()->{try{
            FavoriteCacheStore.Snapshot snapshot=FavoriteCacheStore.syncFromDesktop(this,covers,(done,total,phase)->runOnUiThread(()->status.setText(phase+(total>0?" · "+done+" / "+total:""))));
            runOnUiThread(()->{Toast.makeText(this,"已导入 "+snapshot.items.size()+" 本收藏",Toast.LENGTH_SHORT).show();finish();});
        }catch(Exception e){runOnUiThread(()->{status.setText("收藏导入失败："+e.getMessage());new AlertDialog.Builder(this).setTitle("配对已成功").setMessage("收藏缓存暂时没有完成，可以稍后在“连接”里重新导入。")
            .setPositiveButton("完成",(d,w)->finish()).show();});}}).start();
    }

    private void handleDeepLink(Uri u){
        if(u==null||!"picalibrary".equals(u.getScheme()))return;
        String h=u.getQueryParameter("host");String c=u.getQueryParameter("code");
        if(h!=null)host.setText(h);if(c!=null)code.setText(c);if(h!=null&&c!=null)pair();
    }
}
