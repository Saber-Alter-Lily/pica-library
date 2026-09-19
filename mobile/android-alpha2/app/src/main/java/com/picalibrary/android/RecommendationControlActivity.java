package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;
import java.util.*;
import org.json.*;

/**
 * Android-local Recommendation V5 preference editor.
 * Persistent edits affect Android immediately and stay queued until an explicit
 * Desktop sync. Session Intent is intentionally device-local.
 */
public final class RecommendationControlActivity extends Activity {
    private LinearLayout content;
    private EditText search;
    private final Set<String> expanded=new LinkedHashSet<>();

    @Override public void onCreate(Bundle state){
        super.onCreate(state);Ui.applyWindow(this);expanded.add("people");renderShell();
    }
    @Override protected void onResume(){super.onResume();render();}

    private void renderShell(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));
        bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));
        bar.addView(Ui.text(this,"人工调整",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,10),Ui.dp(this,14),Ui.dp(this,28));scroll.addView(content);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();render();
    }

    private void render(){
        if(content==null)return;content.removeAllViews();
        JSONObject state=RecommendationPolicyStore.snapshot(this),intent=state.optJSONObject("sessionIntent");
        JSONObject counts=state.optJSONObject("counts");
        LinearLayout intro=SettingsRow.panel(this,null);
        intro.addView(Ui.headingWithInfo(this,"调整规则",16,"1–10 档与屏蔽会立即影响手机自己的下一次排序；不会自动覆盖电脑。连接后可在“推荐同步”里查看两边差异并决定是否合并。本次想看只属于当前手机 Session。"));
        intro.addView(SettingsRow.statusLine(this,"Portable Policy",Ui.text(this,"revision "+state.optInt("revision",0),12,Ui.MUTED,true)));
        intro.addView(SettingsRow.statusLine(this,"待同步人工调整",Ui.text(this,RecommendationPolicyStore.pendingControlCount(this)+" 项",12,RecommendationPolicyStore.pendingControlCount(this)>0?Ui.PRIMARY:Ui.MUTED,true)));
        String session=intent!=null&&"TARGET".equals(intent.optString("mode"))?intent.optString("label",intent.optString("key","")):"默认";
        intro.addView(SettingsRow.statusLine(this,"本次想看",Ui.text(this,session+" · 仅本机",12,Ui.MUTED,true)));
        if(counts!=null)intro.addView(SettingsRow.statusLine(this,"屏蔽偏好 / 作品",Ui.text(this,counts.optInt("blockedTargets",0)+" / "+counts.optInt("hardSuppressed",0),12,Ui.MUTED,true)));
        content.addView(intro);

        LinearLayout actions=new LinearLayout(this);actions.setGravity(Gravity.CENTER_VERTICAL);
        actions.addView(Ui.button(this,"推荐同步",v->startActivity(new Intent(this,RecommendationSyncActivity.class)),false),new LinearLayout.LayoutParams(0,-2,1));
        Ui.gap(actions,this,6);
        actions.addView(Ui.button(this,"清除本次想看",v->{RecommendationPolicyStore.clearLocalSessionIntent(this);render();},true),new LinearLayout.LayoutParams(0,-2,1));
        content.addView(actions);Ui.gap(content,this,10);

        LinearLayout find=SettingsRow.panel(this,null);
        search=new EditText(this);search.setSingleLine(true);search.setHint("查找作者、IP、标签或分类");
        find.addView(search,new LinearLayout.LayoutParams(-1,-2));
        find.addView(Ui.button(this,"查找",v->renderSignals(search.getText().toString().trim()),true));
        content.addView(find);

        renderSignals("");
    }

    private static final class Group {
        final String id,label;final List<JSONObject> rows=new ArrayList<>();
        Group(String id,String label){this.id=id;this.label=label;}
    }

    private void renderSignals(String query){
        while(content.getChildCount()>4)content.removeViewAt(content.getChildCount()-1);
        JSONArray inferred=RecommendationLocalProfile.inferred(this);
        if(inferred.length()==0){
            content.addView(Ui.text(this,BridgeStore.paired(this)?"尚未取得完整画像。先到“推荐同步”同步基础数据。":"尚未同步 Desktop 长期画像；手机仍会使用本地收藏和行为运行推荐。",13,Ui.MUTED,false));
            return;
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
            String group=groupFor(row.optString("facet",""),row.optString("targetType",""));
            groups.get(group).rows.add(row);
        }
        for(Group group:groups.values()){
            if(group.rows.isEmpty())continue;
            boolean open=!q.isEmpty()||expanded.contains(group.id);
            LinearLayout section=SettingsRow.panel(this,null);
            Button header=Ui.button(this,(open?"▾ ":"▸ ")+group.label+" · "+group.rows.size()+" 项",v->{if(expanded.contains(group.id))expanded.remove(group.id);else expanded.add(group.id);render();},true);
            section.addView(header,new LinearLayout.LayoutParams(-1,-2));
            if(open)for(JSONObject row:group.rows)renderSignal(section,row);
            content.addView(section);
        }
        if(!q.isEmpty()){
            boolean any=false;for(Group group:groups.values())if(!group.rows.isEmpty()){any=true;break;}
            if(!any)content.addView(Ui.text(this,"没有找到“"+query+"”。手机不会因为输入文字就自动创建新标签。",13,Ui.MUTED,false));
        }
    }

    private void renderSignal(LinearLayout parent,JSONObject row){
        String type=row.optString("targetType","TAG"),key=row.optString("key",""),label=row.optString("label",key);
        int baseline=Math.max(1,Math.min(10,row.optInt("baselineLevel",5)));
        JSONObject control=findControl(type,key);
        boolean blocked=control!=null&&"BLOCK".equals(control.optString("direction"));
        int current=baseline;
        if(control!=null&&control.has("levelDelta"))current=Math.max(1,Math.min(10,baseline+control.optInt("levelDelta",0)));

        LinearLayout card=Ui.card(this);
        LinearLayout heading=new LinearLayout(this);heading.setGravity(Gravity.CENTER_VERTICAL);
        heading.addView(Ui.text(this,label,15,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));
        TextView value=Ui.text(this,blocked?"已屏蔽":current+"/10",13,blocked?Ui.BAD:Ui.PRIMARY,true);heading.addView(value);
        card.addView(heading);
        card.addView(Ui.text(this,typeLabel(type)+" · 系统 "+baseline+"/10 · 证据 "+row.optInt("supportCount",0)+" 本",11.5f,Ui.MUTED,false));

        SeekBar slider=new SeekBar(this);slider.setMax(9);slider.setProgress(current-1);slider.setEnabled(!blocked);
        final int base=baseline;
        slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
            public void onProgressChanged(SeekBar bar,int progress,boolean fromUser){if(fromUser)value.setText((progress+1)+"/10");}
            public void onStartTrackingTouch(SeekBar bar){}
            public void onStopTrackingTouch(SeekBar bar){int desired=bar.getProgress()+1,delta=desired-base;String direction=delta>0?"MORE":delta<0?"LESS":"DEFAULT";RecommendationPolicyStore.setLocalControl(RecommendationControlActivity.this,type,key,label,direction,"PERSISTENT",delta);render();}
        });
        card.addView(slider);

        LinearLayout buttons=new LinearLayout(this);buttons.setGravity(Gravity.CENTER_VERTICAL);
        buttons.addView(Ui.button(this,blocked?"取消屏蔽":"屏蔽",v->{RecommendationPolicyStore.setLocalControl(this,type,key,label,blocked?"DEFAULT":"BLOCK","PERSISTENT",null);render();},true),new LinearLayout.LayoutParams(0,-2,1));
        Ui.gap(buttons,this,6);
        buttons.addView(Ui.button(this,"本次想看",v->{RecommendationPolicyStore.setLocalSessionIntent(this,type,key,label);render();},true),new LinearLayout.LayoutParams(0,-2,1));
        card.addView(buttons);
        parent.addView(card);
    }

    private JSONObject findControl(String type,String key){
        JSONArray controls=RecommendationPolicyStore.controls(this);
        String normalized=normalize(key);
        for(int i=0;i<controls.length();i++){
            JSONObject row=controls.optJSONObject(i);if(row==null)continue;
            if(type.equals(row.optString("targetType"))&&normalized.equals(normalize(row.optString("key"))))return row;
        }
        return null;
    }
    private String normalize(String value){return value==null?"":value.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+"," ");}
    private String typeLabel(String type){if("AUTHOR".equals(type))return "作者";if("CATEGORY".equals(type))return "分类";if("FANDOM".equals(type))return "作品 / IP";if("STYLE_FAMILY".equals(type))return "画风族";return "标签";}
    private String groupFor(String facet,String type){
        if("AUTHOR".equals(type)||"FANDOM".equals(type)||Arrays.asList("CREATOR_ENTITY","FANDOM_IP","FANDOM_CHARACTER","IDENTITY_ROLE","CHARACTER_IDENTITY_ROLE","SPECIES_FANTASY","RELATIONSHIP","RELATIONSHIP_TROPE","AUDIENCE_ORIENTATION").contains(facet))return "people";
        if(Arrays.asList("CATEGORY","GENRE_THEME","STORY_TROPE","SETTING_LOCATION","PHYSIOLOGY_STATE").contains(facet))return "content";
        if("STYLE_FAMILY".equals(type)||Arrays.asList("APPEARANCE_TRAIT","APPEARANCE_OUTFIT","BODY_ATTRIBUTE","CHARACTER_BODY_ATTRIBUTE","VISUAL_STYLE").contains(facet))return "appearance";
        if(Arrays.asList("SEXUAL_BEHAVIOR","CONTENT_BEHAVIOR","FETISH_TROPE","CONTROL_COERCION").contains(facet))return "behavior";
        return "format";
    }
}
