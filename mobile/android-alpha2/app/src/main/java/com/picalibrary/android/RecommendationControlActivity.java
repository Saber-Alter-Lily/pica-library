package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.*;
import androidx.core.widget.NestedScrollView;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/**
 * Android-local Recommendation V5 preference editor.
 * Persistent edits affect Android immediately and stay queued until an explicit
 * Desktop sync. Session Intent is intentionally device-local.
 */
public final class RecommendationControlActivity extends LocaleAwareActivity {
    private LinearLayout content;
    private EditText search;
    private String activeQuery="";
    private JSONObject manualSignal;
    private JSONObject loadedState=new JSONObject();
    private JSONArray loadedControls=new JSONArray(),loadedInferred=new JSONArray();
    private final Set<String> expanded=new LinkedHashSet<>();
    private final Set<String> expandedFacets=new LinkedHashSet<>();
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private int loadGeneration;
    private boolean destroyed;

    @Override public void onCreate(Bundle state){
        super.onCreate(state);Ui.applyWindow(this);expanded.add("people");activeQuery=getIntent().getStringExtra("query");if(activeQuery==null)activeQuery="";renderShell();
    }
    @Override protected void onResume(){super.onResume();loadAsync();}
    @Override protected void onDestroy(){destroyed=true;++loadGeneration;worker.shutdownNow();super.onDestroy();}

