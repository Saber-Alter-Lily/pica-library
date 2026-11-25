package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.*;
import android.widget.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONArray;
import org.json.JSONObject;

/** Comic-first detail screen with actionable creator identity and explicit source/read actions. */
public final class UnifiedComicDetailActivity extends LocaleAwareActivity {
    private static final class ResolvedChapter {
        final String id,title,sourceKind,label;final int order,pages,priority;boolean picaBacked,ehBacked;
        ResolvedChapter(BridgeClient.ChapterItem item,String sourceKind,String label,int priority,boolean picaBacked,boolean ehBacked){this.id=item.id;this.title=item.title;this.order=item.order;this.pages=item.downloadedPictures;this.sourceKind=sourceKind;this.label=label;this.priority=priority;this.picaBacked=picaBacked;this.ehBacked=ehBacked;}
    }
    private static final class ProbeResult {
        final String sourceKind,label;final int priority;final List<BridgeClient.ChapterItem> chapters;final boolean pica,eh;
        ProbeResult(String sourceKind,String label,int priority,List<BridgeClient.ChapterItem> chapters,boolean pica,boolean eh){this.sourceKind=sourceKind;this.label=label;this.priority=priority;this.chapters=chapters;this.pica=pica;this.eh=eh;}
    }
    private static final class LocalDetailState {
        final UnifiedCatalogStore.Snapshot catalog;
        final UnifiedCatalogStore.Entry entry;
        final String authorSummary,tagLine;
        final boolean phoneDownloaded;
        final EhFavoriteStore.Snapshot ehFavorites;
        LocalDetailState(UnifiedCatalogStore.Snapshot catalog,UnifiedCatalogStore.Entry entry,String authorSummary,String tagLine,boolean phoneDownloaded,EhFavoriteStore.Snapshot ehFavorites){this.catalog=catalog;this.entry=entry;this.authorSummary=authorSummary;this.tagLine=tagLine;this.phoneDownloaded=phoneDownloaded;this.ehFavorites=ehFavorites;}
    }
    private final ExecutorService worker=Executors.newFixedThreadPool(5);private final LinkedHashMap<String,ResolvedChapter> resolved=new LinkedHashMap<>();private final LinkedHashSet<String> availableSources=new LinkedHashSet<>();private final AtomicInteger remaining=new AtomicInteger();
    private LinearLayout chapterArea,actionArea,workVariantArea;private TextView sourceState;private Button sourceDetails,workVariantToggle;private ProgressBar loading;private ImageView coverView;private UnifiedCatalogStore.Entry entry;private UnifiedCatalogStore.Snapshot catalogSnapshot;private EhFavoriteStore.Snapshot ehFavoriteSnapshot;private String localAuthorSummary="",localTagLine="";private JSONObject workVariantPayload;private volatile Boolean picaFavoriteState;private volatile String ehProbeError="";private boolean destroyed,picaReady,ehReady,workVariantsExpanded;

