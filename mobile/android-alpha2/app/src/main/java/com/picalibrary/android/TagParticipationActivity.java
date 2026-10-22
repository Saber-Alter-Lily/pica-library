package com.picalibrary.android;

import android.app.AlertDialog;
import android.os.Bundle;
import android.text.InputFilter;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Bounded, staged editor. Loading, counting and persistence never trigger provider calls. */
public class TagParticipationActivity extends LocaleAwareActivity {
    private static final int PAGE_SIZE=100;
    private ExecutorService worker;
    protected ExecutorService createWorker(){return Executors.newSingleThreadExecutor();}
    private LinearLayout content,list,footer;
    private TextView status;
    private EditText search;
    private JSONObject draft,baseState;
    private UnifiedCatalogStore.Snapshot catalog;
    private List<Row> directory=new ArrayList<>();
    private int page;
    private String query="",provider="",facet="";
    private boolean destroyed,saving;
    private String error="";

    static final class Row {
        final String identity,label,provider,facet;
        final Set<String> favoriteIds=new HashSet<>();
        Row(String identity,String label,String provider,String facet){this.identity=identity;this.label=label;this.provider=provider;this.facet=facet;}
    }
    static List<Row> directory(UnifiedCatalogStore.Snapshot catalog,MobileTagRegistry registry){
        Map<String,Row> rows=new LinkedHashMap<>();
        for(UnifiedCatalogStore.Entry entry:catalog.entries())for(String raw:entry.tags){
            if(TagParticipation.norm(raw).isEmpty())continue;String provider=TagParticipation.provider(entry.id),identity=TagParticipation.identity(provider,raw),facet="OTHER";
            if("pica".equals(provider)&&registry!=null){MobileTagRegistry.Resolved resolved=registry.resolve(raw);if(resolved.resolved)facet=resolved.facet;}
            else if("eh".equals(provider)&&raw.contains(":"))facet="EH_"+raw.substring(0,raw.indexOf(':'));
            Row row=rows.get(identity);if(row==null){row=new Row(identity,raw,provider,facet);rows.put(identity,row);}if(entry.favorite)row.favoriteIds.add(entry.id);
        }
        List<Row> out=new ArrayList<>(rows.values());out.sort((a,b)->{int group=a.facet.compareTo(b.facet);if(group!=0)return group;int count=Integer.compare(b.favoriteIds.size(),a.favoriteIds.size());return count!=0?count:a.identity.compareTo(b.identity);});return out;
    }
    private String tr(String zh,String en,String ja){return LocalizedText.ui(this,zh,en,ja);}
    private static JSONObject copy(JSONObject value){try{return new JSONObject(value.toString());}catch(JSONException e){throw new IllegalStateException(e);}}
    private TagParticipation policy(){try{return TagParticipation.of(new JSONObject().put("tagPolicy",draft));}catch(JSONException e){throw new IllegalStateException(e);}}
    private boolean dirty(){try{return draft!=null&&!TagParticipation.same(baseState,new JSONObject().put("tagPolicy",draft));}catch(JSONException e){throw new IllegalStateException(e);}}
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);Ui.applyWindow(this);worker=createWorker();
        if(saved!=null)try{draft=TagParticipation.normalize(new JSONObject(saved.getString("tagDraft","{}")));baseState=new JSONObject(saved.getString("tagBase","{}"));query=saved.getString("tagQuery","");provider=saved.getString("tagProvider","");facet=saved.getString("tagFacet","");page=saved.getInt("tagPage",0);}catch(Exception ignored){draft=null;baseState=null;}
        shell();worker.submit(()->{try{JSONObject current=RecommendationPolicyStore.snapshot(getApplicationContext());TagParticipation initial=TagParticipation.of(current);UnifiedCatalogStore.Snapshot local=UnifiedCatalogStore.load(getApplicationContext());MobileTagRegistry registry=null;try{registry=MobileTagRegistry.load(getApplicationContext());}catch(Exception ignored){}List<Row> rows=directory(local,registry);runOnUiThread(()->{if(destroyed)return;catalog=local;directory=rows;if(draft==null){baseState=copy(current);draft=copy(initial.json);}render();});}catch(Exception e){runOnUiThread(()->{if(destroyed)return;status.setText(tr("读取失败，未修改任何设置。请返回后重试。","Load failed. No settings changed; return and retry.","読込に失敗しました。設定は変更していません。戻って再試行してください。"));});}});
    }
    @Override protected void onDestroy(){destroyed=true;if(worker!=null)worker.shutdownNow();super.onDestroy();}
    @Override protected void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);if(draft!=null){out.putString("tagDraft",draft.toString());out.putString("tagBase",baseState.toString());}out.putString("tagQuery",query);out.putString("tagProvider",provider);out.putString("tagFacet",facet);out.putInt("tagPage",page);}
    @Override public void onBackPressed(){close();}
    private void close(){if(saving)return;if(!dirty()){finish();return;}new AlertDialog.Builder(this).setTitle(tr("尚未保存","Unsaved changes","未保存の変更"))
        .setMessage(tr("标签修改仍是草稿。","Tag changes are still a draft.","タグの変更は下書きです。"))
        .setNegativeButton(tr("继续调整","Keep editing","編集を続ける"),null).setPositiveButton(tr("放弃并返回","Discard and return","破棄して戻る"),(d,w)->finish()).show();}
    private void shell(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.addView(Ui.button(this,tr("‹ 返回","‹ Back","‹ 戻る"),v->close(),true));bar.addView(Ui.text(this,tr("用于推荐的标签","Recommendation tag scope","おすすめに使うタグ"),20,Ui.TEXT,true));root.addView(bar);
        ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,8),Ui.dp(this,14),Ui.dp(this,20));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        status=Ui.text(this,tr("正在读取本地标签…","Loading local tags…","ローカルタグを読み込み中…"),13,Ui.MUTED,true);root.addView(status);footer=new LinearLayout(this);footer.setOrientation(LinearLayout.VERTICAL);root.addView(footer);setContentView(root);root.requestApplyInsets();
    }
    private Button button(LinearLayout parent,String label,View.OnClickListener action){Button button=Ui.button(this,label,action,true);button.setEnabled(!saving);parent.addView(button,new LinearLayout.LayoutParams(-1,-2));return button;}
    private void render(){
        if(draft==null||catalog==null)return;content.removeAllViews();footer.removeAllViews();TagParticipation policy=policy();
        content.addView(Ui.text(this,tr("默认全开。关闭标签只停用推荐信号，不隐藏作品。作者、分类和屏蔽规则独立；不会改变 Visual 模式或向量。","All tags participate by default. Disabling a tag removes its taste signal, not works. Author, category and block rules stay independent; Visual mode and embeddings are unchanged.","既定は全タグ参加。無効化は嗜好信号を止めるだけで作品は隠しません。作者・カテゴリ・ブロックは独立で、Visual モードとベクトルは変更しません。"),13,Ui.MUTED,false));
        content.addView(Ui.text(this,tr("本地已观测标签，按分类及收藏涉及作品数排序；不是全站目录，也不是喜好强度。","Locally observed tags, grouped and sorted by favorite-work coverage, not a complete provider list or liking strength.","端末で観測したタグを分類・お気に入り作品数順で表示します。全サイト一覧や好みの強さではありません。"),12,Ui.MUTED,false));
        content.addView(Ui.text(this,"ALL".equals(policy.mode)?tr("全部参与（可排除个别）","All participate (with exceptions)","全て参加（個別除外可）"):tr("仅选中参与；新发现标签默认关闭","Selected only; newly discovered tags stay off","選択したタグのみ・新規タグは不参加"),14,Ui.TEXT,true));
        button(content,tr("全开","Enable all","全て有効"),v->setMode("ALL")).setTag("tag-all");button(content,tr("全关","Disable all","全て無効"),v->setMode("SELECTED")).setTag("tag-none");
        search=new EditText(this);search.setSingleLine(true);search.setFilters(new InputFilter[]{new InputFilter.LengthFilter(160)});search.setHint(tr("查找标签","Find tags","タグを検索"));search.setText(query);content.addView(search);
        button(content,tr("查找","Find","検索"),v->{query=search.getText().toString().trim();page=0;render();});search.setOnEditorActionListener((v,a,event)->{query=search.getText().toString().trim();page=0;render();return true;});
        addFilter(content,Arrays.asList("","pica","eh","jm","private"),provider,value->{if(!provider.equals(value)){provider=value;page=0;render();}},true);
        List<String> facets=new ArrayList<>();facets.add("");for(Row row:directory)if(!facets.contains(row.facet))facets.add(row.facet);facets.add("PRIVATE");addFilter(content,facets,facet,value->{if(!facet.equals(value)){facet=value;page=0;render();}},false);
        list=new LinearLayout(this);list.setOrientation(LinearLayout.VERTICAL);content.addView(list);List<Row> rows=new ArrayList<>(directory);
        for(JSONObject tag:policy.privateTags)rows.add(new Row("private|"+tag.optString("id"),tag.optString("name"),"private","PRIVATE"));
        List<Row> filtered=new ArrayList<>();for(Row row:rows)if((provider.isEmpty()||provider.equals(row.provider))&&(facet.isEmpty()||facet.equals(row.facet))&&(query.isEmpty()||TagParticipation.norm(row.label+" "+row.identity).contains(TagParticipation.norm(query))))filtered.add(row);
        int pages=Math.max(1,(filtered.size()+PAGE_SIZE-1)/PAGE_SIZE);page=Math.min(Math.max(0,page),pages-1);
        for(Row row:filtered.subList(page*PAGE_SIZE,Math.min(filtered.size(),(page+1)*PAGE_SIZE))){
            CheckBox check=new CheckBox(this);check.setTag("tag-row:"+row.identity);check.setText(row.label+" · "+row.provider.toUpperCase(Locale.ROOT)+" · "+groupLabel(row.facet)+("private".equals(row.provider)?"":tr(" · 收藏涉及 "," · Favorite coverage "," · お気に入り作品数 ")+row.favoriteIds.size()));check.setTextColor(Ui.TEXT);check.setChecked(policy.enabled(row.identity));check.setEnabled(!saving);check.setOnCheckedChangeListener((b,value)->toggle(row.identity,value));list.addView(check);
            if("private".equals(row.provider)){JSONObject tag=policy.privateTag(TagParticipation.PREFIX+row.identity.substring(8));button(list,tr("编辑此私人标签","Edit private label","この個人タグを編集"),v->editPrivate(tag,tag.optString("kind")));button(list,tr("删除标签（不删除作品）","Delete label (keep works)","タグ削除（作品は残す）"),v->deletePrivate(tag));}
        }
        if(filtered.isEmpty())list.addView(Ui.text(this,tr("没有匹配项，不会自动创建标签。","No matches; search never creates tags automatically.","一致なし。検索語を自動でタグにしません。"),13,Ui.MUTED,false));
        LinearLayout navigation=new LinearLayout(this);Button previous=button(navigation,tr("上一页","Previous","前へ"),v->{page--;render();});previous.setEnabled(page>0&&!saving);Button next=button(navigation,tr("下一页","Next","次へ"),v->{page++;render();});next.setEnabled(page+1<pages&&!saving);for(int i=0;i<navigation.getChildCount();i++)navigation.getChildAt(i).setLayoutParams(new LinearLayout.LayoutParams(0,-2,1));content.addView(navigation);content.addView(Ui.text(this,(page+1)+" / "+pages+" · "+filtered.size(),12,Ui.MUTED,false));
        button(content,tr("新建手工绑定标签","New manual label","手動タグを作成"),v->editPrivate(null,"MANUAL"));button(content,tr("新建原始标签映射","New mapped label","対応付けタグを作成"),v->editPrivate(null,"MAPPED"));
        content.addView(Ui.text(this,tr("私人标签是你的标注，不是平台事实或画风自动分类。手工绑定只识别所选作品；映射按任一所选原始标签匹配，独立于原标签开关。","Private labels are your annotations, not provider facts or automatic style classes. Manual labels recognize only selected works. Mappings match ANY selected raw tag independently of its switch.","個人タグは注釈で、サイトの事実や画風の自動分類ではありません。手動は選択作品のみ、対応付けはいずれかの元タグで一致し、元タグの参加設定と独立です。"),12,Ui.MUTED,false));
        Button undo=button(footer,tr("撤销修改","Undo changes","変更を破棄"),v->{draft=copy(TagParticipation.of(baseState).json);error="";render();});undo.setTag("tag-undo");undo.setEnabled(dirty()&&!saving);
        Button save=button(footer,tr("保存并应用本机","Save and apply locally","保存して端末に適用"),v->save());save.setTag("tag-save");save.setEnabled(dirty()&&!saving);updateStatus();
    }
    private interface Selection{void select(String value);}
    private void addFilter(LinearLayout parent,List<String> values,String current,Selection action,boolean providers){Spinner spinner=new Spinner(this);List<String> labels=new ArrayList<>();for(String value:values)labels.add(value.isEmpty()?tr("全部","All","全て"):providers?(value.equals("private")?tr("私人","Private","個人"):value.toUpperCase(Locale.ROOT)):groupLabel(value));spinner.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,labels));spinner.setSelection(Math.max(0,values.indexOf(current)));spinner.setEnabled(!saving);spinner.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener(){public void onNothingSelected(android.widget.AdapterView<?> p){}public void onItemSelected(android.widget.AdapterView<?> p,View v,int pos,long id){action.select(values.get(pos));}});parent.addView(spinner);}
    private String groupLabel(String value){if(value.equals("PRIVATE"))return tr("私人标签","Private labels","個人タグ");if(value.startsWith("EH_"))return "E-H · "+value.substring(3);if(value.contains("FANDOM"))return tr("作品与角色","Works and characters","作品・キャラクター");if(value.contains("APPEARANCE")||value.contains("BODY"))return tr("外观与身体","Appearance and body","外見・身体");if(value.contains("ROLE")||value.contains("IDENTITY")||value.contains("RELATION"))return tr("人物与关系","People and relationships","人物・関係");if(value.contains("GENRE")||value.contains("STORY")||value.contains("SETTING"))return tr("题材与设定","Theme and setting","テーマ・設定");if(value.contains("BEHAVIOR")||value.contains("FETISH")||value.contains("CONTROL")||value.contains("CONTENT"))return tr("行为与情境","Behavior and situations","行動・状況");if(value.equals("VISUAL_STYLE"))return tr("平台标注画风","Provider style annotation","サイトの画風表記");return tr("其他 / 未分类","Other / unclassified","その他・未分類");}
    private void updateStatus(){status.setText(saving?tr("正在保存…","Saving…","保存中…"):!error.isEmpty()?error:dirty()?tr("尚未保存","Unsaved changes","未保存"):tr("已保存","Saved","保存済み"));}
    private void setMode(String mode){try{draft.put("mode",mode);draft.put("selected",new JSONArray());draft.put("disabled",new JSONArray());draft=TagParticipation.normalize(draft);error="";render();}catch(Exception e){error=e.getMessage();updateStatus();}}
    private void toggle(String identity,boolean checked){try{String field="ALL".equals(draft.optString("mode"))?"disabled":"selected";Set<String> values=TagParticipation.set(draft.optJSONArray(field));boolean add=field.equals("disabled")?!checked:checked;if(add)values.add(identity);else values.remove(identity);draft.put(field,new JSONArray(values));draft=TagParticipation.normalize(draft);error="";for(int i=0;i<footer.getChildCount();i++)footer.getChildAt(i).setEnabled(dirty()&&!saving);updateStatus();}catch(Exception e){error=e.getMessage();updateStatus();}}
    private void save(){
        if(saving||!dirty())return;saving=true;render();final JSONObject next=copy(draft),expected=copy(baseState);
        worker.submit(()->{try{RecommendationPolicyStore.setLocalTagPolicy(getApplicationContext(),next,expected);JSONObject saved=RecommendationPolicyStore.snapshot(getApplicationContext());runOnUiThread(()->{if(destroyed)return;saving=false;baseState=copy(saved);draft=copy(TagParticipation.of(saved).json);error=tr("已保存：缓存按新规则重排；未重新召回。可在推荐同步中合并到电脑。","Saved: cache reranked under new rules; no new retrieval. Merge to Desktop in Recommendation sync.","保存済み。新設定でキャッシュ内を再順位付けし、再取得はしません。おすすめ同期で PC に反映できます。");render();});}catch(Exception e){runOnUiThread(()->{if(destroyed)return;saving=false;error=tr("保存失败，草稿仍保留。其他界面可能已修改方案，请返回后重试。","Save failed; draft retained. Another screen may have changed the scheme. Return and retry.","保存失敗。下書きは保持しました。別画面で変更されている可能性があります。戻って再試行してください。");render();});}});
    }
    private void deletePrivate(JSONObject tag){new AlertDialog.Builder(this).setTitle(tr("删除私人标签？","Delete private label?","個人タグを削除しますか？"))
        .setMessage(tr("不删除作品、下载或原始标签。依赖此私人标签的匹配也会停止。","Works, downloads and raw tags remain. Matches relying on this private label will stop.","作品・ダウンロード・元タグは残ります。この個人タグによる一致は停止します。"))
        .setNegativeButton(tr("取消","Cancel","キャンセル"),null).setPositiveButton(tr("删除并暂存","Stage deletion","削除を仮保存"),(d,w)->{try{JSONArray remaining=new JSONArray();for(JSONObject row:policy().privateTags)if(!row.optString("id").equals(tag.optString("id")))remaining.put(row);draft.put("privateTags",remaining);draft=TagParticipation.normalize(draft);toggle("private|"+tag.optString("id"),false);render();}catch(Exception e){error=e.getMessage();updateStatus();}}).show();}
    private void editPrivate(JSONObject existing,String kind){
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(Ui.dp(this,14),0,Ui.dp(this,14),0);
        EditText name=new EditText(this);name.setHint(tr("私人标签名称","Private label name","個人タグの名前"));name.setSingleLine(true);name.setFilters(new InputFilter[]{new InputFilter.LengthFilter(80)});name.setText(existing==null?"":existing.optString("name"));form.addView(name);
        EditText queryInput=new EditText(this);queryInput.setSingleLine(true);queryInput.setHint(tr("查找绑定项","Find bindings","対象を検索"));form.addView(queryInput);
        List<String> ids=new ArrayList<>(),labels=new ArrayList<>();if("MANUAL".equals(kind)){for(UnifiedCatalogStore.Entry entry:catalog.entries()){ids.add(entry.id);labels.add(entry.title+" · "+entry.displayAuthor()+" · "+TagParticipation.provider(entry.id));}}else for(Row row:directory){ids.add(row.identity);labels.add(row.label+" · "+row.provider);}
        Set<String> selected=existing==null?new LinkedHashSet<>():TagParticipation.set(existing.optJSONArray("MANUAL".equals(kind)?"comicIds":"mappings"));
        LinearLayout choices=new LinearLayout(this);choices.setOrientation(LinearLayout.VERTICAL);ScrollView scroll=new ScrollView(this);scroll.addView(choices);form.addView(scroll,new LinearLayout.LayoutParams(-1,Ui.dp(this,280)));TextView count=Ui.text(this,"",12,Ui.MUTED,false);form.addView(count);
        final int[] cursor={0};final Runnable[] refresh={null};LinearLayout nav=new LinearLayout(this);Button prev=button(nav,tr("上一页","Previous","前へ"),v->{cursor[0]--;refresh[0].run();}),next=button(nav,tr("下一页","Next","次へ"),v->{cursor[0]++;refresh[0].run();});for(int i=0;i<nav.getChildCount();i++)nav.getChildAt(i).setLayoutParams(new LinearLayout.LayoutParams(0,-2,1));form.addView(nav);
        refresh[0]=()->{List<Integer> matches=new ArrayList<>();String q=TagParticipation.norm(queryInput.getText().toString());for(int i=0;i<ids.size();i++)if(TagParticipation.norm(labels.get(i)+" "+ids.get(i)).contains(q))matches.add(i);int pages=Math.max(1,(matches.size()+49)/50);cursor[0]=Math.min(Math.max(0,cursor[0]),pages-1);choices.removeAllViews();for(int i=cursor[0]*50;i<Math.min(matches.size(),(cursor[0]+1)*50);i++){int index=matches.get(i);CheckBox check=new CheckBox(this);check.setText(labels.get(index));check.setTextColor(Ui.TEXT);check.setChecked(selected.contains(ids.get(index)));check.setOnCheckedChangeListener((b,checked)->{if(checked)selected.add(ids.get(index));else selected.remove(ids.get(index));count.setText(selected.size()+tr(" 项已选"," selected"," 件選択"));});choices.addView(check);}count.setText(selected.size()+tr(" 项已选 · "," selected · "," 件選択 · ")+(cursor[0]+1)+"/"+pages);prev.setEnabled(cursor[0]>0);next.setEnabled(cursor[0]+1<pages);};
        button(form,tr("查找","Find","検索"),v->{cursor[0]=0;refresh[0].run();});refresh[0].run();
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("MANUAL".equals(kind)?tr("手工绑定（仅所选作品）","Manual binding (selected works only)","手動タグ（選択作品のみ）"):tr("原始标签映射（任一匹配）","Raw-tag mapping (ANY match)","元タグ対応付け（いずれか一致）")).setView(form).setNegativeButton(tr("取消","Cancel","キャンセル"),null).setPositiveButton(tr("暂存并启用","Stage and enable","仮保存して有効化"),null).create();
        dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{try{String label=name.getText().toString().trim();if(label.isEmpty()||selected.size()>4096||(existing==null&&policy().privateTags.size()>=100))throw new IllegalArgumentException();String id=existing==null?"pt_"+UUID.randomUUID().toString().replace("-",""):existing.optString("id");JSONObject tag=new JSONObject().put("id",id).put("name",label).put("kind",kind).put("comicIds","MANUAL".equals(kind)?new JSONArray(selected):new JSONArray()).put("mappings","MAPPED".equals(kind)?new JSONArray(selected):new JSONArray());JSONArray tags=new JSONArray();for(JSONObject old:policy().privateTags)if(!old.optString("id").equals(id))tags.put(old);tags.put(tag);JSONObject nextPolicy=copy(draft).put("privateTags",tags);draft=TagParticipation.normalize(nextPolicy);toggle("private|"+id,true);dialog.dismiss();render();}catch(Exception e){name.setError(tr("需填写名称；最多 100 个私人标签，4096 个总绑定，128 KiB。","Name required; max 100 labels, 4096 total bindings, 128 KiB.","名前必須。タグ100個、対応付け計4096件、128 KiB まで。"));}}));dialog.show();
    }
}
