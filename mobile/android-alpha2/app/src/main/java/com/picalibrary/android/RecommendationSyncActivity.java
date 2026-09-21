package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;
import java.util.*;
import org.json.*;

/** Explicit Desktop↔Android recommendation sync center. Runtime cycles stay independent. */
public final class RecommendationSyncActivity extends LocaleAwareActivity {
    private static long lastAutomaticCheckAt;
    private static String lastPromptSignature="";
    private LinearLayout content;
    private JSONObject preview;
    private boolean loading,destroyed;

    @Override public void onCreate(Bundle state){
        super.onCreate(state);Ui.applyWindow(this);renderShell();
    }
    @Override protected void onResume(){super.onResume();loadPreview();}
    @Override protected void onDestroy(){destroyed=true;super.onDestroy();}

    private void renderShell(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));
        bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));
        bar.addView(Ui.text(this,"推荐同步",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,10),Ui.dp(this,14),Ui.dp(this,28));scroll.addView(content);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();render();
    }

    private void render(){
        if(content==null)return;content.removeAllViews();
        LinearLayout principle=SettingsRow.panel(this,null);
        principle.addView(Ui.headingWithInfo(this,"同步规则",16,"电脑和手机各自拥有独立推荐周期。同步的是长期偏好、反馈、可复用候选与 Desktop 预计算基础，不会把当前推荐列表或“本次想看”覆盖到另一端。"));
        content.addView(principle);Ui.gap(content,this,8);

        LinearLayout reminders=SettingsRow.panel(this,null);
        reminders.addView(Ui.headingWithInfo(this,"连接提醒",16,"同步始终由你主动执行。这里仅控制连接时是否后台比较差异、以及是否弹出提醒；关闭后仍可随时进入本页手动检查和同步。"));
        boolean autoCheck=RecommendationSyncPreferences.checkOnConnection(this);
        reminders.addView(toggleRow("连接时自动检查差异",autoCheck,true,(button,checked)->{
            RecommendationSyncPreferences.setCheckOnConnection(this,checked);render();
        }));
        reminders.addView(toggleRow("普通变化弹窗提醒",RecommendationSyncPreferences.alertPortableChanges(this),autoCheck,(button,checked)->{
            RecommendationSyncPreferences.setAlertPortableChanges(this,checked);
        }));
        reminders.addView(toggleRow("偏好冲突弹窗提醒",RecommendationSyncPreferences.alertConflicts(this),autoCheck,(button,checked)->{
            RecommendationSyncPreferences.setAlertConflicts(this,checked);
        }));
        content.addView(reminders);Ui.gap(content,this,8);

        if(!BridgeStore.paired(this)){
            content.addView(SettingsRow.row(this,"电脑连接","未连接",v->startActivity(new Intent(this,PairingActivity.class))));
            return;
        }
        if(loading||preview==null){
            content.addView(SettingsRow.statusLine(this,"同步状态",Ui.text(this,loading?"正在比较两端数据…":"待读取",13,Ui.MUTED,true)));
            content.addView(Ui.button(this,"重新检查",v->loadPreview(),false),new LinearLayout.LayoutParams(-1,-2));
            return;
        }

        int android=preview.optInt("androidControlChanges",0)+preview.optInt("feedbackChanges",0)+preview.optInt("eventChanges",0)+preview.optInt("suppressChanges",0)+preview.optInt("tasteExclusionChanges",0)+preview.optInt("dispositionChanges",0)+preview.optInt("catalogEvidenceChanges",0);
        int desktop=preview.optInt("desktopControlChanges",0);
        JSONArray conflicts=preview.optJSONArray("conflicts");int conflictCount=conflicts==null?0:conflicts.length();
        JSONObject remote=preview.optJSONObject("remotePackage"),foundation=remote==null?null:remote.optJSONObject("foundation");
        PortableRecommendationPackageStore.Snapshot local=PortableRecommendationPackageStore.load(this);
        String remotePolicy=foundation==null?"":foundation.optString("portablePolicyGeneration","");
        String remoteVisual=foundation==null?"":foundation.optString("visualGeneration","");
        String remoteCanonical=foundation==null?"":foundation.optString("canonicalGeneration","");
        String remoteReservoir=remote==null?"":remote.optString("reservoirGeneration","");
        String remoteBehavior=remote==null?"":remote.optString("behaviorGeneration","");
        boolean packageChanged=
            (!remotePolicy.isEmpty()&&!remotePolicy.equals(local.portablePolicyGeneration))||
            (!remoteVisual.isEmpty()&&!remoteVisual.equals(local.visualGeneration))||
            (!remoteCanonical.isEmpty()&&!remoteCanonical.equals(local.canonicalGeneration))||
            (!remoteReservoir.isEmpty()&&!remoteReservoir.equals(local.reservoirGeneration))||
            (!remoteBehavior.isEmpty()&&!remoteBehavior.equals(local.behaviorGeneration));

        LinearLayout card=SettingsRow.panel(this,null);
        card.addView(SettingsRow.statusLine(this,"手机 → 电脑",Ui.rawText(this,LocalizedText.ui(this,android+" 项待同步",android+" items pending sync",android+" 件の同期待ち"),13,android>0?Ui.PRIMARY:Ui.MUTED,true)));
        card.addView(SettingsRow.statusLine(this,"电脑 → 手机",Ui.rawText(this,LocalizedText.ui(this,desktop+" 项偏好更新",desktop+" preference updates",desktop+" 件の嗜好更新")+(packageChanged?LocalizedText.ui(this," · 基础包有更新"," · base package updated"," · 基盤パッケージ更新あり"):""),13,(desktop>0||packageChanged)?Ui.PRIMARY:Ui.MUTED,true)));
        card.addView(SettingsRow.statusLine(this,"人工冲突",Ui.rawText(this,LocalizedText.ui(this,conflictCount+" 项",conflictCount+" items",conflictCount+" 件"),13,conflictCount>0?Ui.BAD:Ui.MUTED,true)));
        content.addView(card);

        LinearLayout versions=SettingsRow.panel(this,null);
        versions.addView(Ui.text(this,"可复用基础",16,Ui.TEXT,true));
        versions.addView(SettingsRow.statusLine(this,"Portable Policy",Ui.text(this,shortId(local.portablePolicyGeneration)+" → "+shortId(remotePolicy),12,Ui.MUTED,true)));
        versions.addView(SettingsRow.statusLine(this,"Visual",Ui.text(this,shortId(local.visualGeneration)+" → "+shortId(remoteVisual),12,Ui.MUTED,true)));
        versions.addView(SettingsRow.statusLine(this,"Canonical",Ui.text(this,shortId(local.canonicalGeneration)+" → "+shortId(remoteCanonical),12,Ui.MUTED,true)));
        versions.addView(SettingsRow.statusLine(this,"候选池",Ui.text(this,shortId(local.reservoirGeneration)+" → "+shortId(remoteReservoir),12,Ui.MUTED,true)));
        versions.addView(SettingsRow.statusLine(this,"近期行为",Ui.text(this,shortId(local.behaviorGeneration)+" → "+shortId(remoteBehavior),12,Ui.MUTED,true)));
        versions.addView(SettingsRow.statusLine(this,"手机本地 Session",Ui.rawText(this,LocalizedText.ui(this,RecommendationEvidenceStore.sessionCount(this)+" 条行为 · 不同步",RecommendationEvidenceStore.sessionCount(this)+" behaviors · not synced",RecommendationEvidenceStore.sessionCount(this)+" 件の行動 · 同期しない"),12,Ui.MUTED,true)));
        content.addView(versions);

        if(conflictCount>0){
            content.addView(Ui.button(this,LocalizedText.ui(this,"查看并解决 "+conflictCount+" 项冲突","View & resolve "+conflictCount+" conflicts",conflictCount+" 件の競合を確認して解決"),v->resolveAndApply(),false),new LinearLayout.LayoutParams(-1,-2));
        }else{
            content.addView(Ui.button(this,(android+desktop>0||packageChanged)?"双向同步":"刷新可复用基础",v->apply(new JSONArray()),false),new LinearLayout.LayoutParams(-1,-2));
        }
        Ui.gap(content,this,8);
        content.addView(Ui.button(this,"重新检查",v->loadPreview(),true),new LinearLayout.LayoutParams(-1,-2));
        Ui.gap(content,this,12);
        content.addView(Ui.button(this,"同步后重新生成手机推荐",v->{NativeRecommendationJobs.refresh(this);Toast.makeText(this,LocalizedText.ui("手机将独立生成新的推荐周期"),Toast.LENGTH_SHORT).show();},true),new LinearLayout.LayoutParams(-1,-2));
    }

    private LinearLayout toggleRow(String title,boolean checked,boolean enabled,CompoundButton.OnCheckedChangeListener listener){
        LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.setPadding(0,Ui.dp(this,5),0,Ui.dp(this,5));
        TextView label=Ui.text(this,title,14,enabled?Ui.TEXT:Ui.MUTED,false);row.addView(label,new LinearLayout.LayoutParams(0,-2,1));
        Switch toggle=new Switch(this);toggle.setChecked(checked);toggle.setEnabled(enabled);toggle.setOnCheckedChangeListener(listener);row.addView(toggle);
        return row;
    }

    private String shortId(String value){
        if(value==null||value.isEmpty())return "无";
        return value.substring(0,Math.min(8,value.length()));
    }

    private void loadPreview(){
        if(loading||!BridgeStore.paired(this))return;loading=true;render();
        new Thread(()->{
            try{
                JSONObject value=BridgeClient.recommendationSyncPreview(this);
                runOnUiThread(()->{if(destroyed)return;loading=false;preview=value;render();});
            }catch(Exception e){
                runOnUiThread(()->{if(destroyed)return;loading=false;Toast.makeText(this,e.getMessage()==null?LocalizedText.ui("无法比较推荐状态"):e.getMessage(),Toast.LENGTH_LONG).show();render();});
            }
        }).start();
    }

    private void resolveAndApply(){
        JSONArray conflicts=preview==null?null:preview.optJSONArray("conflicts");
        if(conflicts==null||conflicts.length()==0){apply(new JSONArray());return;}
        if(conflicts.length()==1){
            resolveOne(conflicts,0,new JSONArray());
            return;
        }
        new AlertDialog.Builder(this)
            .setTitle(LocalizedText.ui(this,conflicts.length()+" 项偏好冲突",conflicts.length()+" preference conflicts",conflicts.length()+" 件の嗜好競合"))
            .setMessage(LocalizedText.ui("无需逐项确认。可以统一采用电脑或手机的修改；只有少数冲突需要分别判断时，再选择逐项处理。"))
            .setNegativeButton(LocalizedText.ui("全部用电脑"),(d,w)->apply(resolutionsFor(conflicts,"DESKTOP")))
            .setNeutralButton(LocalizedText.ui("逐项处理"),(d,w)->resolveOne(conflicts,0,new JSONArray()))
            .setPositiveButton(LocalizedText.ui("全部用手机"),(d,w)->apply(resolutionsFor(conflicts,"ANDROID")))
            .show();
    }

    private JSONArray resolutionsFor(JSONArray conflicts,String choice){
        JSONArray out=new JSONArray();
        for(int i=0;i<conflicts.length();i++){
            JSONObject conflict=conflicts.optJSONObject(i);
            if(conflict==null)continue;
            String identity=conflict.optString("identity","");
            if(!identity.isEmpty())out.put(resolution(identity,choice));
        }
        return out;
    }

    private void resolveOne(JSONArray conflicts,int index,JSONArray resolutions){
        if(index>=conflicts.length()){apply(resolutions);return;}
        JSONObject conflict=conflicts.optJSONObject(index);
        if(conflict==null){resolveOne(conflicts,index+1,resolutions);return;}
        String identity=conflict.optString("identity","");
        String label=conflict.optString("label",identity);
        JSONObject base=conflict.optJSONObject("base"),desktop=conflict.optJSONObject("desktop"),android=conflict.optJSONObject("android");
        String message=LocalizedText.ui(this,"上次同步：","Last sync: ","前回同期：")+controlLabel(base)+"\n"+LocalizedText.ui(this,"电脑：","Desktop: ","Desktop：")+controlLabel(desktop)+"\n"+LocalizedText.ui(this,"手机：","Phone: ","スマートフォン：")+controlLabel(android);
        new AlertDialog.Builder(this)
            .setTitle(LocalizedText.ui("偏好冲突 · ")+label)
            .setMessage(message)
            .setNegativeButton(LocalizedText.ui("稍后"),null)
            .setNeutralButton(LocalizedText.ui("使用电脑"),(d,w)->{resolutions.put(resolution(identity,"DESKTOP"));resolveOne(conflicts,index+1,resolutions);})
            .setPositiveButton(LocalizedText.ui("使用手机"),(d,w)->{resolutions.put(resolution(identity,"ANDROID"));resolveOne(conflicts,index+1,resolutions);})
            .show();
    }

    private JSONObject resolution(String identity,String choice){
        JSONObject row=new JSONObject();try{row.put("identity",identity);row.put("choice",choice);}catch(Exception ignored){}return row;
    }

    private String controlLabel(JSONObject value){
        if(value==null)return LocalizedText.ui(this,"默认","Default","既定");
        if("BLOCK".equals(value.optString("direction")))return LocalizedText.ui(this,"屏蔽","Blocked","ブロック");
        if(value.has("levelDelta")){
            int delta=value.optInt("levelDelta",0);
            if(delta>0)return LocalizedText.ui(this,"提高 "+delta+" 档","Increase by "+delta,"+"+delta);
            if(delta<0)return LocalizedText.ui(this,"降低 "+(-delta)+" 档","Decrease by "+(-delta),String.valueOf(delta));
            return LocalizedText.ui(this,"默认","Default","既定");
        }
        String direction=value.optString("direction","DEFAULT");
        return "MORE".equals(direction)?LocalizedText.ui(this,"多一点","More","多め"):"LESS".equals(direction)?LocalizedText.ui(this,"少一点","Less","少なめ"):LocalizedText.ui(this,"默认","Default","既定");
    }

    private void apply(JSONArray resolutions){
        if(loading)return;loading=true;render();
        new Thread(()->{
            try{
                JSONObject result=BridgeClient.syncRecommendationState(this,false,resolutions);
                if(result.optBoolean("requiresResolution",false))throw new IllegalStateException("仍有未解决的推荐偏好冲突");
                runOnUiThread(()->{if(destroyed)return;loading=false;Toast.makeText(this,LocalizedText.ui("推荐知识与人工调整已同步；两端当前推荐周期保持独立"),Toast.LENGTH_LONG).show();loadPreview();});
            }catch(Exception e){
                runOnUiThread(()->{if(destroyed)return;loading=false;Toast.makeText(this,e.getMessage()==null?LocalizedText.ui("推荐同步失败"):e.getMessage(),Toast.LENGTH_LONG).show();render();});
            }
        }).start();
    }

    static void offerAfterPairing(Activity activity){
        if(RecommendationSyncPreferences.checkOnConnection(activity))offerIfChanged(activity);
    }

    static void maybeOfferOnConnection(Activity activity){
        long now=System.currentTimeMillis();
        if(!BridgeStore.paired(activity)||!RecommendationSyncPreferences.checkOnConnection(activity)||now-lastAutomaticCheckAt<60000L)return;
        lastAutomaticCheckAt=now;
        offerIfChanged(activity);
    }

    private static String promptSignature(
        JSONObject value,
        boolean packageChanged,
        String remotePolicy,
        String remoteVisual,
        String remoteCanonical,
        String remoteReservoir,
        String remoteBehavior
    ){
        JSONArray conflicts=value.optJSONArray("conflicts");
        StringBuilder conflictIds=new StringBuilder();
        if(conflicts!=null)for(int i=0;i<conflicts.length();i++){
            JSONObject row=conflicts.optJSONObject(i);
            if(row!=null)conflictIds.append(row.optString("identity","")).append('|');
        }
        return value.optInt("baseRevision",0)+":"+
            value.optInt("desktopRevision",0)+":"+
            value.optInt("androidControlChanges",0)+":"+
            value.optInt("desktopControlChanges",0)+":"+
            value.optInt("feedbackChanges",0)+":"+
            value.optInt("eventChanges",0)+":"+
            value.optInt("suppressChanges",0)+":"+
            value.optInt("tasteExclusionChanges",0)+":"+
            value.optInt("dispositionChanges",0)+":"+
            value.optInt("catalogEvidenceChanges",0)+":"+
            packageChanged+":"+remotePolicy+":"+remoteVisual+":"+remoteCanonical+":"+remoteReservoir+":"+remoteBehavior+":"+conflictIds;
    }

    private static void offerIfChanged(Activity activity){
        new Thread(()->{
            try{
                JSONObject value=BridgeClient.recommendationSyncPreview(activity);
                JSONObject remote=value.optJSONObject("remotePackage"),foundation=remote==null?null:remote.optJSONObject("foundation");
                PortableRecommendationPackageStore.Snapshot local=PortableRecommendationPackageStore.load(activity);
                String remotePolicy=foundation==null?"":foundation.optString("portablePolicyGeneration","");
                String remoteVisual=foundation==null?"":foundation.optString("visualGeneration","");
                String remoteCanonical=foundation==null?"":foundation.optString("canonicalGeneration","");
                String remoteReservoir=remote==null?"":remote.optString("reservoirGeneration","");
                String remoteBehavior=remote==null?"":remote.optString("behaviorGeneration","");
                boolean packageChanged=remote!=null&&(
                    (!remotePolicy.isEmpty()&&!remotePolicy.equals(local.portablePolicyGeneration))||
                    !remoteReservoir.equals(local.reservoirGeneration)||
                    (!remoteVisual.isEmpty()&&!remoteVisual.equals(local.visualGeneration))||
                    (!remoteCanonical.isEmpty()&&!remoteCanonical.equals(local.canonicalGeneration))||
                    (!remoteBehavior.isEmpty()&&!remoteBehavior.equals(local.behaviorGeneration))
                );
                JSONArray conflicts=value.optJSONArray("conflicts");
                int conflictCount=conflicts==null?0:conflicts.length();
                int changes=value.optInt("androidControlChanges",0)+value.optInt("desktopControlChanges",0)+value.optInt("feedbackChanges",0)+value.optInt("eventChanges",0)+value.optInt("suppressChanges",0)+value.optInt("tasteExclusionChanges",0)+value.optInt("dispositionChanges",0)+value.optInt("catalogEvidenceChanges",0);
                if(changes==0&&!packageChanged&&conflictCount==0)return;
                if(conflictCount>0){
                    if(!RecommendationSyncPreferences.alertConflicts(activity))return;
                }else if(!RecommendationSyncPreferences.alertPortableChanges(activity))return;

                String signature=promptSignature(value,packageChanged,remotePolicy,remoteVisual,remoteCanonical,remoteReservoir,remoteBehavior);
                synchronized(RecommendationSyncActivity.class){
                    if(signature.equals(lastPromptSignature))return;
                    lastPromptSignature=signature;
                }
                activity.runOnUiThread(()->{
                    if(activity.isFinishing()||activity.isDestroyed())return;
                    AlertDialog.Builder dialog=new AlertDialog.Builder(activity)
                        .setNegativeButton(LocalizedText.ui("稍后"),null)
                        .setPositiveButton(conflictCount>0?LocalizedText.ui("查看冲突"):LocalizedText.ui("打开推荐同步"),(d,w)->activity.startActivity(new Intent(activity,RecommendationSyncActivity.class)));
                    if(conflictCount>0){
                        dialog.setTitle(LocalizedText.ui(activity,"有 "+conflictCount+" 项偏好冲突",conflictCount+" preference conflicts",conflictCount+" 件の嗜好競合"))
                            .setMessage(LocalizedText.ui("电脑和手机同时修改了同一偏好。同步不会自动替你决定；打开同步页后可批量使用电脑、批量使用手机，或只对少数冲突逐项处理。"));
                    }else{
                        dialog.setTitle(LocalizedText.ui("有可同步的推荐数据"))
                            .setMessage(LocalizedText.ui(activity,changes+" 项长期数据可同步"+(packageChanged?"，Desktop 推荐基础也有更新":"")+"。当前推荐列表和“本次想看”不会被覆盖。",changes+" long-term items can be synced"+(packageChanged?", and the Desktop recommendation base also has updates":"")+". Current recommendation lists and session intent will not be overwritten.",changes+" 件の長期データを同期可能"+(packageChanged?"、Desktop のおすすめ基盤にも更新があります":"")+"。現在のおすすめ一覧と「今回見たいもの」は上書きされません。"));
                    }
                    dialog.show();
                });
            }catch(Exception ignored){}
        }).start();
    }
}