    private final Map<String,Map<String,ResolvedChapter>> editions=new LinkedHashMap<>();
    private ReadingHistoryStore.Session bookmark;
    private TextView headerMeta;
    private Button primaryRead;
    private boolean probesComplete, rangeChosen;
    private String preferredKind="";
    private String t(String zh,String en,String ja){return LocalizedText.ui(this,zh,en,ja);}
    private ReadingHistoryStore.Session latest(String comic){
        for(ReadingHistoryStore.Session r:ReadingHistoryStore.load(this).sorted()){
            if(comic.equals(r.comicId)&&!r.chapterId.isEmpty()&&Arrays.asList("phone","desktop","remote","pica","eh").contains(r.sourceKind))return r;
        }
        return null;
    }
    @Override protected void onRestart(){
        super.onRestart();
        String id=entry.id;
        worker.submit(()->{ReadingHistoryStore.Session recent=latest(id);runOnUiThread(()->{
            if(destroyed||primaryRead==null)return;
            if(recent==null&&bookmark==null)return;
            if(recent!=null&&bookmark!=null&&recent.chapterId.equals(bookmark.chapterId)&&recent.sourceKind.equals(bookmark.sourceKind)&&recent.lastPage==bookmark.lastPage)return;
            bookmark=recent;rangeChosen=false;renderChapters(probesComplete);
        });});
    }
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);String comicId=getIntent().getStringExtra("comicId"),title=getIntent().getStringExtra("title"),author=getIntent().getStringExtra("author");entry=new UnifiedCatalogStore.Entry(comicId==null?"":comicId,title,author);localAuthorSummary=entry.displayAuthor();renderLoadingShell(entry.title);loadLocalDetailState(entry.id,title,author);}
    private void renderLoadingShell(String title){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));bar.addView(small("‹ 返回",v->finish()));bar.addView(Ui.text(this,"漫画详情",20,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setGravity(Gravity.CENTER);body.setPadding(Ui.dp(this,20),Ui.dp(this,36),Ui.dp(this,20),Ui.dp(this,36));ProgressBar progress=new ProgressBar(this);body.addView(progress);TextView message=Ui.text(this,LocalizedText.ui("正在读取本地漫画信息…"),13,Ui.MUTED,false);message.setPadding(0,Ui.dp(this,10),0,0);body.addView(message);if(title!=null&&!title.trim().isEmpty()){TextView name=Ui.text(this,title,16,Ui.TEXT,true);name.setPadding(0,Ui.dp(this,12),0,0);body.addView(name);}root.addView(body,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();
    }
    private void loadLocalDetailState(String comicId,String fallbackTitle,String fallbackAuthor){
        worker.submit(()->{
            LocalDetailState state=readLocalDetailState(comicId,fallbackTitle,fallbackAuthor);
            ReadingHistoryStore.Session recent=latest(comicId);
            runOnUiThread(()->{
                if(destroyed)return;
                bookmark=recent;catalogSnapshot=state.catalog;entry=state.entry;localAuthorSummary=state.authorSummary;localTagLine=state.tagLine;ehFavoriteSnapshot=state.ehFavorites;
                render();resolveSources(state.phoneDownloaded);loadWorkVariants();
            });
        });
    }
    private LocalDetailState readLocalDetailState(String comicId,String fallbackTitle,String fallbackAuthor){
        UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(this);
        UnifiedCatalogStore.Entry local=catalog.byId.get(comicId);
        if(local==null)local=new UnifiedCatalogStore.Entry(comicId==null?"":comicId,fallbackTitle,fallbackAuthor);
        EhSemanticStore.Snapshot semantics=EhSemanticStore.load(this);
        AuthorConceptStore.Snapshot authors=AuthorConceptStore.build(catalog,semantics);
        String author=deriveAuthorSummary(local,authors);
        String tags=deriveTagLine(local,semantics);
        boolean phoneDownloaded=PhoneDownloadStore.has(this,local.id);
        EhFavoriteStore.Snapshot favorites=EhClient.isEhId(local.id)?EhFavoriteStore.load(this):null;
        return new LocalDetailState(catalog,local,author,tags,phoneDownloaded,favorites);
    }
    private String deriveAuthorSummary(UnifiedCatalogStore.Entry local,AuthorConceptStore.Snapshot authors){
        List<AuthorConceptStore.Concept> concepts=authors.forComic(local.id);if(concepts.isEmpty())return local.displayAuthor();ArrayList<String> names=new ArrayList<>();for(AuthorConceptStore.Concept c:concepts){if(!names.contains(c.canonicalName))names.add(c.canonicalName);if(names.size()>=3)break;}return names.isEmpty()?local.displayAuthor():String.join(" / ",names);
    }
    private String deriveTagLine(UnifiedCatalogStore.Entry local,EhSemanticStore.Snapshot semantics){
        if("eh".equals(local.providerId)||EhClient.isEhId(local.id)){EhSemanticStore.Record record=semantics.byComicId.get(local.id);if(record!=null&&!record.rawTags.isEmpty()){EhTagTranslationStore tr=EhTagTranslationStore.load(this);ArrayList<String> values=new ArrayList<>();for(EhSemanticStore.Tag tag:record.rawTags){if("language".equals(tag.namespace)||"reclass".equals(tag.namespace))continue;String display=tr.display(tag.namespace,tag.value);if(!values.contains(display))values.add(display);if(values.size()>=6)break;}if(!values.isEmpty())return String.join(" · ",values);}}
        if(local.tags.isEmpty())return "";StringBuilder out=new StringBuilder();for(int i=0;i<local.tags.size()&&i<6;i++){if(i>0)out.append(" · ");out.append(local.tags.get(i));}return out.toString();
    }
    private void render(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));bar.addView(small("‹ 返回",v->finish()));bar.addView(Ui.text(this,"漫画详情",20,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(Ui.BG);LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,16),Ui.dp(this,4),Ui.dp(this,16),Ui.dp(this,28));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));LinearLayout hero=new LinearLayout(this);coverView=new ImageView(this);coverView.setScaleType(ImageView.ScaleType.CENTER_CROP);coverView.setBackgroundColor(Ui.PLACEHOLDER);hero.addView(coverView,new LinearLayout.LayoutParams(Ui.dp(this,96),Ui.dp(this,136)));CoverRepository.load(this,coverView,entry,Ui.PLACEHOLDER);LinearLayout copy=new LinearLayout(this);copy.setOrientation(LinearLayout.VERTICAL);copy.setPadding(Ui.dp(this,15),0,0,0);TextView title=Ui.text(this,entry.title,20,Ui.TEXT,true);title.setMaxLines(4);copy.addView(title);if(!entry.alternateTitles.isEmpty()){TextView alternate=Ui.text(this,entry.alternateTitles.get(0),11.5f,Ui.MUTED,false);alternate.setMaxLines(2);alternate.setPadding(0,Ui.dp(this,4),0,0);copy.addView(alternate);}TextView author=Ui.text(this,"作者 · "+authorSummary()+"  ›",13,Ui.PRIMARY,true);author.setPadding(0,Ui.dp(this,7),0,Ui.dp(this,5));author.setOnClickListener(v->openAuthors());LinearLayout authorRow=new LinearLayout(this);authorRow.setGravity(Gravity.CENTER_VERTICAL);
        author.setMaxLines(3);authorRow.addView(author,new LinearLayout.LayoutParams(0,-2,1));
        ReaderSubscriptionsActivity.addFollowControl(this,authorRow,entry.displayAuthor());copy.addView(authorRow);
        headerMeta=Ui.text(this,detailMeta(),12,Ui.MUTED,false);copy.addView(headerMeta);hero.addView(copy,new LinearLayout.LayoutParams(0,-2,1));content.addView(hero);String tags=tagLine();if(!tags.isEmpty()){TextView t=Ui.text(this,tags,11.5f,Ui.PRIMARY,false);t.setPadding(0,Ui.dp(this,10),0,0);content.addView(t);}primaryRead=button(t("开始阅读","Start reading","読む"),v->readPrimary());
        primaryRead.setBackground(Ui.pressable(this,Ui.PRIMARY,12));
        primaryRead.setTextColor(android.graphics.Color.luminance(Ui.PRIMARY)>.18?android.graphics.Color.BLACK:android.graphics.Color.WHITE);
        primaryRead.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_detail_read,0,0,0);
        primaryRead.setCompoundDrawableTintList(android.content.res.ColorStateList.valueOf(primaryRead.getCurrentTextColor()));
        primaryRead.setEnabled(false);LinearLayout.LayoutParams readParams=new LinearLayout.LayoutParams(-1,-2);readParams.topMargin=Ui.dp(this,12);content.addView(primaryRead,readParams);
        actionArea=new LinearLayout(this);actionArea.setPadding(0,Ui.dp(this,10),0,0);content.addView(actionArea);workVariantToggle=small(LocalizedText.ui(this,"同一作品 · …","Same work · …","同一作品 · …"),v->toggleWorkVariants());workVariantToggle.setVisibility(View.GONE);LinearLayout.LayoutParams wtp=new LinearLayout.LayoutParams(-1,-2);wtp.setMargins(0,Ui.dp(this,10),0,0);content.addView(workVariantToggle,wtp);workVariantArea=new LinearLayout(this);workVariantArea.setOrientation(LinearLayout.VERTICAL);workVariantArea.setVisibility(View.GONE);content.addView(workVariantArea);sourceState=Ui.text(this,"正在检查可读来源…",12,Ui.MUTED,false);sourceState.setPadding(0,Ui.dp(this,8),0,0);content.addView(sourceState);sourceDetails=small("来源与副本 ▾",v->showSourceDetails());sourceDetails.setVisibility(View.GONE);sourceDetails.setEnabled(false);content.addView(sourceDetails,new LinearLayout.LayoutParams(-2,-2));loading=new ProgressBar(this);content.addView(loading);chapterArea=new LinearLayout(this);chapterArea.setOrientation(LinearLayout.VERTICAL);content.addView(chapterArea);setContentView(root);root.requestApplyInsets();renderActions();}
    private Button button(String text,View.OnClickListener action){return Ui.button(this,text,action,false);}
    private Button small(String text,View.OnClickListener action){return Ui.button(this,text,action,true);}
    private String authorSummary(){return localAuthorSummary.isEmpty()?entry.displayAuthor():localAuthorSummary;}
    private void openAuthors(){Intent i=new Intent(this,AuthorDirectoryActivity.class);i.putExtra("comicId",entry.id);startActivity(i);}
    private String detailMeta(){ArrayList<String> values=new ArrayList<>();if(!availableSources.isEmpty())values.add(String.join(" / ",availableSources));else{if(entry.sourceBindings.contains("pica")||entry.picaAvailable)values.add("Pica");if(entry.sourceBindings.contains("eh"))values.add("E-H");if(entry.sourceBindings.contains("exh"))values.add("ExH");}if(values.isEmpty())values.add(EhClient.isEhId(entry.id)?"E-H":"本地");if(entry.knownPictures>0)values.add(LocalizedText.ui(this,entry.knownPictures+" 页",entry.knownPictures+" pages",entry.knownPictures+" ページ"));if(!Double.isNaN(entry.rating))values.add("★ "+String.format(Locale.ROOT,"%.2f",entry.rating));if("FINISHED".equals(entry.completionStatus)||entry.finished)values.add("完结");else if("ONGOING".equals(entry.completionStatus))values.add("连载");return String.join(" · ",values);}
    private String tagLine(){return localTagLine;}
    private String workVariantRelation(JSONObject row){
        String relation=row.optString("relation","");
        if("CONFIRMED_SAME_EDITION".equals(relation))return LocalizedText.ui(this,"同作品 · 同版本上传","Same work · same edition upload","同一作品 · 同版アップロード");
        if("CONFIRMED_WORK_VARIANT".equals(relation))return LocalizedText.ui(this,"同作品 · 其他版本","Same work · another edition","同一作品 · 別バージョン");
        if("ADJUDICATED_EDITION_VARIANT".equals(relation))return LocalizedText.ui(this,"人工确认 · 不同版本","Reviewed · edition variant","レビュー済み · 別バージョン");
        if("ADJUDICATED_SAME_WORK".equals(relation))return LocalizedText.ui(this,"人工确认 · 同作品","Reviewed · same work","レビュー済み · 同一作品");
        return LocalizedText.ui(this,"可能是同一作品","Possibly the same work","同一作品の可能性");
    }

    private int workVariantDerivedCount(JSONObject value,String field){
        if(value==null)return 0;
        if(value.has(field))return Math.max(0,value.optInt(field,0));
        JSONArray items=value.optJSONArray("items");if(items==null)return 0;
        int count=0;
        for(int i=0;i<items.length();i++){
            JSONObject row=items.optJSONObject(i);if(row==null)continue;
            if("favoriteCount".equals(field)&&row.optBoolean("isFavorite",false))count++;
            if("downloadedCount".equals(field)&&row.optInt("downloadedPictures",0)>0)count++;
        }
        return count;
    }

    private String workVariantToggleText(JSONObject value){
        int count=value==null?0:value.optInt("count",0);
        int favoriteCount=workVariantDerivedCount(value,"favoriteCount");
        int downloadedCount=workVariantDerivedCount(value,"downloadedCount");
        StringBuilder text=new StringBuilder(LocalizedText.ui(this,"同一作品 · "+count,"Same work · "+count,"同一作品 · "+count));
        if(count>0){
            if(favoriteCount>0)text.append(LocalizedText.ui(this," · 已收藏 "+favoriteCount," · Favorited "+favoriteCount," · お気に入り "+favoriteCount));
            else text.append(LocalizedText.ui(this," · 无收藏"," · None favorited"," · お気に入りなし"));
            if(downloadedCount>0)text.append(LocalizedText.ui(this," · 已下载 "+downloadedCount," · Downloaded "+downloadedCount," · ダウンロード "+downloadedCount));
        }
        text.append(workVariantsExpanded?" ▾":" ▸");
        return text.toString();
    }

    private void loadWorkVariants(){
        if(workVariantToggle==null||entry==null)return;
        workVariantToggle.setEnabled(false);
        workVariantToggle.setText(LocalizedText.ui(this,"同一作品 · 检测中…","Same work · Checking…","同一作品 · 確認中…"));
        final String comicId=entry.id;
        worker.submit(()->{
            JSONObject value=WorkVariantResolver.load(this,comicId);
            runOnUiThread(()->{
                if(destroyed||entry==null||!comicId.equals(entry.id))return;
                workVariantPayload=value;
                int count=value==null?0:value.optInt("count",0);
                workVariantToggle.setText(workVariantToggleText(value));
                workVariantToggle.setEnabled(count>0);workVariantToggle.setVisibility(count>0?View.VISIBLE:View.GONE);
                if(workVariantsExpanded)renderWorkVariants();
            });
        });
    }

    private void toggleWorkVariants(){
        int count=workVariantPayload==null?0:workVariantPayload.optInt("count",0);
        if(count<=0)return;
        workVariantsExpanded=!workVariantsExpanded;
        workVariantArea.setVisibility(workVariantsExpanded?View.VISIBLE:View.GONE);
        workVariantToggle.setText(workVariantToggleText(workVariantPayload));
        if(workVariantsExpanded)renderWorkVariants();
    }

    private UnifiedCatalogStore.Entry workVariantEntry(JSONObject row){
        String id=row.optString("comicId","");
        UnifiedCatalogStore.Entry cached=catalogSnapshot==null?null:catalogSnapshot.byId.get(id);
        UnifiedCatalogStore.Entry out=cached==null?new UnifiedCatalogStore.Entry(id,row.optString("title",""),row.optString("author","")):cached;
        if(cached==null){
            out.canonicalAuthor=row.optString("canonicalAuthor","");
            out.providerId=row.optString("providerId",id.startsWith("eh:")?"eh":"pica");
            out.knownPictures=Math.max(0,row.optInt("knownPictures",row.optInt("pagesCount",0)));
            out.favorite=row.optBoolean("isFavorite",false);
            out.desktopDownloadedPictures=Math.max(0,row.optInt("downloadedPictures",0));
            String coverPath=row.optString("coverPath","");
            if(!coverPath.isEmpty()){out.desktopCoverPath=coverPath;out.desktopAvailable=true;}
            String coverUrl=row.optString("coverUrl","");
            if(!coverUrl.isEmpty()){if("eh".equals(out.providerId))out.ehCoverUrl=coverUrl;else out.picaCoverUrl=coverUrl;}
        }else{
            out.favorite=row.optBoolean("isFavorite",out.favorite);
            out.desktopDownloadedPictures=Math.max(out.desktopDownloadedPictures,row.optInt("downloadedPictures",0));
            String coverPath=row.optString("coverPath","");
            if(out.desktopCoverPath.isEmpty()&&!coverPath.isEmpty()){out.desktopCoverPath=coverPath;out.desktopAvailable=true;}
        }
        return out;
    }

    private void openWorkVariant(UnifiedCatalogStore.Entry target){
        Intent intent=new Intent(this,UnifiedComicDetailActivity.class);
        intent.putExtra("comicId",target.id);
        intent.putExtra("title",target.title);
        intent.putExtra("author",target.displayAuthor());
        startActivity(intent);
    }

    private void renderWorkVariants(){
        if(workVariantArea==null)return;
        workVariantArea.removeAllViews();
        JSONArray items=workVariantPayload==null?null:workVariantPayload.optJSONArray("items");
        if(items==null||items.length()==0){workVariantArea.setVisibility(View.GONE);return;}
        workVariantArea.setVisibility(View.VISIBLE);
        for(int i=0;i<items.length();i++){
            JSONObject row=items.optJSONObject(i);if(row==null)continue;
            UnifiedCatalogStore.Entry variant=workVariantEntry(row);
            LinearLayout card=Ui.card(this);card.setOrientation(LinearLayout.HORIZONTAL);card.setClickable(true);card.setFocusable(true);
            ImageView cover=new ImageView(this);cover.setScaleType(ImageView.ScaleType.CENTER_CROP);cover.setBackgroundColor(Ui.PLACEHOLDER);
            LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(Ui.dp(this,72),Ui.dp(this,98));card.addView(cover,cp);CoverRepository.load(this,cover,variant,Ui.PLACEHOLDER);
            LinearLayout copy=new LinearLayout(this);copy.setOrientation(LinearLayout.VERTICAL);copy.setPadding(Ui.dp(this,12),0,0,0);
            TextView title=Ui.text(this,row.optString("title",variant.title),15,Ui.TEXT,true);title.setMaxLines(2);copy.addView(title);
            String author=row.optString("canonicalAuthor",row.optString("author",variant.displayAuthor()));copy.addView(Ui.text(this,author,11.5f,Ui.MUTED,false));

            boolean favorite=row.optBoolean("isFavorite",variant.favorite);
            boolean downloaded=row.optInt("downloadedPictures",variant.desktopDownloadedPictures)>0;
            ArrayList<String> status=new ArrayList<>();
            status.add(favorite?LocalizedText.ui(this,"★ 已收藏","★ Favorited","★ お気に入り済み"):LocalizedText.ui(this,"未收藏","Not favorited","未お気に入り"));
            if(downloaded)status.add(LocalizedText.ui(this,"✓ 已下载","✓ Downloaded","✓ ダウンロード済み"));
            copy.addView(Ui.text(this,String.join("   ",status),11.5f,favorite||downloaded?Ui.PRIMARY:Ui.MUTED,true));

            ArrayList<String> meta=new ArrayList<>();int pages=row.optInt("pagesCount",variant.knownPictures);if(pages>0)meta.add(LocalizedText.ui(this,pages+" 页",pages+" pages",pages+" ページ"));meta.add("eh".equals(row.optString("providerId",variant.providerId))?"E-H":"Pica");String editionLanguage=row.optString("editionLanguage",""),editionLabel=row.optString("editionLabel",""),team=row.optString("chineseTeam","");if(!editionLanguage.isEmpty())meta.add(editionLanguage);if(!editionLabel.isEmpty())meta.add(editionLabel);if(!team.isEmpty())meta.add(team);double rating=row.optDouble("rating",Double.NaN);if(!Double.isNaN(rating)&&rating>0)meta.add("★ "+String.format(Locale.ROOT,"%.2f",rating));
            copy.addView(Ui.text(this,String.join(" · ",meta),11,Ui.MUTED,false));copy.addView(Ui.text(this,workVariantRelation(row),11,Ui.PRIMARY,true));
            TextView open=Ui.text(this,LocalizedText.ui(this,"查看版本 →","Open version →","この版を開く →"),11.5f,Ui.PRIMARY,true);open.setPadding(0,Ui.dp(this,4),0,0);copy.addView(open);
            card.addView(copy,new LinearLayout.LayoutParams(0,-2,1));
            final UnifiedCatalogStore.Entry target=variant;
            View.OnClickListener openAction=v->openWorkVariant(target);
            card.setOnClickListener(openAction);open.setOnClickListener(openAction);
            workVariantArea.addView(card);
        }
    }

    private static String ehEpisodeId(String comicId){String[] parts=comicId==null?new String[0]:comicId.split(":",3);return parts.length>=2?"eh-"+parts[1]:"eh-gallery";}
    private static String shortError(Exception e){String value=e.getMessage()==null?"":e.getMessage().trim();if(value.isEmpty())return "暂时无法读取";if(value.contains("HTTP 509"))return "请求过于频繁，请稍后重试";if(value.contains("HTTP 403"))return "站点暂时拒绝访问";return value.length()>64?value.substring(0,64):value;}

    private void resolveSources(boolean phoneDownloaded){List<Callable<ProbeResult>> probes=new ArrayList<>();if(phoneDownloaded)probes.add(()->probe(new PhoneDownloadReaderSource(this),"phone","手机",0,false,false));if(entry.desktopDownloaded&&BridgeStore.paired(this))probes.add(()->{BridgeClient.device(this);return probe(new DesktopReaderSource(this),"desktop","电脑",1,false,false);});RemoteConfigStore.Config remote=RemoteConfigStore.load(this);if(entry.remoteAvailable&&remote.configured())probes.add(()->probe(new RemoteReaderSource(this),"remote","WebDAV · "+remote.label,2,false,false));if(entry.ehAvailable||EhClient.isEhId(entry.id))probes.add(this::probeEh);if(!EhClient.isEhId(entry.id)&&PicaClient.available(this))probes.add(this::probePica);if(probes.isEmpty()){finishProbing();return;}remaining.set(probes.size());for(Callable<ProbeResult> call:probes)worker.submit(()->{try{ProbeResult result=call.call();if(result!=null&&!result.chapters.isEmpty())runOnUiThread(()->accept(result));}catch(Exception ignored){}finally{if(remaining.decrementAndGet()==0)runOnUiThread(this::finishProbing);}});}
    private ProbeResult probe(ReaderSource source,String kind,String label,int priority,boolean pica,boolean eh) throws Exception {List<BridgeClient.ChapterItem> chapters=source.chapters(entry.id);List<BridgeClient.ChapterItem> readable=new ArrayList<>();for(BridgeClient.ChapterItem item:chapters)if(item.downloadedPictures>0)readable.add(item);readable.sort(Comparator.comparingInt(c->c.order));return new ProbeResult(kind,label,priority,readable,pica,eh);}
    private ProbeResult probePica() throws Exception {PicaClient client=new PicaClient(this);PicaClient.Comic online=client.comic(entry.id);if(online.id.isEmpty())return null;picaFavoriteState=online.favorite;entry=UnifiedPicaCatalogSync.merge(this,online);List<BridgeClient.ChapterItem> chapters=new ArrayList<>();for(PicaClient.Episode ep:client.episodes(entry.id))chapters.add(new BridgeClient.ChapterItem(ep.id,ep.title,ep.order,1));chapters.sort(Comparator.comparingInt(c->c.order));runOnUiThread(()->{if(!destroyed){CoverRepository.load(this,coverView,entry,Ui.PLACEHOLDER);renderActions();}});return new ProbeResult("pica","Pica 在线",3,chapters,true,false);}
    private ProbeResult probeEh() throws Exception {try{UnifiedCatalogStore.Entry cached=entry;if(EhClient.isEhId(cached.id)&&cached.knownPictures>0){List<BridgeClient.ChapterItem> chapters=Collections.singletonList(new BridgeClient.ChapterItem(ehEpisodeId(cached.id),cached.title,1,cached.knownPictures));return new ProbeResult("eh","E-H 在线",3,chapters,false,true);}EhClient client=new EhClient(this);EhClient.Comic online=client.comic(cached.id);entry=UnifiedEhCatalogSync.merge(this,online);List<BridgeClient.ChapterItem> chapters=Collections.singletonList(new BridgeClient.ChapterItem(ehEpisodeId(entry.id),online.title,1,Math.max(1,online.pagesCount)));runOnUiThread(()->{if(!destroyed){CoverRepository.load(this,coverView,entry,Ui.PLACEHOLDER);renderActions();}});return new ProbeResult("eh","E-H 在线",3,chapters,false,true);}catch(Exception e){ehProbeError=shortError(e);throw e;}}
    private void accept(ProbeResult result){if(destroyed)return;availableSources.add(result.label);if(result.pica)picaReady=true;if(result.eh)ehReady=true;for(BridgeClient.ChapterItem item:result.chapters){editions.computeIfAbsent(item.id,id->new LinkedHashMap<>()).put(result.sourceKind,new ResolvedChapter(item,result.sourceKind,result.label,result.priority,result.pica,result.eh));ResolvedChapter prior=resolved.get(item.id);if(prior==null||result.priority<prior.priority){ResolvedChapter next=new ResolvedChapter(item,result.sourceKind,result.label,result.priority,result.pica,result.eh);if(prior!=null&&prior.picaBacked)next.picaBacked=true;if(prior!=null&&prior.ehBacked)next.ehBacked=true;resolved.put(item.id,next);}else{if(result.pica)prior.picaBacked=true;if(result.eh)prior.ehBacked=true;}}renderActions();renderChapters(false);}
    private void finishProbing(){if(destroyed)return;probesComplete=true;loading.setVisibility(View.GONE);if(sourceDetails!=null)sourceDetails.setEnabled(true);if(resolved.isEmpty()){sourceDetails.setVisibility(View.VISIBLE);sourceState.setVisibility(View.VISIBLE);sourceDetails.setText(t("来源与重试","Sources and retry","配信元・再試行"));sourceState.setText(EhClient.isEhId(entry.id)&&!ehProbeError.isEmpty()?LocalizedText.ui("E-H 读取失败 · ")+ehProbeError:LocalizedText.ui("当前没有可读章节"));return;}renderChapters(true);}

    private void showSourceDetails(){List<String> rows=new ArrayList<>();List<String> bindings=new ArrayList<>();for(String source:entry.sourceBindings)bindings.add("pica".equals(source)?"Pica":"exh".equals(source)?"ExH":"E-H");if(!bindings.isEmpty())rows.add("在线来源 · "+String.join(" / ",bindings));List<String> replicas=new ArrayList<>();if(entry.phoneDownloaded)replicas.add("手机");if(entry.desktopDownloaded)replicas.add("Windows 本机");if(entry.remoteAvailable)replicas.add("WebDAV");rows.add("实际副本 · "+(replicas.isEmpty()?"暂无本地/云端副本":String.join(" / ",replicas)));rows.add("当前可读 · "+(availableSources.isEmpty()?"尚未探测完成":String.join(" / ",availableSources)));List<RemoteConfigStore.Config> targets=RemoteConfigStore.targets(this);int switchIndex=-1;if(targets.size()>1){RemoteConfigStore.Config active=RemoteConfigStore.load(this);rows.add("切换当前网盘 · "+active.label);switchIndex=rows.size()-1;}final int actionIndex=switchIndex;final Map<Integer,String> kinds=new HashMap<>();
        if(availableSources.size()>1){Map<String,String> options=new LinkedHashMap<>();for(Map<String,ResolvedChapter> m:editions.values())for(ResolvedChapter c:m.values())options.put(c.sourceKind,c.label);
            for(Map.Entry<String,String> opt:options.entrySet()){kinds.put(rows.size(),opt.getKey());rows.add((opt.getKey().equals(preferredKind)?"✓ ":"")+t("优先使用：","Prefer: ","優先：")+opt.getValue());}}
        new AlertDialog.Builder(this).setNeutralButton(t("重新检查","Retry","再試行"),(d,w)->recreate()).setTitle(LocalizedText.ui("来源与副本")).setItems(rows.toArray(new String[0]),(dialog,which)->{if(kinds.containsKey(which)){preferredKind=kinds.get(which);renderChapters(probesComplete);}else if(which==actionIndex&&actionIndex>=0){dialog.dismiss();chooseRemoteTarget();}}).setPositiveButton(LocalizedText.ui("关闭"),null).show();}

    private void chooseRemoteTarget(){List<RemoteConfigStore.Config> targets=RemoteConfigStore.targets(this);if(targets.size()<2){startActivity(new Intent(this,RemoteStorageActivity.class));return;}String active=RemoteConfigStore.activeTargetId(this);String[] labels=new String[targets.size()];int checked=0;for(int i=0;i<targets.size();i++){RemoteConfigStore.Config c=targets.get(i);labels[i]=c.label+" · "+RemoteConfigStore.preset(c.vendor).label;if(c.id.equals(active))checked=i;}new AlertDialog.Builder(this).setTitle(LocalizedText.ui("选择当前网盘")).setSingleChoiceItems(labels,checked,(dialog,which)->{dialog.dismiss();RemoteConfigStore.Config target=targets.get(which);if(target.id.equals(RemoteConfigStore.activeTargetId(this)))return;sourceState.setText(LocalizedText.ui("正在切换到“")+target.label+"”…");loading.setVisibility(View.VISIBLE);new Thread(()->{try{RemoteConfigStore.setActive(this,target.id);UnifiedRemoteCatalogSync.refresh(this);runOnUiThread(()->{if(!destroyed)recreate();});}catch(Exception e){runOnUiThread(()->{if(destroyed)return;loading.setVisibility(View.GONE);sourceState.setText(LocalizedText.ui("切换网盘失败"));Toast.makeText(this,e.getMessage()==null?LocalizedText.ui("无法读取该网盘"):e.getMessage(),Toast.LENGTH_LONG).show();});}}).start();}).setNegativeButton(LocalizedText.ui("取消"),null).show();}

    private void renderActions(){if(actionArea==null||destroyed)return;actionArea.removeAllViews();if(EhClient.isEhId(entry.id)){EhFavoriteStore.Snapshot favs=ehFavoriteSnapshot;int slot=favs==null?-1:favs.slotOf(entry.id);String cloud=slot>=0&&favs!=null?favs.categoryName(slot):"";String label=entry.favorite?"★ 收藏":"☆ 收藏";if(entry.ehFavorite&&!cloud.isEmpty())label+=" · "+cloud;Button favoriteMenu=small(label,v->showEhFavoriteMenu());favoriteMenu.setTextColor(entry.favorite?Ui.FAVORITE:Ui.MUTED);actionArea.addView(favoriteMenu,new LinearLayout.LayoutParams(0,-2,1));}else if(picaReady&&picaFavoriteState!=null){boolean favorite=picaFavoriteState;Button fav=small(favorite?"★ 已收藏":"☆ 收藏",v->setPicaFavorite(!favorite));fav.setTextColor(favorite?Ui.FAVORITE:Ui.MUTED);fav.setPadding(Ui.dp(this,3),Ui.dp(this,4),Ui.dp(this,3),Ui.dp(this,4));actionArea.addView(fav,new LinearLayout.LayoutParams(0,-2,1));}else{Button fav=small(entry.favorite?"★ 已收藏":"☆ 收藏",v->{if(PicaClient.available(this))Toast.makeText(this,LocalizedText.ui("正在读取 Pica 收藏状态"),Toast.LENGTH_SHORT).show();else startActivity(new Intent(this,PicaAccountActivity.class));});fav.setTextColor(entry.favorite?Ui.FAVORITE:Ui.MUTED);fav.setPadding(Ui.dp(this,3),Ui.dp(this,4),Ui.dp(this,3),Ui.dp(this,4));actionArea.addView(fav,new LinearLayout.LayoutParams(0,-2,1));}Ui.gap(actionArea,this,6);actionArea.addView(small("书架",v->chooseShelves()),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(actionArea,this,6);actionArea.addView(small(t("更多","More","その他")+" ⋯",v->showMore()),new LinearLayout.LayoutParams(0,-2,1));}
    private void showEhFavoriteMenu(){boolean local=entry.localFavorite,remote=entry.ehFavorite,account=EhClient.accountAvailable(this);EhFavoriteStore.Snapshot snapshot=EhFavoriteStore.load(this);int slot=snapshot.slotOf(entry.id);String category=slot>=0?snapshot.categoryName(slot):"";List<String> labels=new ArrayList<>();labels.add((local?"✓ ":"○ ")+"本地收藏");if(account)labels.add((remote?"✓ ":"○ ")+"E-H 云收藏"+(category.isEmpty()?"":" · "+category));else labels.add("连接 E-H 账号以使用云收藏");new AlertDialog.Builder(this).setTitle(LocalizedText.ui("收藏方式")).setItems(labels.toArray(new String[0]),(d,w)->{if(w==0){EhFavoriteStore.setLocalFavorite(this,entry.id,!local);refreshEntry();renderActions();}else if(account)chooseEhFavoriteSlot(snapshot);else startActivity(new Intent(this,EhAccountActivity.class));}).setNegativeButton(LocalizedText.ui("取消"),null).show();}
    private void chooseEhFavoriteSlot(EhFavoriteStore.Snapshot snapshot){int current=snapshot.slotOf(entry.id);String[] labels=new String[entry.ehFavorite?11:10];for(int i=0;i<10;i++){String name=snapshot.categoryName(i);labels[i]=(i==current?"✓ ":"")+name+" · "+snapshot.categoryCounts[i];}if(entry.ehFavorite)labels[10]="取消云收藏";new AlertDialog.Builder(this).setTitle(LocalizedText.ui("E-H 云收藏")).setItems(labels,(d,w)->{if(w==10)setEhRemoteFavorite(-1,"");else setEhRemoteFavorite(w,snapshot.noteOf(entry.id));}).setNegativeButton(LocalizedText.ui("取消"),null).show();}
    private void setEhRemoteFavorite(int slot,String note){actionArea.setEnabled(false);worker.submit(()->{try{new EhClient(this).setRemoteFavorite(entry.id,slot,note);EhFavoriteStore.setRemoteFavorite(this,entry.id,slot,note);ehFavoriteSnapshot=EhFavoriteStore.load(this);refreshEntry();runOnUiThread(()->{if(destroyed)return;actionArea.setEnabled(true);renderActions();Toast.makeText(this,slot<0?LocalizedText.ui("已取消 E-H 云收藏"):LocalizedText.ui("E-H 云收藏已更新"),Toast.LENGTH_SHORT).show();});}catch(Exception e){runOnUiThread(()->{if(destroyed)return;actionArea.setEnabled(true);renderActions();Toast.makeText(this,LocalizedText.ui("E-H 云收藏更新失败"),Toast.LENGTH_LONG).show();});}});}
    private void refreshEntry(){UnifiedCatalogStore.Snapshot next=UnifiedCatalogStore.load(this);catalogSnapshot=next;UnifiedCatalogStore.Entry refreshed=next.byId.get(entry.id);if(refreshed!=null)entry=refreshed;}
    private void setPicaFavorite(boolean desired){actionArea.setEnabled(false);worker.submit(()->{try{new PicaClient(this).setFavorite(entry.id,desired);FavoriteCacheStore.setLocalFavorite(this,entry.id,entry.title,entry.displayAuthor(),desired);refreshEntry();picaFavoriteState=desired;runOnUiThread(()->{if(destroyed)return;actionArea.setEnabled(true);renderActions();Toast.makeText(this,desired?LocalizedText.ui("已收藏"):LocalizedText.ui("已取消收藏"),Toast.LENGTH_SHORT).show();});}catch(Exception e){runOnUiThread(()->{if(destroyed)return;actionArea.setEnabled(true);renderActions();Toast.makeText(this,LocalizedText.ui("收藏更新失败"),Toast.LENGTH_LONG).show();});}});}
    private void chooseShelves(){List<ShelfStore.Shelf> shelves=ShelfStore.load(this).activeShelves();if(shelves.isEmpty()){new AlertDialog.Builder(this).setTitle(LocalizedText.ui("还没有书架")).setNegativeButton(LocalizedText.ui("取消"),null).setPositiveButton(LocalizedText.ui("新建书架"),(d,w)->createShelfThenChoose()).show();return;}String[] labels=new String[shelves.size()];boolean[] checked=new boolean[shelves.size()];Set<String> current=new HashSet<>();for(ShelfStore.Shelf s:ShelfStore.activeForComic(this,entry.id))current.add(s.id);for(int i=0;i<shelves.size();i++){labels[i]=shelves.get(i).name;checked[i]=current.contains(shelves.get(i).id);}new AlertDialog.Builder(this).setTitle(LocalizedText.ui("加入书架")).setMultiChoiceItems(labels,checked,(d,which,value)->checked[which]=value).setNeutralButton(LocalizedText.ui("＋ 新建"),(d,w)->createShelfThenChoose()).setNegativeButton(LocalizedText.ui("取消"),null).setPositiveButton(LocalizedText.ui("保存"),(d,w)->{for(int i=0;i<shelves.size();i++)ShelfStore.setMembership(this,shelves.get(i).id,entry,checked[i]);syncShelvesAsync();Toast.makeText(this,LocalizedText.ui("书架已更新"),Toast.LENGTH_SHORT).show();}).show();}
    private void createShelfThenChoose(){EditText input=new EditText(this);input.setHint(LocalizedText.ui("书架名称"));Ui.styleField(input,this);new AlertDialog.Builder(this).setTitle(LocalizedText.ui("新建书架")).setView(input).setNegativeButton(LocalizedText.ui("取消"),null).setPositiveButton(LocalizedText.ui("创建"),(d,w)->{try{ShelfStore.Shelf shelf=ShelfStore.create(this,input.getText().toString());ShelfStore.setMembership(this,shelf.id,entry,true);syncShelvesAsync();Toast.makeText(this,LocalizedText.ui("已加入“")+shelf.name+"”",Toast.LENGTH_SHORT).show();}catch(Exception e){Toast.makeText(this,e.getMessage(),Toast.LENGTH_LONG).show();}}).show();}
    private void syncShelvesAsync(){if(!BridgeStore.paired(this))return;worker.submit(()->{try{BridgeClient.device(this);ShelfStore.syncWithDesktop(this);}catch(Exception ignored){}});}

    private void renderChapters(boolean complete){
        if(destroyed||chapterArea==null)return;
        List<ResolvedChapter> chapters=ordered();chapterArea.removeAllViews();
        if(chapters.isEmpty())return;
        headerMeta.setText(detailMeta());sourceState.setVisibility(View.GONE);
        sourceDetails.setEnabled(true);sourceDetails.setVisibility(editions.values().stream().anyMatch(m->m.size()>1)||availableSources.size()>1?View.VISIBLE:View.GONE);
        ResolvedChapter target=targetChapter(chapters);
        boolean missing=bookmark!=null&&target==null&&complete;
        primaryRead.setEnabled(target!=null||missing);
        primaryRead.setText(primaryLabel(chapters,target,missing));
        if(missing){sourceState.setVisibility(View.VISIBLE);sourceState.setText(t("上次阅读的章节暂不可用，请在目录选择","Last chapter unavailable; choose a chapter","前回の章を開けません。目次から選んでください"));}
        LinearLayout heading=new LinearLayout(this);heading.setGravity(Gravity.CENTER_VERTICAL);heading.setPadding(0,Ui.dp(this,12),0,Ui.dp(this,4));
        heading.addView(Ui.text(this,"章节",18,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));
        if(complete){
            int n=chapters.size();String count=t("全 "+n+" 章",n+" chapters","全 "+n+" 章");
            if(n==1 && entry.knownPictures>0)count+=t(" · "+entry.knownPictures+" 页"," · "+entry.knownPictures+" pages"," · "+entry.knownPictures+" ページ");
            heading.addView(Ui.text(this,count,12,Ui.MUTED,false));
            if(!rangeChosen&&bookmark!=null&&target!=null){for(int i=0;i<n;i++)if(chapters.get(i).id.equals(target.id)){rangeIndex=i/20;break;}}
        }
        chapterArea.addView(heading);if(!complete||chapters.size()>1||missing)drawDirectory(chapters);
        if(complete && !jumpHandled)resolveRequestedChapter(chapters);
    }
    private List<ResolvedChapter> ordered(){
        List<ResolvedChapter> a=new ArrayList<>(resolved.values());a.sort(Comparator.comparingInt((ResolvedChapter c)->c.order).thenComparing(c->c.title,String.CASE_INSENSITIVE_ORDER));return a;
    }
    private ResolvedChapter edition(ResolvedChapter base,String kind){
        Map<String,ResolvedChapter> m=editions.get(base.id);return m!=null&&m.containsKey(kind)?m.get(kind):base;
    }
    private ResolvedChapter targetChapter(List<ResolvedChapter> chapters){
        if(chapters.isEmpty())return null;
        if(bookmark==null)return probesComplete?edition(chapters.get(0),preferredKind):null;
        ResolvedChapter c=resolved.get(bookmark.chapterId);if(c==null)return null;
        String kind=preferredKind.isEmpty()?bookmark.sourceKind:preferredKind;
        ResolvedChapter pick=edition(c,kind);return probesComplete||pick.sourceKind.equals(kind)?pick:null;
    }
    private String primaryLabel(List<ResolvedChapter> chapters,ResolvedChapter target,boolean missing){
        if(missing)return t("选择可读章节","Choose a chapter","読める章を選ぶ");
        if(bookmark==null)return t("开始阅读","Start reading","読む");
        int p=Math.max(0,bookmark.lastPage)+1;
        String prefix=t("继续阅读","Continue reading","続きを読む")+" · ";
        if(probesComplete&&chapters.size()==1&&entry.knownPictures>=p)return prefix+t("第 "+p+"/"+entry.knownPictures+" 页","p. "+p+"/"+entry.knownPictures,p+"/"+entry.knownPictures+" ページ");
        int n=target!=null?target.order:bookmark.chapterOrder;
        return prefix+(n>0?t("第 "+n+" 章 · ","Ch. "+n+" · ","第 "+n+" 章 · "):"")+t("第 "+p+" 页","p. "+p,p+" ページ");
    }
    private void readPrimary(){
        ResolvedChapter c=targetChapter(ordered());
        if(c==null){if(chapterArea!=null)chapterArea.requestRectangleOnScreen(new android.graphics.Rect(0,0,1,1),true);return;}
        Intent intent=readerIntent(c.sourceKind,c.id);intent.putExtra("detailExactChapter",true);
        if(bookmark!=null)intent.putExtra("detailStartPage",Math.max(0,bookmark.lastPage));
        startActivity(intent);
    }
    private void showMore(){
        List<String> names=new ArrayList<>();List<Runnable> acts=new ArrayList<>();
        if(picaReady||ehReady){names.add(LocalizedText.ui("全部下载"));acts.add(()->{if(ehReady&&EhClient.isEhId(entry.id))EhDownloadJobs.enqueue(this,entry.id);else PicaDownloadJobs.enqueue(this,entry.id,"");Toast.makeText(this,LocalizedText.ui("已加入后台下载"),Toast.LENGTH_SHORT).show();});}
        names.add(t("推荐偏好","Recommendation preferences","おすすめ設定"));acts.add(()->RecommendationItemControlDialog.show(this,entry,this::renderActions));
        names.add(LocalizedText.ui("来源与副本"));acts.add(this::showSourceDetails);
        if(entry.description!=null&&!entry.description.trim().isEmpty()){names.add(t("作品简介","Description","あらすじ"));acts.add(()->new AlertDialog.Builder(this).setMessage(entry.description).setPositiveButton(LocalizedText.ui("关闭"),null).show());}
        new AlertDialog.Builder(this).setItems(names.toArray(new String[0]),(d,w)->acts.get(w).run()).show();
    }
    private int rangeIndex=0;private boolean jumpHandled;
    private void resolveRequestedChapter(List<ResolvedChapter> chapters){
        Intent request=getIntent();String id=request.getStringExtra("resumeChapter");int number=request.getIntExtra("alertChapter",-1);
        if(id==null && number<0)return;
        jumpHandled=true;ResolvedChapter chosen=null;
        for(ResolvedChapter c:chapters){
            if(id!=null?c.id.equals(id):number==0||c.order==number){
                if(chosen==null||c.sourceKind.equals(request.getStringExtra("resumeSource")))chosen=c;
                if(number==0)break;
            }
        }
        if(chosen==null){Toast.makeText(this,LocalizedText.ui(this,"目标章节暂不可用，请在目录选择","Chapter unavailable; choose from the list","対象の章を開けません"),Toast.LENGTH_LONG).show();return;}
        if(id!=null)ReaderProgress.seedOneShotPosition(this,entry.id,chosen.id,request.getIntExtra("resumePage",0));
        openReader(chosen.sourceKind,chosen.id);finish();
    }
    private String chapterNumber(String title){
        if(title==null)return null;
        java.util.regex.Matcher m=java.util.regex.Pattern.compile("(?iu)^(?:第\\s*|(?:ch(?:apter)?|ep(?:isode)?)[.\\s]*)?([0-9]+)\\s*(?:章|話|话|回|集|巻|卷)?$").matcher(title.trim());
        return m.matches()?m.group(1):null;
    }
    private void drawDirectory(List<ResolvedChapter> chapters){
        if(chapters.isEmpty())return;final int size=20,groups=(chapters.size()+size-1)/size;
        rangeIndex=Math.min(rangeIndex,groups-1);boolean numbered=true;
        for(ResolvedChapter c:chapters)if(chapterNumber(c.title)==null){numbered=false;break;}
        if(groups>1){
            String[] labels=new String[groups];for(int i=0;i<groups;i++)labels[i]=(i*size+1)+"–"+Math.min((i+1)*size,chapters.size());
            if(groups<=9){
                LinearLayout ranges=null;
                for(int i=0;i<groups;i++){
                    if(i%3==0){ranges=new LinearLayout(this);chapterArea.addView(ranges);}
                    final int n=i;Button range=small(labels[i],v->{rangeChosen=true;rangeIndex=n;renderChapters(probesComplete);});
                    range.setSelected(i==rangeIndex);if(i==rangeIndex){range.setTypeface(android.graphics.Typeface.DEFAULT,android.graphics.Typeface.BOLD);range.setBackground(Ui.pressable(this,Ui.PRIMARY_SOFT,12));}ranges.addView(range,new LinearLayout.LayoutParams(0,-2,1));
                }
            }else chapterArea.addView(small(labels[rangeIndex]+" ▾",v->new AlertDialog.Builder(this).setItems(labels,(d,n)->{rangeChosen=true;rangeIndex=n;renderChapters(probesComplete);}).show()));
        }
        int end=Math.min(chapters.size(),(rangeIndex+1)*size);LinearLayout line=null;
        for(int i=rangeIndex*size;i<end;i++){
            ResolvedChapter c=chapters.get(i);boolean local="phone".equals(c.sourceKind);
            String display=numbered?chapterNumber(c.title):c.title;
            if(!numbered || (i-rangeIndex*size)%4==0){line=new LinearLayout(this);chapterArea.addView(line);}
            Button read=small(display+(local?" ✓":""),v->{ResolvedChapter selected=edition(c,preferredKind);openReader(selected.sourceKind,selected.id);});read.setAllCaps(false);read.setMinWidth(0);read.setMinimumWidth(0);
            read.setPadding(Ui.dp(this,4),0,Ui.dp(this,4),0);read.setMinHeight(Ui.dp(this,48));read.setMaxLines(numbered?1:3);
            read.setGravity(numbered?Gravity.CENTER:Gravity.CENTER_VERTICAL|Gravity.START);
            read.setContentDescription(c.title+(local?LocalizedText.ui(this," · 已下载"," · downloaded"," · ダウンロード済み"):""));
            if(!local && (c.picaBacked||c.ehBacked)){
                View.OnClickListener save=v->{if(c.ehBacked)EhDownloadJobs.enqueue(this,entry.id);else PicaDownloadJobs.enqueue(this,entry.id,c.id);Toast.makeText(this,LocalizedText.ui("已加入后台下载"),Toast.LENGTH_SHORT).show();};
                if(numbered){read.setOnLongClickListener(v->{new AlertDialog.Builder(this).setItems(new String[]{LocalizedText.ui("下载")},(dlg,n)->save.onClick(v)).show();return true;});}
                else {line.addView(read,new LinearLayout.LayoutParams(0,-2,1));line.addView(small("↓",save));continue;}
            }
            line.addView(read,new LinearLayout.LayoutParams(0,-2,1));
            if(numbered&&i==end-1)for(int pad=((i-rangeIndex*size)%4)+1;pad<4;pad++)line.addView(new View(this),new LinearLayout.LayoutParams(0,1,1));
        }
    }
    private void openReader(String sourceKind,String episodeId){startActivity(readerIntent(sourceKind,episodeId));}
    private Intent readerIntent(String sourceKind,String episodeId){Intent i=new Intent(this,ReaderActivity.class);i.putExtra("comicId",entry.id);i.putExtra("title",entry.title);i.putExtra("author",entry.displayAuthor());i.putExtra("episodeId",episodeId);i.putExtra("source",sourceKind);return i;}
    @Override protected void onDestroy(){destroyed=true;worker.shutdownNow();super.onDestroy();}
}
