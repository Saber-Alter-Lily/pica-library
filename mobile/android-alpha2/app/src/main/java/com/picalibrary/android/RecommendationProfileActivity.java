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
    private static final String VIEW_PREFS="recommendation-profile-view-v1";
    private boolean hideBlocked,hideLess;

    private String tr(String zh,String en,String ja){return LocalizedText.ui(this,zh,en,ja);}
    private void saveDisplayFilter(){
        getSharedPreferences(VIEW_PREFS,MODE_PRIVATE).edit()
            .putBoolean("hideBlocked",hideBlocked).putBoolean("hideLess",hideLess).apply();
    }

    @Override public void onCreate(Bundle state){
        super.onCreate(state);Ui.applyWindow(this);
        hideBlocked=getSharedPreferences(VIEW_PREFS,MODE_PRIVATE).getBoolean("hideBlocked",false);
        hideLess=getSharedPreferences(VIEW_PREFS,MODE_PRIVATE).getBoolean("hideLess",false);
        renderShell();
    }
    @Override protected void onResume(){super.onResume();loadAsync();}
    @Override protected void onDestroy(){destroyed=true;++loadGeneration;worker.shutdownNow();super.onDestroy();}

    private void renderShell(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));
        Button back=Ui.button(this,tr("‹ 返回","‹ Back","‹ 戻る"),v->finish(),true);
        back.setMinimumWidth(Ui.dp(this,72));
        bar.addView(back);
        TextView heading=Ui.text(this,tr("推荐画像","Recommendation profile","おすすめプロフィール"),21,Ui.TEXT,true);
        heading.setMaxLines(2);
        bar.addView(heading,new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,10),Ui.dp(this,14),Ui.dp(this,28));scroll.addView(content);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();showLoading();
    }

    private void showLoading(){
        if(content==null)return;content.removeAllViews();
        LinearLayout panel=SettingsRow.panel(this,null);
        panel.addView(Ui.text(this,tr("正在读取本机推荐画像…","Loading the on-device profile…","端末内プロフィールを読み込み中…"),16,Ui.TEXT,true));
        ProgressBar progress=new ProgressBar(this);progress.setIndeterminate(true);panel.addView(progress);
        panel.addView(Ui.text(this,tr("书库、行为证据和 Portable 数据在后台读取，不阻塞页面首帧。","Library, behavior and portable data load off the UI thread.","書庫・行動履歴・共有データは画面を止めずに読み込みます。"),12,Ui.MUTED,false));
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
                    panel.addView(Ui.text(this,tr("推荐画像读取失败","Could not load recommendation profile","おすすめプロフィールを読み込めません"),16,Ui.TEXT,true));
                    panel.addView(Ui.text(this,e.getMessage()==null?tr("请返回后重试","Go back and retry","戻って再試行してください"):e.getMessage(),12,Ui.MUTED,false));
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
        // The actual heading is the spotlight target. Highlighting the entire
        // long card obscures most of the screen under large system fonts.
        TextView runtimeHeading=Ui.text(this,tr("本机推荐运行","On-device recommendation engine","端末内おすすめエンジン"),17,Ui.TEXT,true);
        runtimeHeading.setTag(AndroidOnboarding.ADV_PROFILE_RUNTIME);
        identity.addView(runtimeHeading);
        identity.addView(SettingsRow.statusLine(this,"Engine",Ui.text(this,NativeRecommendationStore.MODEL_VERSION,12,Ui.TEXT,true)));
        identity.addView(SettingsRow.statusLine(this,tr("本机 Cycle","Local cycle","端末内サイクル"),Ui.text(this,runtime.cycleId.isEmpty()?tr("尚未生成","Not generated","未生成"):shortId(runtime.cycleId),12,Ui.MUTED,true)));
        identity.addView(SettingsRow.statusLine(this,tr("当前批次","Current batch","現在のバッチ"),Ui.text(this,runtime.available()?(runtime.batchIndex+1)+" / "+runtime.batches.size():tr("无","None","なし"),12,Ui.MUTED,true)));
        identity.addView(SettingsRow.statusLine(this,"Portable Policy",Ui.text(this,"revision "+policy.optInt("revision",0),12,Ui.MUTED,true)));
        identity.addView(SettingsRow.statusLine(this,tr("候选基础","Candidate pool","候補プール"),Ui.rawText(this,portable.available()?LocalizedText.ui(this,portable.candidates.size()+" 个 · "+shortId(portable.reservoirGeneration),portable.candidates.size()+" items · "+shortId(portable.reservoirGeneration),portable.candidates.size()+" 件 · "+shortId(portable.reservoirGeneration)):tr("尚未同步","Not synced yet","未同期"),12,Ui.MUTED,true)));
        content.addView(identity);

        LinearLayout evidence=SettingsRow.panel(this,null);
        TextView evidenceHeading=Ui.text(this,tr("画像证据","Profile evidence","プロフィールの根拠"),17,Ui.TEXT,true);
        evidenceHeading.setTag(AndroidOnboarding.ADV_PROFILE_EVIDENCE);
        evidence.addView(evidenceHeading);
        evidence.addView(SettingsRow.statusLine(this,tr("手机收藏 / 已拥有","Phone favorites / owned","端末のお気に入り / 所有"),Ui.text(this,data.localFavorites+" / "+data.localOwned,12,Ui.MUTED,true)));
        evidence.addView(SettingsRow.statusLine(this,tr("Portable 人工调整","Saved preference controls","保存済みの嗜好調整"),Ui.rawText(this,LocalizedText.ui(this,(data.localControls==null?0:data.localControls.length())+" 项",(data.localControls==null?0:data.localControls.length())+" items",(data.localControls==null?0:data.localControls.length())+" 件"),12,Ui.MUTED,true)));
        evidence.addView(SettingsRow.statusLine(this,tr("最近 30 天行为","Past 30 days","過去30日間の行動"),Ui.rawText(this,LocalizedText.ui(this,data.recentCount+" 条 · 本机 + 已同步",data.recentCount+" behaviors · local + synced",data.recentCount+" 件の行動 · 端末内 + 同期済み"),12,Ui.MUTED,true)));
        evidence.addView(SettingsRow.statusLine(this,tr("本次手机 Session","This phone session","今回の端末セッション"),Ui.rawText(this,LocalizedText.ui(this,data.sessionCount+" 条",data.sessionCount+" events",data.sessionCount+" 件"),12,Ui.MUTED,true)));
        JSONObject intent=policy.optJSONObject("sessionIntent");
        String session=intent!=null&&"TARGET".equals(intent.optString("mode"))?intent.optString("label",intent.optString("key","")):tr("默认","Default","既定");
        evidence.addView(SettingsRow.statusLine(this,tr("本次想看","Session intent","今回見たいもの"),Ui.rawText(this,LocalizedText.ui(this,session+" · 仅手机",session+" · phone only",session+" · 端末のみ"),12,Ui.MUTED,true)));
        content.addView(evidence);

        addLifetimePanel(data);

        addBehaviorSignals(tr("最近 30 天主要兴趣","Recent interests (30 days)","最近30日間の関心"),data.recentSignals,tr("来自本机和同步的近期行为；单纯曝光不算正向兴趣。","Based on on-device and synced behavior; mere exposure is not positive evidence.","端末内と同期した最近の行動に基づき、表示だけでは好意と見なしません。"));
        addBehaviorSignals(tr("本次会话兴趣","This session’s interests","今回のセッションの関心"),data.sessionSignals,tr("仅当前 Android 会话；不会同步到其他设备的会话意图。","This Android session only; not synced as another device’s session intent.","この Android セッションのみ。他の端末のセッション意図とは同期しません。"));

        LinearLayout composition=SettingsRow.panel(this,null);
        composition.addView(Ui.text(this,tr("当前手机推荐构成","Current recommendation mix","現在のおすすめ構成"),17,Ui.TEXT,true));
        if(!runtime.available())composition.addView(Ui.text(this,tr("尚未生成手机本地推荐周期。","No on-device recommendation cycle yet.","端末内おすすめサイクルはまだありません。"),12,Ui.MUTED,false));
        else{
            Map<String,Integer> families=new LinkedHashMap<>();
            for(NativeRecommendationStore.Item item:runtime.current()){
                String key=item.family==null||item.family.isEmpty()?"OTHER":item.family;
                families.put(key,families.getOrDefault(key,0)+1);
            }
            for(Map.Entry<String,Integer> row:families.entrySet())
                composition.addView(SettingsRow.statusLine(this,familyLabel(row.getKey()),Ui.rawText(this,LocalizedText.ui(this,row.getValue()+" 本",row.getValue()+" works",row.getValue()+" 作品"),12,Ui.MUTED,true)));
            LinkedHashSet<String> reasons=new LinkedHashSet<>();for(NativeRecommendationStore.Item item:runtime.current()){String reason=item.reason==null?"":item.reason.trim();if(!reason.isEmpty())reasons.add(reason);if(reasons.size()>=5)break;}
            if(!reasons.isEmpty()){composition.addView(Ui.text(this,tr("主要依据","Main reasons","主な理由"),13,Ui.TEXT,true));for(String reason:reasons)composition.addView(Ui.text(this,"• "+reason,12,Ui.MUTED,false));}
        }
        content.addView(composition);

        LinearLayout visual=SettingsRow.panel(this,null);
        visual.addView(Ui.headingWithInfo(this,tr("Visual 基础","Visual model","Visual モデル"),17,tr("画风向量与大批量学习由 Desktop 完成；手机使用同步后的轻量画像，不运行 DINOv2。","Visual embeddings are trained on Desktop. Phone uses synced light-weight affinities, not DINOv2.","画風の学習は Desktop で行い、端末では同期済みの軽量データを使用します。DINOv2 は動かしません。")));
        visual.addView(SettingsRow.statusLine(this,"Generation",Ui.text(this,portable.visualGeneration.isEmpty()?"尚未同步":shortId(portable.visualGeneration),12,Ui.MUTED,true)));
        visual.addView(SettingsRow.statusLine(this,tr("候选覆盖","Candidate coverage","候補のカバー率"),Ui.text(this,data.visualCount+" / "+portable.candidates.size(),12,Ui.MUTED,true)));
        content.addView(visual);
    }


    /**
     * Presentation-only controls for the existing top-ten collection evidence.
     * Intentionally does not call setLocalControls, mutate policy, rank again,
     * change supportCount, or backfill lower-ranked entries.
     */
    private void addLifetimePanel(ProfileData data){
        JSONArray inferred=data.inferred==null?new JSONArray():data.inferred;
        LinearLayout panel=SettingsRow.panel(this,null);
        panel.addView(Ui.text(this,tr("长期主要兴趣","Long-term collection signals","長期的な収集シグナル"),17,Ui.TEXT,true));
        panel.addView(Ui.text(this,tr("依据原始收藏与已同步画像排序，不等于明确喜欢。过滤仅影响当前手机的显示。","Ranked by the original collection evidence, not a declaration of what you like. Filters only change this phone’s display.","元の収集データによる順位であり、好みの申告ではありません。フィルターはこの端末の表示だけに作用します。"),12,Ui.MUTED,false));
        CheckBox blocked=new CheckBox(this);
        blocked.setText(tr("隐藏已屏蔽 (BLOCK) 的项目","Hide blocked (BLOCK) items","ブロック (BLOCK) 項目を隠す"));
        blocked.setTextColor(Ui.TEXT);
        blocked.setChecked(hideBlocked);
        panel.addView(blocked);
        CheckBox less=new CheckBox(this);
        less.setText(tr("同时隐藏少推荐 (LESS) 的项目","Also hide recommend-less (LESS) items","少なめに推薦 (LESS) も隠す"));
        less.setTextColor(Ui.TEXT);
        less.setChecked(hideLess);
        panel.addView(less);
        LinearLayout rows=new LinearLayout(this);rows.setOrientation(LinearLayout.VERTICAL);
        panel.addView(rows);
        TextView status=Ui.text(this,"",12,Ui.MUTED,false);
        panel.addView(status);

        final Map<String,String> directions=new HashMap<>();
        JSONArray controls=data.localControls==null?new JSONArray():data.localControls;
        for(int i=0;i<controls.length();i++){
            JSONObject control=controls.optJSONObject(i);if(control==null)continue;
            if("SESSION".equalsIgnoreCase(control.optString("scope","PERSISTENT")))continue;
            String key=control.optString("key","");
            if(key.isEmpty())continue;
            String direction=control.optString("direction","");
            if(!"BLOCK".equals(direction)&&!"LESS".equals(direction))continue;
            String identity=control.optString("targetType","TAG").toUpperCase(Locale.ROOT)+":"+MobileTagRegistry.normalize(key);
            if("BLOCK".equals(direction)||!directions.containsKey(identity))directions.put(identity,direction);
        }
        Runnable refresh=()->{
            rows.removeAllViews();
            int hidden=0,visible=0,top=Math.min(10,inferred.length());
            for(int i=0;i<top;i++){
                JSONObject row=inferred.optJSONObject(i);if(row==null)continue;
                String identity=row.optString("targetType","TAG").toUpperCase(Locale.ROOT)+":"+MobileTagRegistry.normalize(row.optString("key",""));
                String direction=directions.getOrDefault(identity,"");
                if((hideBlocked&&"BLOCK".equals(direction))||(hideLess&&"LESS".equals(direction))){hidden++;continue;}
                int base=row.optInt("baselineLevel",5);
                rows.addView(SettingsRow.statusLine(this,row.optString("label",row.optString("key","")),
                    Ui.rawText(this,LocalizedText.ui(this,base+"/10 · "+row.optInt("supportCount",0)+" 本",base+"/10 · "+row.optInt("supportCount",0)+" works",base+"/10 · "+row.optInt("supportCount",0)+" 作品"),12,Ui.MUTED,true)));
                visible++;
            }
            if(top==0)rows.addView(Ui.text(this,tr("尚未同步长期画像，仍可从本地收藏和行为生成推荐。","No long-term profile synced yet; local favorites and behavior still support recommendations.","長期プロフィールは未同期ですが、端末内のお気に入りや行動を使えます。"),12,Ui.MUTED,false));
            else if(visible==0)rows.addView(Ui.text(this,tr("所选过滤下暂无可显示项目。","No items to display with these filters.","このフィルターでは表示項目がありません。"),12,Ui.MUTED,false));
            if(hideBlocked||hideLess)
                status.setText(LocalizedText.ui(this,"当前隐藏 "+hidden+" / "+top+" 项；不从第 11 项后补。收藏数、分母、原始画像和推荐结果未修改。","Hidden "+hidden+" of "+top+" original top items; no backfill. Collection totals, denominators, profile and recommendations are unchanged.","上位 "+top+" 件中 "+hidden+" 件を非表示。次の順位は繰り上げません。収集数・分母・元のプロフィール・おすすめは不変です。"));
            else status.setText(tr("默认展示客观前 10 项；未应用显示过滤。","Original top-ten view; display filters off.","元の上位10項目を表示中。フィルターはオフです。"));
        };
        blocked.setOnCheckedChangeListener((v,checked)->{hideBlocked=checked;saveDisplayFilter();refresh.run();});
        less.setOnCheckedChangeListener((v,checked)->{hideLess=checked;saveDisplayFilter();refresh.run();});
        refresh.run();
        content.addView(panel);
    }

    private void addBehaviorSignals(String title,List<RecommendationEvidenceStore.Signal> rows,String help){
        LinearLayout panel=SettingsRow.panel(this,null);panel.addView(Ui.headingWithInfo(this,title,17,help));
        if(rows==null||rows.isEmpty())panel.addView(Ui.text(this,tr("暂无足够正向行为证据","Not enough positive behavior evidence","正の行動データが不足しています"),12,Ui.MUTED,false));
        else for(RecommendationEvidenceStore.Signal row:rows)panel.addView(SettingsRow.statusLine(this,row.kind+" · "+row.label,Ui.rawText(this,LocalizedText.ui(this,row.support+" 次",row.support+" times",row.support+" 回"),12,Ui.MUTED,true)));
        content.addView(panel);
    }

    private String shortId(String value){return value==null||value.isEmpty()?tr("无","None","なし"):value.substring(0,Math.min(10,value.length()));}
    private String familyLabel(String value){
        if("FANDOM".equals(value))return tr("作品 / IP","Series / IP","作品 / IP");
        if("CREATOR".equals(value))return tr("作者","Creators","作者");
        if("SEMANTIC_CONJUNCTION".equals(value))return tr("组合偏好","Combined interests","複合嗜好");
        if("SEMANTIC_ANCHOR".equals(value))return tr("标签 / 题材","Tags / themes","タグ / 題材");
        if("PORTABLE_RESERVOIR".equals(value))return tr("同步候选池","Synced candidates","同期済み候補");
        if("EXPLORATION".equals(value))return tr("探索","Exploration","探索");
        if("RELATED".equals(value))return tr("相似作品","Related works","関連作品");
        return tr("其他","Other","その他");
    }
}
