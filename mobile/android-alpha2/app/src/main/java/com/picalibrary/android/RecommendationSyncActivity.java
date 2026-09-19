package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;
import java.util.*;
import org.json.*;

/** Explicit Desktop↔Android recommendation sync center. Runtime cycles stay independent. */
public final class RecommendationSyncActivity extends Activity {
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
        principle.addView(Ui.text(this,"电脑和手机各自拥有独立推荐周期。同步的是长期偏好、反馈、可复用候选与 Desktop 预计算基础，不会把当前推荐列表或“本次想看”覆盖到另一端。",13,Ui.MUTED,false));
        content.addView(principle);Ui.gap(content,this,10);

        if(!BridgeStore.paired(this)){
            content.addView(SettingsRow.row(this,"电脑连接","未连接",v->startActivity(new Intent(this,PairingActivity.class))));
            return;
        }
        if(loading||preview==null){
            content.addView(SettingsRow.statusLine(this,"同步状态",Ui.text(this,loading?"正在比较两端数据…":"待读取",13,Ui.MUTED,true)));
            content.addView(Ui.button(this,"重新检查",v->loadPreview(),false),new LinearLayout.LayoutParams(-1,-2));
            return;
        }

        int android=preview.optInt("androidControlChanges",0)+preview.optInt("feedbackChanges",0)+preview.optInt("eventChanges",0)+preview.optInt("suppressChanges",0)+preview.optInt("tasteExclusionChanges",0);
        int desktop=preview.optInt("desktopControlChanges",0);
        JSONArray conflicts=preview.optJSONArray("conflicts");int conflictCount=conflicts==null?0:conflicts.length();
        JSONObject remote=preview.optJSONObject("remotePackage"),foundation=remote==null?null:remote.optJSONObject("foundation");
        PortableRecommendationPackageStore.Snapshot local=PortableRecommendationPackageStore.load(this);
        String remoteVisual=foundation==null?"":foundation.optString("visualGeneration","");
        String remoteCanonical=foundation==null?"":foundation.optString("canonicalGeneration","");
        String remoteReservoir=remote==null?"":remote.optString("reservoirGeneration","");
        boolean packageChanged=
            (!remoteVisual.isEmpty()&&!remoteVisual.equals(local.visualGeneration))||
            (!remoteCanonical.isEmpty()&&!remoteCanonical.equals(local.canonicalGeneration))||
            (!remoteReservoir.isEmpty()&&!remoteReservoir.equals(local.reservoirGeneration));

        LinearLayout card=SettingsRow.panel(this,null);
        card.addView(SettingsRow.statusLine(this,"手机 → 电脑",Ui.text(this,android+" 项待同步",13,android>0?Ui.PRIMARY:Ui.MUTED,true)));
        card.addView(SettingsRow.statusLine(this,"电脑 → 手机",Ui.text(this,desktop+" 项偏好更新"+(packageChanged?" · 基础包有更新":""),13,(desktop>0||packageChanged)?Ui.PRIMARY:Ui.MUTED,true)));
        card.addView(SettingsRow.statusLine(this,"人工冲突",Ui.text(this,conflictCount+" 项",13,conflictCount>0?Ui.BAD:Ui.MUTED,true)));
        content.addView(card);

        LinearLayout versions=SettingsRow.panel(this,null);
        versions.addView(Ui.text(this,"可复用基础",16,Ui.TEXT,true));
        versions.addView(SettingsRow.statusLine(this,"Visual",Ui.text(this,shortId(local.visualGeneration)+" → "+shortId(remoteVisual),12,Ui.MUTED,true)));
        versions.addView(SettingsRow.statusLine(this,"Canonical",Ui.text(this,shortId(local.canonicalGeneration)+" → "+shortId(remoteCanonical),12,Ui.MUTED,true)));
        versions.addView(SettingsRow.statusLine(this,"候选池",Ui.text(this,shortId(local.reservoirGeneration)+" → "+shortId(remoteReservoir),12,Ui.MUTED,true)));
        versions.addView(SettingsRow.statusLine(this,"手机本地 Session",Ui.text(this,RecommendationEvidenceStore.sessionCount(this)+" 条行为 · 不同步",12,Ui.MUTED,true)));
        content.addView(versions);

