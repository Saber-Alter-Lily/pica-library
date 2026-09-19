package com.picalibrary.android;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;
import java.util.*;
import org.json.*;

/** Android-local recommendation profile and current runtime explanation. */
public final class RecommendationProfileActivity extends Activity {
    private LinearLayout content;

    @Override public void onCreate(Bundle state){
        super.onCreate(state);Ui.applyWindow(this);renderShell();
    }
    @Override protected void onResume(){super.onResume();render();}
    private void renderShell(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));
        bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));
        bar.addView(Ui.text(this,"推荐画像",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,10),Ui.dp(this,14),Ui.dp(this,28));scroll.addView(content);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();render();
    }

    private void render(){
        if(content==null)return;content.removeAllViews();
        JSONObject policy=RecommendationPolicyStore.snapshot(this);
        JSONObject counts=policy.optJSONObject("counts");
        NativeRecommendationStore.Snapshot runtime=NativeRecommendationStore.load(this);
        PortableRecommendationPackageStore.Snapshot portable=PortableRecommendationPackageStore.load(this);

        LinearLayout identity=SettingsRow.panel(this,null);
        identity.addView(Ui.text(this,"本机推荐运行",17,Ui.TEXT,true));
        identity.addView(SettingsRow.statusLine(this,"Engine",Ui.text(this,NativeRecommendationStore.MODEL_VERSION,12,Ui.TEXT,true)));
        identity.addView(SettingsRow.statusLine(this,"本机 Cycle",Ui.text(this,runtime.cycleId.isEmpty()?"尚未生成":shortId(runtime.cycleId),12,Ui.MUTED,true)));
        identity.addView(SettingsRow.statusLine(this,"当前批次",Ui.text(this,runtime.available()?(runtime.batchIndex+1)+" / "+runtime.batches.size():"无",12,Ui.MUTED,true)));
        identity.addView(SettingsRow.statusLine(this,"Portable Policy",Ui.text(this,"revision "+policy.optInt("revision",0),12,Ui.MUTED,true)));
        identity.addView(SettingsRow.statusLine(this,"候选基础",Ui.text(this,portable.available()?portable.candidates.size()+" 个 · "+shortId(portable.reservoirGeneration):"尚未同步",12,Ui.MUTED,true)));
        content.addView(identity);

        LinearLayout evidence=SettingsRow.panel(this,null);
        evidence.addView(Ui.text(this,"画像证据",17,Ui.TEXT,true));
        if(counts!=null){
            evidence.addView(SettingsRow.statusLine(this,"收藏 / 已拥有",Ui.text(this,counts.optInt("favorites",0)+" / "+counts.optInt("owned",0),12,Ui.MUTED,true)));
            evidence.addView(SettingsRow.statusLine(this,"人工调整",Ui.text(this,counts.optInt("controls",0)+" 项",12,Ui.MUTED,true)));
        }
        evidence.addView(SettingsRow.statusLine(this,"最近 30 天本机行为",Ui.text(this,RecommendationEvidenceStore.recentCount(this)+" 条",12,Ui.MUTED,true)));
        evidence.addView(SettingsRow.statusLine(this,"本次手机 Session",Ui.text(this,RecommendationEvidenceStore.sessionCount(this)+" 条",12,Ui.MUTED,true)));
        JSONObject intent=policy.optJSONObject("sessionIntent");
        String session=intent!=null&&"TARGET".equals(intent.optString("mode"))?intent.optString("label",intent.optString("key","")):"默认";
        evidence.addView(SettingsRow.statusLine(this,"本次想看",Ui.text(this,session+" · 仅手机",12,Ui.MUTED,true)));
        content.addView(evidence);

        JSONArray inferred=RecommendationPolicyStore.inferred(this);
        LinearLayout lifetime=SettingsRow.panel(this,null);
        lifetime.addView(Ui.text(this,"长期主要兴趣",17,Ui.TEXT,true));
        int top=Math.min(10,inferred.length());
        if(top==0)lifetime.addView(Ui.text(this,"尚未同步长期画像。手机仍可使用本地收藏和行为生成推荐。",12,Ui.MUTED,false));
        for(int i=0;i<top;i++){
            JSONObject row=inferred.optJSONObject(i);if(row==null)continue;
            int base=row.optInt("baselineLevel",5);
            lifetime.addView(SettingsRow.statusLine(this,row.optString("label",row.optString("key","")),Ui.text(this,base+"/10 · "+row.optInt("supportCount",0)+" 本",12,Ui.MUTED,true)));
        }
        content.addView(lifetime);

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
                composition.addView(SettingsRow.statusLine(this,familyLabel(row.getKey()),Ui.text(this,row.getValue()+" 本",12,Ui.MUTED,true)));
        }
        content.addView(composition);

        LinearLayout visual=SettingsRow.panel(this,null);
        visual.addView(Ui.text(this,"Visual 基础",17,Ui.TEXT,true));
        visual.addView(SettingsRow.statusLine(this,"Generation",Ui.text(this,portable.visualGeneration.isEmpty()?"尚未同步":shortId(portable.visualGeneration),12,Ui.MUTED,true)));
        int visualCount=0;for(PortableRecommendationPackageStore.Candidate row:portable.candidates)if(row.visualAvailable)visualCount++;
        visual.addView(SettingsRow.statusLine(this,"候选覆盖",Ui.text(this,visualCount+" / "+portable.candidates.size(),12,Ui.MUTED,true)));
        visual.addView(Ui.text(this,"画风向量与大批量学习仍由 Desktop 完成；手机只消费同步后的轻量信号，不运行 DINOv2。",12,Ui.MUTED,false));
        content.addView(visual);
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
