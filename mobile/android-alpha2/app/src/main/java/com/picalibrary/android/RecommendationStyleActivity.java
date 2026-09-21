package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;
import org.json.JSONObject;

/**
 * Android recommendation hub. Runtime recommendation is local; Desktop is only
 * the source of heavy Visual/Foundation artifacts and optional provider relay.
 */
public final class RecommendationStyleActivity extends LocaleAwareActivity {
    private LinearLayout content;
    private JSONObject desktopVisual;
    private boolean loading,destroyed;

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);Ui.applyWindow(this);renderShell();
    }
    @Override protected void onResume(){
        super.onResume();renderContent();
        if(BridgeStore.paired(this))loadDesktopVisual(false);
    }
    @Override protected void onDestroy(){destroyed=true;super.onDestroy();}

    private void renderShell(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));
        bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));
        bar.addView(Ui.text(this,"推荐与画风",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,12),Ui.dp(this,14),Ui.dp(this,24));scroll.addView(content);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();renderContent();
    }

    private void renderContent(){
        if(content==null)return;content.removeAllViews();
        NativeRecommendationStore.Snapshot runtime=NativeRecommendationStore.load(this);
        PortableRecommendationPackageStore.Snapshot portable=PortableRecommendationPackageStore.load(this);

        LinearLayout runtimeCard=SettingsRow.panel(this,null);
        runtimeCard.addView(Ui.headingWithInfo(this,"本机推荐",17,"手机与电脑的当前推荐列表互不覆盖；同步只交换长期偏好、反馈、候选基础和 Desktop 预计算数据。"));
        runtimeCard.addView(SettingsRow.statusLine(this,"手机 Cycle",Ui.text(this,runtime.cycleId.isEmpty()?"尚未生成":shortId(runtime.cycleId),12,Ui.MUTED,true)));
        runtimeCard.addView(SettingsRow.statusLine(this,"候选基础",Ui.text(this,portable.available()?portable.candidates.size()+" 个 · "+shortId(portable.reservoirGeneration):"尚未同步",12,Ui.MUTED,true)));
        content.addView(runtimeCard);

        content.addView(SettingsRow.row(this,"推荐画像","长期 / 最近 / 本次 / 当前构成",v->startActivity(new Intent(this,RecommendationProfileActivity.class))));
        content.addView(SettingsRow.row(this,"人工调整",RecommendationPolicyStore.pendingControlCount(this)>0?"有 "+RecommendationPolicyStore.pendingControlCount(this)+" 项待同步":"0–10 档 / 屏蔽 / 本次想看",v->startActivity(new Intent(this,RecommendationControlActivity.class))));
        content.addView(SettingsRow.row(this,"推荐同步",BridgeStore.paired(this)?"与 Desktop 比较并双向合并":"未连接电脑",v->startActivity(new Intent(this,RecommendationSyncActivity.class))));
        boolean reasons=RecommendationFeedbackStore.askReasons(this);
        content.addView(SettingsRow.row(this,"反馈原因",reasons?"开启":"关闭",v->{RecommendationFeedbackStore.setAskReasons(this,!RecommendationFeedbackStore.askReasons(this));renderContent();}));

        LinearLayout visual=SettingsRow.panel(this,null);
        visual.addView(Ui.headingWithInfo(this,"画风基础",17,"DINOv2、全库向量和作者画风原型继续在 Windows 端批量处理；手机只使用同步后的轻量 Visual affinity 独立排序。"));
        visual.addView(SettingsRow.statusLine(this,"手机 Visual Generation",Ui.text(this,portable.visualGeneration.isEmpty()?"尚未同步":shortId(portable.visualGeneration),12,Ui.MUTED,true)));
        int covered=0;for(PortableRecommendationPackageStore.Candidate row:portable.candidates)if(row.visualAvailable)covered++;
        visual.addView(SettingsRow.statusLine(this,"候选 Visual 覆盖",Ui.text(this,covered+" / "+portable.candidates.size(),12,Ui.MUTED,true)));
        visual.addView(SettingsRow.statusLine(this,"手机画风接入",Ui.text(this,MobileVisualPolicyStore.label(this),12,Ui.MUTED,true)));
        visual.addView(Ui.button(this,"调整手机画风接入模式",v->chooseMobileVisualMode(),true),new LinearLayout.LayoutParams(-1,-2));
        visual.addView(Ui.button(this,"画风影响强度 · "+MobileVisualPolicyStore.strengthLabel(this),v->chooseMobileVisualStrength(),true),new LinearLayout.LayoutParams(-1,-2));
        content.addView(visual);

        if(BridgeStore.paired(this)){
            String state=desktopVisual==null?(loading?"读取中":"待读取"):desktopVisual.optInt("indexedCount",0)+" / "+desktopVisual.optInt("targetCount",0);
            content.addView(SettingsRow.row(this,"Desktop 画风状态（高级）",state,v->showDesktopVisualActions()));
            content.addView(Ui.button(this,"同步推荐基础数据",v->syncFoundation(),false),new LinearLayout.LayoutParams(-1,-2));
        }else{
            content.addView(Ui.button(this,"连接电脑以同步 Visual / Canonical / 候选基础",v->startActivity(new Intent(this,PairingActivity.class)),false),new LinearLayout.LayoutParams(-1,-2));
        }
    }

    private String shortId(String value){return value==null||value.isEmpty()?"无":value.substring(0,Math.min(10,value.length()));}

    private void syncFoundation(){
        if(loading||!BridgeStore.paired(this))return;loading=true;renderContent();
        new Thread(()->{
            try{
                BridgeClient.recommendationPortablePackage(this,500);
                runOnUiThread(()->{if(destroyed)return;loading=false;Toast.makeText(this,"推荐基础数据已同步；当前手机推荐周期未被替换",Toast.LENGTH_LONG).show();renderContent();});
            }catch(Exception e){
                runOnUiThread(()->{if(destroyed)return;loading=false;Toast.makeText(this,e.getMessage()==null?"基础数据同步失败":e.getMessage(),Toast.LENGTH_LONG).show();renderContent();});
            }
        }).start();
    }

    private void loadDesktopVisual(boolean feedback){
        if(loading||!BridgeStore.paired(this))return;loading=true;
        new Thread(()->{
            try{
                JSONObject value=BridgeClient.visualStatus(this);
                runOnUiThread(()->{if(destroyed)return;loading=false;desktopVisual=value;renderContent();});
            }catch(Exception e){
                runOnUiThread(()->{if(destroyed)return;loading=false;if(feedback)Toast.makeText(this,e.getMessage()==null?"无法读取 Desktop 画风状态":e.getMessage(),Toast.LENGTH_LONG).show();renderContent();});
            }
        }).start();
    }

    private void chooseMobileVisualMode(){
        String current=MobileVisualPolicyStore.mode(this);
        String[] labels={"关闭 · 完全不影响常规推荐","仅分析 · 不改变本机排序","参与排序 · 按所选强度生效"};
        String[] values={MobileVisualPolicyStore.OFF,MobileVisualPolicyStore.SHADOW,MobileVisualPolicyStore.LIVE};
        int checked=MobileVisualPolicyStore.OFF.equals(current)?0:MobileVisualPolicyStore.LIVE.equals(current)?2:1;
        new AlertDialog.Builder(this)
            .setTitle("手机画风接入模式")
            .setSingleChoiceItems(labels,checked,(d,w)->{
                d.dismiss();
                MobileVisualPolicyStore.setMode(this,values[w]);
                renderContent();
                if(NativeRecommendationStore.load(this).available()){
                    NativeRecommendationJobs.refresh(this);
                    Toast.makeText(this,"手机画风模式已更新，正在独立生成新的推荐周期",Toast.LENGTH_LONG).show();
                }
            })
            .setNegativeButton("取消",null)
            .show();
    }

    private void chooseMobileVisualStrength(){
        String current=MobileVisualPolicyStore.strength(this);
        String[] labels={"轻度 · 兼容旧权重","标准 · 推荐","强 · 更强调画风"};
        String[] values={MobileVisualPolicyStore.LIGHT,MobileVisualPolicyStore.STANDARD,MobileVisualPolicyStore.STRONG};
        int checked=MobileVisualPolicyStore.LIGHT.equals(current)?0:MobileVisualPolicyStore.STRONG.equals(current)?2:1;
        new AlertDialog.Builder(this)
            .setTitle("手机画风影响强度")
            .setSingleChoiceItems(labels,checked,(d,w)->{
                d.dismiss();
                MobileVisualPolicyStore.setStrength(this,values[w]);
                renderContent();
                if(MobileVisualPolicyStore.live(this)&&NativeRecommendationStore.load(this).available()){
                    NativeRecommendationJobs.refresh(this);
                    Toast.makeText(this,"手机画风强度已更新，正在独立生成新的推荐周期",Toast.LENGTH_LONG).show();
                }
            })
            .setNegativeButton("取消",null)
            .show();
    }

    private void showDesktopVisualActions(){
        if(desktopVisual==null){loadDesktopVisual(true);return;}
        JSONObject settings=desktopVisual.optJSONObject("settings");
        boolean enabled=settings!=null&&settings.optBoolean("enabled",false);
        String mode=settings==null?"SHADOW":settings.optString("rerankMode","SHADOW");
        String strength=settings==null?"STANDARD":settings.optString("strength","STANDARD");
        String[] labels={
            "刷新 Desktop 状态",
            enabled?"关闭 Desktop 画风模块":"启用 Desktop 画风模块",
            "Desktop 接入模式 · "+mode,
            "Desktop 画风强度 · "+strength
        };
        new AlertDialog.Builder(this)
            .setTitle("Desktop 画风设置")
            .setItems(labels,(d,w)->{
                if(w==0)loadDesktopVisual(true);
                else if(w==1)updateDesktopVisual(!enabled,null,null);
                else if(w==2)chooseDesktopMode(mode);
                else chooseDesktopStrength(strength);
            })
            .setNegativeButton("关闭",null)
            .show();
    }

    private void chooseDesktopMode(String current){
        String[] labels={"关闭排序影响","仅分析 · 不改变排序","参与排序 · 按所选强度生效"};
        String[] values={"OFF","SHADOW","LIVE"};
        int checked="OFF".equals(current)?0:"LIVE".equals(current)?2:1;
        new AlertDialog.Builder(this).setTitle("Desktop 推荐接入模式").setSingleChoiceItems(labels,checked,(d,w)->{d.dismiss();updateDesktopVisual(null,values[w],null);}).setNegativeButton("取消",null).show();
    }

    private void chooseDesktopStrength(String current){
        String[] labels={"轻度 · 兼容旧权重","标准 · 推荐","强 · 更强调画风"};
        String[] values={"LIGHT","STANDARD","STRONG"};
        int checked="LIGHT".equals(current)?0:"STRONG".equals(current)?2:1;
        new AlertDialog.Builder(this).setTitle("Desktop 画风影响强度").setSingleChoiceItems(labels,checked,(d,w)->{d.dismiss();updateDesktopVisual(null,null,values[w]);}).setNegativeButton("取消",null).show();
    }

    private void updateDesktopVisual(Boolean enabled,String mode,String strength){
        if(loading)return;loading=true;
        new Thread(()->{
            try{
                JSONObject value=BridgeClient.updateVisualSettings(this,enabled,mode,strength);
                runOnUiThread(()->{if(destroyed)return;loading=false;desktopVisual=value;renderContent();});
            }catch(Exception e){
                runOnUiThread(()->{if(destroyed)return;loading=false;Toast.makeText(this,e.getMessage()==null?"更新失败":e.getMessage(),Toast.LENGTH_LONG).show();renderContent();});
            }
        }).start();
    }
}