        if(conflictCount>0){
            content.addView(Ui.button(this,"查看并解决 "+conflictCount+" 项冲突",v->resolveAndApply(),false),new LinearLayout.LayoutParams(-1,-2));
        }else{
            content.addView(Ui.button(this,(android+desktop>0||packageChanged)?"双向同步":"刷新可复用基础",v->apply(new JSONArray()),false),new LinearLayout.LayoutParams(-1,-2));
        }
        Ui.gap(content,this,8);
        content.addView(Ui.button(this,"重新检查",v->loadPreview(),true),new LinearLayout.LayoutParams(-1,-2));
        Ui.gap(content,this,12);
        content.addView(Ui.button(this,"同步后重新生成手机推荐",v->{NativeRecommendationJobs.refresh(this);Toast.makeText(this,"手机将独立生成新的推荐周期",Toast.LENGTH_SHORT).show();},true),new LinearLayout.LayoutParams(-1,-2));
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
                runOnUiThread(()->{if(destroyed)return;loading=false;Toast.makeText(this,e.getMessage()==null?"无法比较推荐状态":e.getMessage(),Toast.LENGTH_LONG).show();render();});
            }
        }).start();
    }

    private void resolveAndApply(){
        JSONArray conflicts=preview==null?null:preview.optJSONArray("conflicts");
        if(conflicts==null||conflicts.length()==0){apply(new JSONArray());return;}
        JSONArray resolutions=new JSONArray();
        resolveOne(conflicts,0,resolutions);
    }

    private void resolveOne(JSONArray conflicts,int index,JSONArray resolutions){
        if(index>=conflicts.length()){apply(resolutions);return;}
        JSONObject conflict=conflicts.optJSONObject(index);
        if(conflict==null){resolveOne(conflicts,index+1,resolutions);return;}
        String identity=conflict.optString("identity","");
        String label=conflict.optString("label",identity);
        JSONObject base=conflict.optJSONObject("base"),desktop=conflict.optJSONObject("desktop"),android=conflict.optJSONObject("android");
        String message="上次同步："+controlLabel(base)+"\n电脑："+controlLabel(desktop)+"\n手机："+controlLabel(android);
        new AlertDialog.Builder(this)
            .setTitle("偏好冲突 · "+label)
            .setMessage(message)
            .setNegativeButton("稍后",null)
            .setNeutralButton("使用电脑",(d,w)->{resolutions.put(resolution(identity,"DESKTOP"));resolveOne(conflicts,index+1,resolutions);})
            .setPositiveButton("使用手机",(d,w)->{resolutions.put(resolution(identity,"ANDROID"));resolveOne(conflicts,index+1,resolutions);})
            .show();
    }

    private JSONObject resolution(String identity,String choice){
        JSONObject row=new JSONObject();try{row.put("identity",identity);row.put("choice",choice);}catch(Exception ignored){}return row;
    }

    private String controlLabel(JSONObject value){
        if(value==null)return "默认";
        if("BLOCK".equals(value.optString("direction")))return "屏蔽";
        if(value.has("levelDelta")){
            int delta=value.optInt("levelDelta",0);
            return delta>0?"提高 "+delta+" 档":delta<0?"降低 "+(-delta)+" 档":"默认";
        }
        String direction=value.optString("direction","DEFAULT");
        return "MORE".equals(direction)?"多一点":"LESS".equals(direction)?"少一点":"默认";
    }

    private void apply(JSONArray resolutions){
        if(loading)return;loading=true;render();
        new Thread(()->{
            try{
                JSONObject result=BridgeClient.syncRecommendationState(this,false,resolutions);
                if(result.optBoolean("requiresResolution",false))throw new IllegalStateException("仍有未解决的推荐偏好冲突");
                runOnUiThread(()->{if(destroyed)return;loading=false;Toast.makeText(this,"推荐知识与人工调整已同步；两端当前推荐周期保持独立",Toast.LENGTH_LONG).show();loadPreview();});
            }catch(Exception e){
                runOnUiThread(()->{if(destroyed)return;loading=false;Toast.makeText(this,e.getMessage()==null?"推荐同步失败":e.getMessage(),Toast.LENGTH_LONG).show();render();});
            }
        }).start();
    }

    static void offerAfterPairing(Activity activity){
        offerIfChanged(activity,true);
    }

    static void maybeOfferOnConnection(Activity activity){
        long now=System.currentTimeMillis();
        if(!BridgeStore.paired(activity)||now-lastAutomaticCheckAt<60000L)return;
        lastAutomaticCheckAt=now;
        offerIfChanged(activity,false);
    }

    private static String promptSignature(
        JSONObject value,
        boolean packageChanged,
        String remoteVisual,
        String remoteCanonical,
        String remoteReservoir
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
            packageChanged+":"+remoteVisual+":"+remoteCanonical+":"+remoteReservoir+":"+conflictIds;
    }

    private static void offerIfChanged(Activity activity,boolean force){
        new Thread(()->{
            try{
                JSONObject value=BridgeClient.recommendationSyncPreview(activity);
                JSONObject remote=value.optJSONObject("remotePackage"),foundation=remote==null?null:remote.optJSONObject("foundation");
                PortableRecommendationPackageStore.Snapshot local=PortableRecommendationPackageStore.load(activity);
                String remoteVisual=foundation==null?"":foundation.optString("visualGeneration","");
                String remoteCanonical=foundation==null?"":foundation.optString("canonicalGeneration","");
                String remoteReservoir=remote==null?"":remote.optString("reservoirGeneration","");
                boolean packageChanged=remote!=null&&(
                    !remoteReservoir.equals(local.reservoirGeneration)||
                    (!remoteVisual.isEmpty()&&!remoteVisual.equals(local.visualGeneration))||
                    (!remoteCanonical.isEmpty()&&!remoteCanonical.equals(local.canonicalGeneration))
                );
                JSONArray conflicts=value.optJSONArray("conflicts");
                int changes=value.optInt("androidControlChanges",0)+value.optInt("desktopControlChanges",0)+value.optInt("feedbackChanges",0)+value.optInt("eventChanges",0)+value.optInt("suppressChanges",0)+value.optInt("tasteExclusionChanges",0);
                if(changes==0&&!packageChanged)return;
                String signature=promptSignature(value,packageChanged,remoteVisual,remoteCanonical,remoteReservoir);
                synchronized(RecommendationSyncActivity.class){
                    if(!force&&signature.equals(lastPromptSignature))return;
                    lastPromptSignature=signature;
                }
                activity.runOnUiThread(()->{
                    if(activity.isFinishing()||activity.isDestroyed())return;
                    int conflictCount=conflicts==null?0:conflicts.length();
                    new AlertDialog.Builder(activity)
                        .setTitle("发现新的推荐数据")
                        .setMessage("两端推荐周期保持独立。"+changes+" 项可同步数据"+(packageChanged?"，Desktop 基础包有更新":"")+(conflictCount>0?"，其中 "+conflictCount+" 项需要人工选择":"")+"。")
                        .setNegativeButton("稍后",null)
                        .setNeutralButton("查看详情",(d,w)->activity.startActivity(new Intent(activity,RecommendationSyncActivity.class)))
                        .setPositiveButton(conflictCount>0?"处理冲突":"双向同步",(d,w)->activity.startActivity(new Intent(activity,RecommendationSyncActivity.class)))
                        .show();
                });
            }catch(Exception ignored){}
        }).start();
    }
}