    private void renderShell(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));
        bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));
        bar.addView(Ui.text(this,"人工调整",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,10),Ui.dp(this,14),Ui.dp(this,28));scroll.addView(content);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();showLoading();
    }

    private void showLoading(){
        if(content==null)return;content.removeAllViews();
        LinearLayout panel=SettingsRow.panel(this,null);
        panel.addView(Ui.text(this,"正在读取人工调整画像…",16,Ui.TEXT,true));
        ProgressBar progress=new ProgressBar(this);progress.setIndeterminate(true);panel.addView(progress);
        panel.addView(Ui.text(this,"偏好与标签画像在后台整理，页面不会被大 JSON 解析阻塞。",12,Ui.MUTED,false));
        content.addView(panel);
    }

    private void loadAsync(){
        if(content==null||destroyed)return;
        final int generation=++loadGeneration;
        showLoading();
        worker.submit(()->{
            try{
                Context app=getApplicationContext();
                JSONObject state=RecommendationPolicyStore.snapshot(app);
                JSONArray controls=state.optJSONArray("controls");if(controls==null)controls=new JSONArray();
                UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(app);
                JSONArray inferred=RecommendationLocalProfile.inferred(app,catalog,state);
                final JSONObject finalState=state;final JSONArray finalControls=controls,finalInferred=inferred;
                runOnUiThread(()->{if(destroyed||generation!=loadGeneration)return;renderLoaded(finalState,finalControls,finalInferred);});
            }catch(Exception e){
                runOnUiThread(()->{
                    if(destroyed||generation!=loadGeneration)return;
                    content.removeAllViews();
                    LinearLayout panel=SettingsRow.panel(this,null);
                    panel.addView(Ui.text(this,"人工调整读取失败",16,Ui.TEXT,true));
                    panel.addView(Ui.text(this,e.getMessage()==null?"请返回后重试":e.getMessage(),12,Ui.MUTED,false));
                    content.addView(panel);
                });
            }
        });
    }

    private void renderLoaded(JSONObject state,JSONArray currentControls,JSONArray inferred){
        if(content==null)return;content.removeAllViews();
        loadedState=state==null?new JSONObject():state;
        loadedControls=currentControls==null?new JSONArray():currentControls;
        loadedInferred=inferred==null?new JSONArray():inferred;
        state=loadedState;currentControls=loadedControls;
        JSONObject intent=state.optJSONObject("sessionIntent");
        int blockedTargets=0;for(int i=0;i<currentControls.length();i++){JSONObject row=currentControls.optJSONObject(i);if(row!=null&&"BLOCK".equals(row.optString("direction")))blockedTargets++;}
        JSONArray hardSuppressed=state.optJSONArray("hardSuppressComicIds");
        int hardSuppressedCount=hardSuppressed==null?0:hardSuppressed.length();
        LinearLayout intro=SettingsRow.panel(this,null);
        intro.addView(Ui.headingWithInfo(this,"调整规则",16,"0–10 档与屏蔽会立即影响手机自己的下一次排序；5 是中性起点，0 是最强软减少但不等于屏蔽。没有收藏画像时也可以自行添加标签建立初始推荐。连接后可在“推荐同步”里查看两边差异并决定是否合并。本次想看只属于当前手机 Session。"));
        intro.addView(SettingsRow.statusLine(this,"Portable Policy",Ui.text(this,"revision "+state.optInt("revision",0),12,Ui.MUTED,true)));
        intro.addView(SettingsRow.statusLine(this,"待同步人工调整",Ui.text(this,RecommendationPolicyStore.pendingControlCount(this)+" 项",12,RecommendationPolicyStore.pendingControlCount(this)>0?Ui.PRIMARY:Ui.MUTED,true)));
        String session=intent!=null&&"TARGET".equals(intent.optString("mode"))?intent.optString("label",intent.optString("key","")):"默认";
        intro.addView(SettingsRow.statusLine(this,"本次想看",Ui.text(this,session+" · 仅本机",12,Ui.MUTED,true)));
        intro.addView(SettingsRow.statusLine(this,"屏蔽偏好 / 作品",Ui.text(this,blockedTargets+" / "+hardSuppressedCount,12,Ui.MUTED,true)));
        content.addView(intro);

        LinearLayout actions=new LinearLayout(this);actions.setGravity(Gravity.CENTER_VERTICAL);
        actions.addView(Ui.button(this,"推荐同步",v->startActivity(new Intent(this,RecommendationSyncActivity.class)),false),new LinearLayout.LayoutParams(0,-2,1));
        Ui.gap(actions,this,6);
        actions.addView(Ui.button(this,"清除本次想看",v->{RecommendationPolicyStore.clearLocalSessionIntent(this);loadAsync();},true),new LinearLayout.LayoutParams(0,-2,1));
        content.addView(actions);Ui.gap(content,this,10);

        LinearLayout find=SettingsRow.panel(this,null);
        search=new EditText(this);search.setSingleLine(true);search.setHint(LocalizedText.ui("查找作者、IP、标签或分类"));search.setText(activeQuery);
        find.addView(search,new LinearLayout.LayoutParams(-1,-2));
        find.addView(Ui.button(this,"查找",v->{manualSignal=null;activeQuery=search.getText().toString().trim();renderSignals(activeQuery);},true));
        content.addView(find);

        renderSignals(activeQuery);
    }

    private static final class FacetGroup {
        final String id,label;final List<JSONObject> rows=new ArrayList<>();
        FacetGroup(String id,String label){this.id=id;this.label=label;}
    }
    private static final class Group {
        final String id,label;
        final LinkedHashMap<String,FacetGroup> facets=new LinkedHashMap<>();
        Group(String id,String label){this.id=id;this.label=label;}
        int size(){int count=0;for(FacetGroup facet:facets.values())count+=facet.rows.size();return count;}
    }

    private String currentQuery(){if(search!=null)activeQuery=search.getText().toString().trim();return activeQuery;}

    private void renderSignals(String query){
        while(content.getChildCount()>4)content.removeViewAt(content.getChildCount()-1);
        JSONArray inferred=loadedInferred==null?new JSONArray():loadedInferred;
        if(inferred.length()==0){
            LinearLayout onboarding=SettingsRow.panel(this,null);
            onboarding.addView(Ui.text(this,"还没有收藏画像也可以先配置推荐",14,Ui.TEXT,true));
            onboarding.addView(Ui.text(this,"在上方搜索标签并点击“作为标签添加”，从 5/10 中性起点调整到 0–10。设置为 6–10 的标签会直接作为首轮推荐召回种子。",12,Ui.MUTED,false));
            content.addView(onboarding);
        }
        String q=query==null?"":query.trim().toLowerCase(Locale.ROOT);
        LinkedHashMap<String,Group> groups=new LinkedHashMap<>();
        groups.put("people",new Group("people","人物与作品"));
        groups.put("content",new Group("content","内容与剧情"));
        groups.put("appearance",new Group("appearance","外观与画风"));
        groups.put("behavior",new Group("behavior","行为与偏好"));
        groups.put("format",new Group("format","形式与其他"));
        for(int i=0;i<inferred.length();i++){
            JSONObject row=inferred.optJSONObject(i);if(row==null)continue;
            String label=row.optString("label",row.optString("key",""));
            if(!q.isEmpty()&&!label.toLowerCase(Locale.ROOT).contains(q))continue;
            String type=row.optString("targetType","TAG"),facet=row.optString("facet","");
            String groupId=groupFor(facet,type);
            Group group=groups.get(groupId);
            String facetId=facetIdentity(facet,type),facetLabel=facetLabel(facet,type);
            FacetGroup bucket=group.facets.get(facetId);
            if(bucket==null){bucket=new FacetGroup(facetId,facetLabel);group.facets.put(facetId,bucket);}
            bucket.rows.add(row);
        }
        if(manualSignal!=null&&!q.isEmpty()&&manualSignal.optString("label","").toLowerCase(Locale.ROOT).contains(q)){
            String type=manualSignal.optString("targetType","TAG"),facet=manualSignal.optString("facet","RAW_TAG");
            String groupId=groupFor(facet,type);Group group=groups.get(groupId);
            String facetId=facetIdentity(facet,type),facetLabel=facetLabel(facet,type);
            FacetGroup bucket=group.facets.get(facetId);if(bucket==null){bucket=new FacetGroup(facetId,facetLabel);group.facets.put(facetId,bucket);}bucket.rows.add(manualSignal);
        }
        for(Group group:groups.values()){
            if(group.size()==0)continue;
            boolean open=!q.isEmpty()||expanded.contains(group.id);
            LinearLayout section=SettingsRow.panel(this,null);
            Button header=Ui.foldHeader(this,(open?"▾ ":"▸ ")+group.label+" · "+group.size()+" 项",true,v->{if(expanded.contains(group.id))expanded.remove(group.id);else expanded.add(group.id);renderSignals(currentQuery());});
            section.addView(header,new LinearLayout.LayoutParams(-1,-2));
            if(open){
                for(FacetGroup facet:group.facets.values()){
                    String expansionId=group.id+":"+facet.id;
                    boolean facetOpen=!q.isEmpty()||expandedFacets.contains(expansionId);
                    Button facetHeader=Ui.foldHeader(this,(facetOpen?"▾ ":"▸ ")+facet.label+" · "+facet.rows.size()+" 项",false,v->{if(expandedFacets.contains(expansionId))expandedFacets.remove(expansionId);else expandedFacets.add(expansionId);renderSignals(currentQuery());});
                    LinearLayout.LayoutParams fp=new LinearLayout.LayoutParams(-1,-2);fp.setMargins(0,Ui.dp(this,5),0,0);section.addView(facetHeader,fp);
                    if(facetOpen)addFacetWindow(section,facet.rows);
                }
            }
            content.addView(section);
        }
        if(!q.isEmpty()){
            boolean any=false;for(Group group:groups.values())if(group.size()>0){any=true;break;}
            if(!any){
                LinearLayout empty=SettingsRow.panel(this,null);
                empty.addView(Ui.text(this,"没有找到“"+query+"”。系统不会因为输入文字就自动创建偏好。",13,Ui.MUTED,false));
                empty.addView(Ui.button(this,"作为标签添加",v->{JSONObject row=new JSONObject();try{row.put("targetType","TAG");row.put("key",normalize(query));row.put("label",query);row.put("facet","RAW_TAG");row.put("supportCount",0);row.put("supportShare",0);row.put("baselineLevel",5);row.put("manual",true);row.put("systemUnknown",true);manualSignal=row;}catch(Exception ignored){}renderSignals(query);},true));
                content.addView(empty);
            }
        }
    }

    private void addFacetWindow(LinearLayout parent,List<JSONObject> rows){
        NestedScrollView scroll=new NestedScrollView(this);
        scroll.setNestedScrollingEnabled(false);
        scroll.setFillViewport(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
        scroll.setOnTouchListener((view,event)->{
            int action=event.getActionMasked();
            if(action==MotionEvent.ACTION_DOWN||action==MotionEvent.ACTION_MOVE)
                view.getParent().requestDisallowInterceptTouchEvent(true);
            else if(action==MotionEvent.ACTION_UP||action==MotionEvent.ACTION_CANCEL)
                view.getParent().requestDisallowInterceptTouchEvent(false);
            return false;
        });
        LinearLayout list=new LinearLayout(this);list.setOrientation(LinearLayout.VERTICAL);
        for(JSONObject row:rows)renderSignal(list,row);
        scroll.addView(list,new NestedScrollView.LayoutParams(-1,-2));
        int visible=Math.min(5,Math.max(1,rows.size()));
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,rows.size()>5?Ui.dp(this,visible*118):LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0,Ui.dp(this,4),0,Ui.dp(this,4));
        parent.addView(scroll,lp);
    }

    private void renderSignal(LinearLayout parent,JSONObject row){
        String type=row.optString("targetType","TAG"),key=row.optString("key",""),label=row.optString("label",key);
        int baseline=Math.max(0,Math.min(10,row.optInt("baselineLevel",5)));
        JSONObject control=findControl(type,key);
        boolean blocked=control!=null&&"BLOCK".equals(control.optString("direction"));
        int current=baseline;
        if(control!=null&&control.has("levelDelta"))current=Math.max(0,Math.min(10,baseline+control.optInt("levelDelta",0)));

        LinearLayout card=Ui.card(this);
        LinearLayout heading=new LinearLayout(this);heading.setGravity(Gravity.CENTER_VERTICAL);
        heading.addView(Ui.text(this,label,15,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));
        TextView value=Ui.text(this,blocked?"已屏蔽":current+"/10",13,blocked?Ui.BAD:Ui.PRIMARY,true);heading.addView(value);
        card.addView(heading);
        card.addView(Ui.text(this,typeLabel(type)+" · "+(row.optBoolean("systemUnknown",false)?"系统未判断 · 5/10 中性起点":"系统 "+baseline+"/10 · 证据 "+row.optInt("supportCount",0)+" 本"),11.5f,Ui.MUTED,false));

        SeekBar slider=new SeekBar(this);slider.setMax(10);slider.setProgress(current);slider.setEnabled(!blocked);
        final int base=baseline;
        slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
            public void onProgressChanged(SeekBar bar,int progress,boolean fromUser){if(fromUser)value.setText(progress+"/10");}
            public void onStartTrackingTouch(SeekBar bar){}
            public void onStopTrackingTouch(SeekBar bar){int desired=bar.getProgress(),delta=desired-base;String direction=delta>0?"MORE":delta<0?"LESS":"DEFAULT";RecommendationPolicyStore.setLocalControl(RecommendationControlActivity.this,type,key,label,direction,"PERSISTENT",delta);loadAsync();}
        });
        card.addView(slider);

        LinearLayout buttons=new LinearLayout(this);buttons.setGravity(Gravity.CENTER_VERTICAL);
        buttons.addView(Ui.button(this,blocked?"取消屏蔽":"屏蔽",v->{RecommendationPolicyStore.setLocalControl(this,type,key,label,blocked?"DEFAULT":"BLOCK","PERSISTENT",null);loadAsync();},true),new LinearLayout.LayoutParams(0,-2,1));
        Ui.gap(buttons,this,6);
        buttons.addView(Ui.button(this,"本次想看",v->{RecommendationPolicyStore.setLocalSessionIntent(this,type,key,label);loadAsync();},true),new LinearLayout.LayoutParams(0,-2,1));
        card.addView(buttons);
        parent.addView(card);
    }

    private JSONObject findControl(String type,String key){
        JSONArray controls=loadedControls==null?new JSONArray():loadedControls;
        String normalized=normalize(key);
        for(int i=0;i<controls.length();i++){
            JSONObject row=controls.optJSONObject(i);if(row==null)continue;
            if(type.equals(row.optString("targetType"))&&normalized.equals(normalize(row.optString("key"))))return row;
        }
        return null;
    }
    private String normalize(String value){return value==null?"":value.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+"," ");}
    private String typeLabel(String type){if("AUTHOR".equals(type))return "作者";if("CATEGORY".equals(type))return "分类";if("FANDOM".equals(type))return "作品 / IP";if("STYLE_FAMILY".equals(type))return "画风族";return "标签";}
    private String facetIdentity(String facet,String type){if("AUTHOR".equals(type)||"CATEGORY".equals(type)||"FANDOM".equals(type)||"STYLE_FAMILY".equals(type))return type;return facet==null||facet.isEmpty()?"OTHER":facet;}
    private String facetLabel(String facet,String type){
        if("AUTHOR".equals(type))return "作者";if("CATEGORY".equals(type))return "分类";if("FANDOM".equals(type))return "作品 / IP";if("STYLE_FAMILY".equals(type))return "画风族";
        if("FANDOM_CHARACTER".equals(facet))return "角色";if("GENRE_THEME".equals(facet))return "题材 / 类型";if("STORY_TROPE".equals(facet))return "剧情 / 设定";
        if("RELATIONSHIP".equals(facet)||"RELATIONSHIP_TROPE".equals(facet))return "人物关系";if("IDENTITY_ROLE".equals(facet)||"CHARACTER_IDENTITY_ROLE".equals(facet))return "身份 / 职业";
        if("SPECIES_FANTASY".equals(facet))return "种族 / 幻想";if("APPEARANCE_TRAIT".equals(facet)||"APPEARANCE_OUTFIT".equals(facet))return "外观 / 服装";
        if("BODY_ATTRIBUTE".equals(facet)||"CHARACTER_BODY_ATTRIBUTE".equals(facet))return "身体特征";if("SETTING_LOCATION".equals(facet))return "场景 / 地点";
        if("SEXUAL_BEHAVIOR".equals(facet)||"CONTENT_BEHAVIOR".equals(facet))return "行为";if("FETISH_TROPE".equals(facet))return "偏好 / 情境";
        if("PHYSIOLOGY_STATE".equals(facet))return "生理状态";if("CONTROL_COERCION".equals(facet))return "支配 / 控制";if("VISUAL_STYLE".equals(facet))return "画风";
        if("AUDIENCE_ORIENTATION".equals(facet))return "受众倾向";if("FORMAT".equals(facet))return "形式";return "其他标签";
    }
    private String groupFor(String facet,String type){
        if("AUTHOR".equals(type)||"FANDOM".equals(type)||Arrays.asList("CREATOR_ENTITY","FANDOM_IP","FANDOM_CHARACTER","IDENTITY_ROLE","CHARACTER_IDENTITY_ROLE","SPECIES_FANTASY","RELATIONSHIP","RELATIONSHIP_TROPE","AUDIENCE_ORIENTATION").contains(facet))return "people";
        if(Arrays.asList("CATEGORY","GENRE_THEME","STORY_TROPE","SETTING_LOCATION","PHYSIOLOGY_STATE").contains(facet))return "content";
        if("STYLE_FAMILY".equals(type)||Arrays.asList("APPEARANCE_TRAIT","APPEARANCE_OUTFIT","BODY_ATTRIBUTE","CHARACTER_BODY_ATTRIBUTE","VISUAL_STYLE").contains(facet))return "appearance";
        if(Arrays.asList("SEXUAL_BEHAVIOR","CONTENT_BEHAVIOR","FETISH_TROPE","CONTROL_COERCION").contains(facet))return "behavior";
        return "format";
    }
}
