package com.picalibrary.android;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;

/** Lightweight editor for the Desktop-authored portable Recommendation V5 policy. */
public final class RecommendationControlActivity extends Activity {
    private LinearLayout content;private boolean syncing,destroyed;
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);renderShell();}
    @Override protected void onResume(){super.onResume();render();if(BridgeStore.paired(this))syncNow(false);}
    @Override protected void onDestroy(){destroyed=true;super.onDestroy();}

    private void renderShell(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"推荐偏好控制",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,10),Ui.dp(this,14),Ui.dp(this,28));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();render();}

    private void render(){
        if(content==null)return;content.removeAllViews();JSONObject state=RecommendationPolicyStore.snapshot(this);int revision=state.optInt("revision",0);JSONObject counts=state.optJSONObject("counts"),intent=state.optJSONObject("sessionIntent");
        LinearLayout intro=SettingsRow.panel(this,null);intro.addView(Ui.text(this,"电脑负责完整画像、跨来源召回和重计算；手机使用同一份显式策略对已同步候选做轻量离线重排。手机改动会排队，下一次配对时合并回电脑。",13,Ui.MUTED,false));intro.addView(SettingsRow.statusLine(this,"策略版本",Ui.text(this,state.optString("policyVersion","V5 Beta"),13,Ui.TEXT,true)));intro.addView(SettingsRow.statusLine(this,"桌面修订",Ui.text(this,String.valueOf(revision),13,Ui.TEXT,true)));if(counts!=null)intro.addView(SettingsRow.statusLine(this,"已有 / 手动调整",Ui.text(this,counts.optInt("owned",0)+" / "+counts.optInt("controls",0),13,Ui.MUTED,true)));String session=intent!=null&&"TARGET".equals(intent.optString("mode"))?intent.optString("label",intent.optString("key","")):"默认";intro.addView(SettingsRow.statusLine(this,"本次想看",Ui.text(this,session,13,Ui.MUTED,true)));content.addView(intro);
        LinearLayout sync=new LinearLayout(this);sync.addView(Ui.button(this,syncing?"正在同步…":"与电脑同步推荐状态",v->syncNow(true),false),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(sync,this,6);sync.addView(Ui.button(this,"清除本次意图",v->{RecommendationPolicyStore.clearLocalSessionIntent(this);render();if(BridgeStore.paired(this))syncNow(false);},true));content.addView(sync);Ui.gap(content,this,10);
        JSONArray inferred=RecommendationPolicyStore.inferred(this);if(inferred.length()==0){content.addView(Ui.text(this,BridgeStore.paired(this)?"尚未取得电脑推荐画像，点上方同步。":"尚未同步电脑推荐画像。连接电脑后会带回基础画像。",13,Ui.MUTED,false));return;}content.addView(Ui.text(this,"系统推断的主要兴趣",17,Ui.TEXT,true));content.addView(Ui.text(this,"只在系统判断与你不符时调整。多/少/屏蔽会持续生效；“本次想看”只作为当前会话的轻量偏置。",12,Ui.MUTED,false));int shown=Math.min(24,inferred.length());for(int i=0;i<shown;i++){JSONObject row=inferred.optJSONObject(i);if(row==null)continue;String type=row.optString("targetType","TAG"),key=row.optString("key",""),label=row.optString("label",key);int support=row.optInt("supportCount",0);LinearLayout card=SettingsRow.panel(this,null);card.addView(Ui.text(this,label,15,Ui.TEXT,true));card.addView(Ui.text(this,typeLabel(type)+" · 系统证据 "+support+" 本",12,Ui.MUTED,false));LinearLayout buttons=new LinearLayout(this);buttons.setGravity(Gravity.CENTER_VERTICAL);buttons.addView(Ui.button(this,"少一点",v->set(type,key,label,"LESS"),true));Ui.gap(buttons,this,5);buttons.addView(Ui.button(this,"默认",v->set(type,key,label,"DEFAULT"),true));Ui.gap(buttons,this,5);buttons.addView(Ui.button(this,"多一点",v->set(type,key,label,"MORE"),true));Ui.gap(buttons,this,5);buttons.addView(Ui.button(this,"屏蔽",v->set(type,key,label,"BLOCK"),true));card.addView(buttons);card.addView(Ui.button(this,"本次想看这类",v->setSession(type,key,label),true));content.addView(card);}
    }

    private String typeLabel(String type){if("AUTHOR".equals(type))return "作者";if("CATEGORY".equals(type))return "分类";if("FANDOM".equals(type))return "IP";if("STYLE_FAMILY".equals(type))return "画风族";return "标签";}
    private void set(String type,String key,String label,String direction){RecommendationPolicyStore.setLocalControl(this,type,key,label,direction,"PERSISTENT");render();if(BridgeStore.paired(this))syncNow(false);}
    private void setSession(String type,String key,String label){RecommendationPolicyStore.setLocalSessionIntent(this,type,key,label);render();if(BridgeStore.paired(this))syncNow(false);}
    private void syncNow(boolean toast){if(syncing||!BridgeStore.paired(this)){if(toast&&!BridgeStore.paired(this))Toast.makeText(this,"请先连接电脑；离线调整已经保存在本机",Toast.LENGTH_SHORT).show();return;}syncing=true;render();new Thread(()->{try{BridgeClient.syncRecommendationState(this,false);runOnUiThread(()->{if(destroyed)return;syncing=false;if(toast)Toast.makeText(this,"手机改动已合并，桌面候选缓存已回写",Toast.LENGTH_SHORT).show();render();});}catch(Exception e){runOnUiThread(()->{if(destroyed)return;syncing=false;if(toast)Toast.makeText(this,e.getMessage()==null?"同步失败；本机改动会保留到下次配对":e.getMessage(),Toast.LENGTH_LONG).show();render();});}}).start();}
}
