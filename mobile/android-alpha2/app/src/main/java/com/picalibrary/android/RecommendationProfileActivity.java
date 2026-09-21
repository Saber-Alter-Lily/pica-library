package com.picalibrary.android;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Android-local recommendation profile and current runtime explanation. */
public final class RecommendationProfileActivity extends LocaleAwareActivity {
    private static final class ProfileData {
        JSONObject policy;
        JSONArray localControls,inferred;
        UnifiedCatalogStore.Snapshot catalog;
        NativeRecommendationStore.Snapshot runtime;
        PortableRecommendationPackageStore.Snapshot portable;
        List<RecommendationEvidenceStore.Signal> recentSignals,sessionSignals;
        int localFavorites,localOwned,recentCount,sessionCount,visualCount;
    }

    private LinearLayout content;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private int loadGeneration;
    private boolean destroyed;

    @Override public void onCreate(Bundle state){
        super.onCreate(state);Ui.applyWindow(this);renderShell();
    }
    @Override protected void onResume(){super.onResume();loadAsync();}
    @Override protected void onDestroy(){destroyed=true;++loadGeneration;worker.shutdownNow();super.onDestroy();}

    private void renderShell(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));
        bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));
        bar.addView(Ui.text(this,"推荐画像",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,10),Ui.dp(this,14),Ui.dp(this,28));scroll.addView(content);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();showLoading();
    }

    private void showLoading(){
        if(content==null)return;content.removeAllViews();
        LinearLayout panel=SettingsRow.panel(this,null);
        panel.addView(Ui.text(this,"正在读取本机推荐画像…",16,Ui.TEXT,true));
        ProgressBar progress=new ProgressBar(this);progress.setIndeterminate(true);panel.addView(progress);
        panel.addView(Ui.text(this,"书库、行为证据和 Portable 数据在后台读取，不阻塞页面首帧。",12,Ui.MUTED,false));
        content.addView(panel);
    }

    private void loadAsync(){
        if(content==null||destroyed)return;
        final int generation=++loadGeneration;
        showLoading();
        worker.submit(()->{
            try{
                Context app=getApplicationContext();
                ProfileData data=new ProfileData();
                data.policy=RecommendationPolicyStore.snapshot(app);
                JSONArray controls=data.policy.optJSONArray("controls");
                data.localControls=controls==null?new JSONArray():controls;
                data.catalog=UnifiedCatalogStore.load(app);
                for(UnifiedCatalogStore.Entry entry:data.catalog.entries()){
                    if(entry.favorite)data.localFavorites++;
                    if(entry.favorite||entry.inShelf||entry.phoneDownloaded||entry.desktopDownloaded||entry.remoteAvailable)data.localOwned++;
                }
                data.runtime=NativeRecommendationStore.load(app);
                data.portable=PortableRecommendationPackageStore.load(app);
                data.inferred=RecommendationLocalProfile.inferred(app,data.catalog,data.policy);
                data.recentSignals=RecommendationEvidenceStore.topSignals(app,false,8);
                data.sessionSignals=RecommendationEvidenceStore.topSignals(app,true,8);
                data.recentCount=RecommendationEvidenceStore.recentCount(app);
                data.sessionCount=RecommendationEvidenceStore.sessionCount(app);
                for(PortableRecommendationPackageStore.Candidate row:data.portable.candidates)if(row.visualAvailable)data.visualCount++;
                runOnUiThread(()->{if(destroyed||generation!=loadGeneration)return;render(data);});
            }catch(Exception e){
                runOnUiThread(()->{
                    if(destroyed||generation!=loadGeneration)return;
                    content.removeAllViews();
                    LinearLayout panel=SettingsRow.panel(this,null);
                    panel.addView(Ui.text(this,"推荐画像读取失败",16,Ui.TEXT,true));
                    panel.addView(Ui.text(this,e.getMessage()==null?"请返回后重试":e.getMessage(),12,Ui.MUTED,false));
                    content.addView(panel);
                });
            }
        });
    }

    private void render(ProfileData data){
        if(content==null)return;content.removeAllViews();
        JSONObject policy=data.policy==null?new JSONObject():data.policy;
        NativeRecommendationStore.Snapshot runtime=data.runtime==null?new NativeRecommendationStore.Snapshot():data.runtime;
        PortableRecommendationPackageStore.Snapshot portable=data.portable==null?new PortableRecommendationPackageStore.Snapshot():data.portable;

        LinearLayout identity=SettingsRow.panel(this,null);
        identity.addView(Ui.text(this,"本机推荐运行",17,Ui.TEXT,true));
        identity.addView(SettingsRow.statusLine(this,"Engine",Ui.text(this,NativeRecommendationStore.MODEL_VERSION,12,Ui.TEXT,true)));
        identity.addView(SettingsRow.statusLine(this,"本机 Cycle",Ui.text(this,runtime.cycleId.isEmpty()?"尚未生成":shortId(runtime.cycleId),12,Ui.MUTED,true)));
        identity.addView(SettingsRow.statusLine(this,"当前批次",Ui.text(this,runtime.available()?(runtime.batchIndex+1)+" / "+runtime.batches.size():"无",12,Ui.MUTED,true)));
        identity.addView(SettingsRow.statusLine(this,"Portable Policy",Ui.text(this,"revision "+policy.optInt("revision",0),12,Ui.MUTED,true)));
        identity.addView(SettingsRow.statusLine(this,"候选基础",Ui.rawText(this,portable.available()?LocalizedText.ui(this,portable.candidates.size()+" 个 · "+shortId(portable.reservoirGeneration),portable.candidates.size()+" items · "+shortId(portable.reservoirGeneration),portable.candidates.size()+" 件 · "+shortId(portable.reservoirGeneration)):LocalizedText.ui(this,"尚未同步","Not synced yet","未同期"),12,Ui.MUTED,true)));
        content.addView(identity);

        LinearLayout evidence=SettingsRow.panel(this,null);
        evidence.addView(Ui.text(this,"画像证据",17,Ui.TEXT,true));
        evidence.addView(SettingsRow.statusLine(this,"手机收藏 / 已拥有",Ui.text(this,data.localFavorites+" / "+data.localOwned,12,Ui.MUTED,true)));
        evidence.addView(SettingsRow.statusLine(this,"Portable 人工调整",Ui.rawText(this,LocalizedText.ui(this,(data.localControls==null?0:data.localControls.length())+" 项",(data.localControls==null?0:data.localControls.length())+" items",(data.localControls==null?0:data.localControls.length())+" 件"),12,Ui.MUTED,true)));
        evidence.addView(SettingsRow.statusLine(this,"最近 30 天行为",Ui.rawText(this,LocalizedText.ui(this,data.recentCount+" 条 · 本机 + 已同步",data.recentCount+" behaviors · local + synced",data.recentCount+" 件の行動 · 端末内 + 同期済み"),12,Ui.MUTED,true)));
        evidence.addView(SettingsRow.statusLine(this,"本次手机 Session",Ui.rawText(this,LocalizedText.ui(this,data.sessionCount+" 条",data.sessionCount+" events",data.sessionCount+" 件"),12,Ui.MUTED,true)));
        JSONObject intent=policy.optJSONObject("sessionIntent");
        String session=intent!=null&&"TARGET".equals(intent.optString("mode"))?intent.optString("label",intent.optString("key","")):"默认";
        evidence.addView(SettingsRow.statusLine(this,"本次想看",Ui.rawText(this,LocalizedText.ui(this,session+" · 仅手机",session+" · phone only",session+" · スマートフォンのみ"),12,Ui.MUTED,true)));
        content.addView(evidence);

        JSONArray inferred=data.inferred==null?new JSONArray():data.inferred;
        LinearLayout lifetime=SettingsRow.panel(this,null);
        lifetime.addView(Ui.text(this,"长期主要兴趣",17,Ui.TEXT,true));
        int top=Math.min(10,inferred.length());
        if(top==0)lifetime.addView(Ui.text(this,"尚未同步长期画像。手机仍可使用本地收藏和行为生成推荐。",12,Ui.MUTED,false));
        for(int i=0;i<top;i++){
            JSONObject row=inferred.optJSONObject(i);if(row==null)continue;
            int base=row.optInt("baselineLevel",5);
            lifetime.addView(SettingsRow.statusLine(this,row.optString("label",row.optString("key","")),Ui.rawText(this,LocalizedText.ui(this,base+"/10 · "+row.optInt("supportCount",0)+" 本",base+"/10 · "+row.optInt("supportCount",0)+" supporting works",base+"/10 · "+row.optInt("supportCount",0)+" 作品の支持"),12,Ui.MUTED,true)));
        }
        content.addView(lifetime);

        addBehaviorSignals("最近 30 天主要兴趣",data.recentSignals,"来自手机本地行为与已同步的 Desktop 最近行为；单纯曝光不作为正向兴趣。");
        addBehaviorSignals("本次会话兴趣",data.sessionSignals,"只统计当前 Android 进程 Session；不会同步成另一端的 Session Intent。");

        LinearLayout composition=SettingsRow.panel(this,null);
        composition.addView(Ui.text(this,"当前手机推荐构成",17,Ui.TEXT,true));
        if(!runtime.available())composition.addView(Ui.text(this,"尚未生成手机本地推荐周期。",12,Ui.MUTED,false));
        else{
            Map<String,Integer> families=new LinkedHashMap<>();
            for(NativeRecommendationStore.Item item:runtime.current()){
                String key=item.family==null||item.family.isEmpty()?"OTHER":item.family;
                families.put(key,families.getOrDefault(key,0)+1);
            }
            for(Map.Entry<String,Integer> row:families.entrySet())
                composition.addView(SettingsRow.statusLine(this,familyLabel(row.getKey()),Ui.rawText(this,LocalizedText.ui(this,row.getValue()+" 本",row.getValue()+" works",row.getValue()+" 作品"),12,Ui.MUTED,true)));
            LinkedHashSet<String> reasons=new LinkedHashSet<>();for(NativeRecommendationStore.Item item:runtime.current()){String reason=item.reason==null?"":item.reason.trim();if(!reason.isEmpty())reasons.add(reason);if(reasons.size()>=5)break;}
            if(!reasons.isEmpty()){composition.addView(Ui.text(this,"主要依据",13,Ui.TEXT,true));for(String reason:reasons)composition.addView(Ui.text(this,"• "+reason,12,Ui.MUTED,false));}
        }
        content.addView(composition);

        LinearLayout visual=SettingsRow.panel(this,null);
        visual.addView(Ui.headingWithInfo(this,"Visual 基础",17,"画风向量与大批量学习仍由 Desktop 完成；手机只消费同步后的轻量 affinity，不运行 DINOv2。"));
        visual.addView(SettingsRow.statusLine(this,"Generation",Ui.text(this,portable.visualGeneration.isEmpty()?"尚未同步":shortId(portable.visualGeneration),12,Ui.MUTED,true)));
        visual.addView(SettingsRow.statusLine(this,"候选覆盖",Ui.text(this,data.visualCount+" / "+portable.candidates.size(),12,Ui.MUTED,true)));
        content.addView(visual);
    }

    private void addBehaviorSignals(String title,List<RecommendationEvidenceStore.Signal> rows,String help){
        LinearLayout panel=SettingsRow.panel(this,null);panel.addView(Ui.headingWithInfo(this,title,17,help));
        if(rows==null||rows.isEmpty())panel.addView(Ui.text(this,"暂无足够正向行为证据",12,Ui.MUTED,false));
        else for(RecommendationEvidenceStore.Signal row:rows)panel.addView(SettingsRow.statusLine(this,row.kind+" · "+row.label,Ui.rawText(this,LocalizedText.ui(this,row.support+" 次",row.support+" times",row.support+" 回"),12,Ui.MUTED,true)));
        content.addView(panel);
    }

    private String shortId(String value){return value==null||value.isEmpty()?"无":value.substring(0,Math.min(10,value.length()));}
    private String familyLabel(String value){
        if("FANDOM".equals(value))return "作品 / IP";
        if("CREATOR".equals(value))return "作者";
        if("SEMANTIC_CONJUNCTION".equals(value))return "组合偏好";
        if("SEMANTIC_ANCHOR".equals(value))return "标签 / 题材";
        if("PORTABLE_RESERVOIR".equals(value))return "同步候选池";
        if("EXPLORATION".equals(value))return "探索";
        if("RELATED".equals(value))return "相似作品";
        return "其他";
    }
}
