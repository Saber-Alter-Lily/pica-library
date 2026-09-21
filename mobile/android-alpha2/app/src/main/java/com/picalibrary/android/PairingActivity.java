package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import org.json.JSONObject;

public class PairingActivity extends LocaleAwareActivity {
    private EditText host,code;
    private TextView status;
    private Button scanButton,pairButton;
    private boolean pairing;

    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        if(!DisclaimerActivity.accepted(this)){
            DisclaimerActivity.requireBeforePairing(this,getIntent());
            return;
        }
        Ui.applyWindow(this);
        render();
        handleDeepLink(getIntent().getData());
    }

    private void render(){
        ScrollView scroll=new ScrollView(this);
        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Ui.BG);
        root.setPadding(Ui.dp(this,22),Ui.dp(this,18),Ui.dp(this,22),Ui.dp(this,24));
        root.setOnApplyWindowInsetsListener((v,insets)->{
            v.setPadding(
                Ui.dp(this,22),
                insets.getSystemWindowInsetTop()+Ui.dp(this,18),
                Ui.dp(this,22),
                insets.getSystemWindowInsetBottom()+Ui.dp(this,24)
            );
            return insets;
        });

        root.addView(Ui.text(this,"连接电脑",28,Ui.TEXT,true));
        Ui.gap(root,this,14);

        scanButton=Ui.button(this,"扫一扫连接",v->scanPairingCode(),false);
        root.addView(scanButton);
        Ui.gap(root,this,18);

        root.addView(Ui.text(this,"手动连接",16,Ui.TEXT,true));
        Ui.gap(root,this,8);

        host=new EditText(this);
        host.setHint(LocalizedText.ui("电脑地址，例如 http://192.168.1.12:7788"));
        host.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI);
        host.setText(BridgeStore.host(this));
        Ui.styleField(host,this);
        root.addView(host);

        Ui.gap(root,this,10);
        code=new EditText(this);
        code.setHint(LocalizedText.ui("6 位配对码"));
        code.setInputType(InputType.TYPE_CLASS_NUMBER);
        Ui.styleField(code,this);
        root.addView(code);

        Ui.gap(root,this,10);
        pairButton=Ui.button(this,"连接电脑",v->pair(),false);
        root.addView(pairButton);

        status=Ui.text(this,"",13,Ui.MUTED,false);
        status.setPadding(0,Ui.dp(this,10),0,Ui.dp(this,6));
        root.addView(status);

        if(BridgeStore.paired(this)){
            Ui.gap(root,this,14);
            root.addView(Ui.headingWithInfo(this,"可选同步",16,"配对只建立连接，不会自动合并收藏、书架或推荐数据。需要时手动触发即可。推荐同步提醒也可以在“推荐同步”页关闭。"));
            Ui.gap(root,this,6);
            root.addView(SettingsRow.row(this,"同步收藏","不缓存封面",v->syncFavorites(false)));
            root.addView(SettingsRow.row(this,"同步收藏和封面","后台执行",v->syncFavorites(true)));
            root.addView(SettingsRow.row(this,"同步书架","手动",v->syncShelves()));
            root.addView(SettingsRow.row(this,"推荐同步","手动 / 提醒可关闭",v->startActivity(new Intent(this,RecommendationSyncActivity.class))));
            Ui.gap(root,this,8);
            root.addView(Ui.button(this,"解除配对",v->{
                BridgeStore.clear(this);
                DesktopAccountStatusStore.clear(this);
                finish();
            },false));
        }

        scroll.addView(root);
        setContentView(scroll);
        scroll.requestApplyInsets();
    }

    private void scanPairingCode(){
        if(pairing)return;
        IntentIntegrator integrator=new IntentIntegrator(this);
        integrator.setDesiredBarcodeFormats(java.util.Collections.singleton("QR_CODE"));
        integrator.setPrompt("扫描电脑端 Pica Library 配对二维码");
        integrator.setBeepEnabled(false);
        integrator.setOrientationLocked(false);
        integrator.initiateScan();
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        IntentResult result=IntentIntegrator.parseActivityResult(requestCode,resultCode,data);
        if(result!=null){
            if(result.getContents()==null){
                status.setText(LocalizedText.ui("已取消扫码"));
                return;
            }
            handlePairingUri(Uri.parse(result.getContents()));
            return;
        }
        super.onActivityResult(requestCode,resultCode,data);
    }

    private void setBusy(boolean value){
        pairing=value;
        if(scanButton!=null)scanButton.setEnabled(!value);
        if(pairButton!=null)pairButton.setEnabled(!value);
    }

    private void pair(){
        if(pairing)return;
        final String h=host.getText().toString().trim().replaceAll("/$","");
        final String c=code.getText().toString().trim();
        if(h.isEmpty()||!c.matches("\\d{6}")){
            status.setText(LocalizedText.ui("请填写电脑地址和 6 位配对码"));
            return;
        }
        setBusy(true);
        status.setText(LocalizedText.ui("正在连接…"));
        new Thread(()->{
            try{
                JSONObject result=BridgeClient.pair(this,h,c);
                String token=result.optString("token");
                String name=result.optString("serverName","Pica Library Desktop");
                if(token.isEmpty())throw new IllegalStateException("配对失败");
                BridgeStore.save(this,h,token,name);
                try{
                    DesktopAccountStatusStore.save(this,BridgeClient.accountStatus(this));
                }catch(Exception ignored){}
                runOnUiThread(()->{
                    setBusy(false);
                    render();
                    status.setText(LocalizedText.ui("配对成功 · 内容同步均为可选"));
                    Toast.makeText(this,LocalizedText.ui("配对成功"),Toast.LENGTH_SHORT).show();
                    RecommendationSyncActivity.offerAfterPairing(this);
                });
                SupporterSyncJobs.enqueue(this);
            }catch(Exception e){
                runOnUiThread(()->{
                    setBusy(false);
                    status.setText(LocalizedText.ui("连接失败：")+(e.getMessage()==null?LocalizedText.ui("请检查地址和配对码"):e.getMessage()));
                });
            }
        }).start();
    }

    private void syncFavorites(boolean covers){
        FavoriteImportJobs.enqueue(this,covers);
        SupporterSyncJobs.enqueue(this);
        Toast.makeText(
            this,
            covers?LocalizedText.ui("正在后台同步收藏和封面"):LocalizedText.ui("正在后台同步收藏"),
            Toast.LENGTH_SHORT
        ).show();
    }

    private void syncShelves(){
        if(!BridgeStore.paired(this))return;
        status.setText(LocalizedText.ui("正在同步书架…"));
        new Thread(()->{
            try{
                ShelfStore.syncWithDesktop(this);
                runOnUiThread(()->{
                    status.setText(LocalizedText.ui("书架同步完成"));
                    Toast.makeText(this,LocalizedText.ui("书架同步完成"),Toast.LENGTH_SHORT).show();
                });
            }catch(Exception e){
                runOnUiThread(()->status.setText(LocalizedText.ui("书架同步失败：")+(e.getMessage()==null?LocalizedText.ui("请稍后重试"):e.getMessage())));
            }
        }).start();
    }

    private void handleDeepLink(Uri u){
        if(u!=null)handlePairingUri(u);
    }

    private void handlePairingUri(Uri u){
        if(
            u==null||
            !"picalibrary".equalsIgnoreCase(u.getScheme())||
            !"pair".equalsIgnoreCase(u.getHost())
        ){
            status.setText(LocalizedText.ui("这不是 Pica Library 配对二维码"));
            return;
        }
        String h=u.getQueryParameter("host");
        String c=u.getQueryParameter("code");
        boolean validHost=h!=null&&(h.startsWith("http://")||h.startsWith("https://"));
        if(!validHost||c==null||!c.matches("\\d{6}")){
            status.setText(LocalizedText.ui("配对二维码内容不完整或已损坏"));
            return;
        }
        host.setText(h);
        code.setText(c);
        pair();
    }
}
