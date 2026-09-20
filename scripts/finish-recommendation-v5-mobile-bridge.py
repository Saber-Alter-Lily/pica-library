from pathlib import Path

bridge = Path('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/BridgeClient.java')
text = bridge.read_text(encoding='utf-8')
old_item = '    static final class RecommendationItem {final String id, title, author, reason;RecommendationItem(String id,String title,String author,String reason){this.id=id;this.title=title;this.author=author;this.reason=reason;}}'
new_item = '''    static final class RecommendationItem {
        final String id,title,author,reason;final double score;final List<String> tags,categories;
        RecommendationItem(String id,String title,String author,String reason,double score,List<String> tags,List<String> categories){this.id=id;this.title=title;this.author=author;this.reason=reason;this.score=score;this.tags=tags;this.categories=categories;}
    }'''
if old_item in text:
    text = text.replace(old_item, new_item, 1)
elif 'final double score;final List<String> tags,categories;' not in text:
    raise SystemExit('BridgeClient RecommendationItem marker not found')

start = text.find('    static List<RecommendationItem> recommendations(Context c,int limit) throws Exception')
end = text.find('    static JSONObject recommendationPolicy(Context c) throws Exception', start)
if start < 0 or end < 0:
    raise SystemExit('BridgeClient recommendation methods block not found')
block = r'''    private static List<String> jsonStrings(JSONArray arr){List<String> out=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){String value=arr.optString(i,"");if(!value.isEmpty())out.add(value);}return out;}
    private static RecommendationItem recommendationItem(JSONObject row){JSONObject comic=row==null?null:row.optJSONObject("comic");if(comic==null)comic=row==null?new JSONObject():row;JSONArray reasons=row==null?null:row.optJSONArray("reasons");String reason="为你推荐";if(reasons!=null&&reasons.length()>0)reason=reasons.optString(0,reason);return new RecommendationItem(comic.optString("comicId"),comic.optString("title","未命名漫画"),comic.optString("author","未知作者"),reason,row==null?0:row.optDouble("score",0),jsonStrings(comic.optJSONArray("tags")),jsonStrings(comic.optJSONArray("categories")));}
    static List<RecommendationItem> recommendations(Context c,int limit) throws Exception {return recommendationBatch(c,limit).items;}
    static RecommendationBatch recommendationBatch(Context c,int limit) throws Exception {JSONObject root=new JSONObject(get(c,"/mobile/v1/recommendations?limit="+limit));JSONArray arr=root.optJSONArray("recommendations");List<RecommendationItem> out=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o==null)continue;RecommendationItem item=recommendationItem(o);if(!item.id.isEmpty())out.add(item);}return new RecommendationBatch(out,root.optString("source",""),root.optBoolean("cached",false),root.optInt("batchIndex",-1),root.optInt("maxVisibleBatches",0));}

    private static boolean cachePortableBundle(Context c,JSONObject bundle){
        if(bundle==null)return false;JSONArray batches=bundle.optJSONArray("batches");if(batches==null||batches.length()==0)return false;
        NativeRecommendationStore.Snapshot snapshot=new NativeRecommendationStore.Snapshot();snapshot.cycleId=bundle.optString("cycleId","desktop-sync-"+System.currentTimeMillis());snapshot.generatedAt=bundle.optString("generatedAt",java.time.Instant.now().toString());snapshot.readiness="DESKTOP_SYNCED";snapshot.batchIndex=0;
        int count=0;for(int i=0;i<batches.length();i++){JSONObject batch=batches.optJSONObject(i);JSONArray rows=batch==null?null:batch.optJSONArray("recommendations");List<NativeRecommendationStore.Item> items=new ArrayList<>();if(rows!=null)for(int j=0;j<rows.length();j++){JSONObject row=rows.optJSONObject(j);if(row==null)continue;RecommendationItem item=recommendationItem(row);if(item.id.isEmpty())continue;JSONObject evidence=row.optJSONObject("evidence");String family=evidence==null?"DESKTOP":evidence.optString("primaryFamily","DESKTOP");items.add(new NativeRecommendationStore.Item(item.id,item.title,item.author,item.reason,family,"",item.score,item.tags,item.categories));count++;}if(!items.isEmpty())snapshot.batches.add(items);}
        if(snapshot.batches.isEmpty())return false;snapshot.candidateCount=count;NativeRecommendationStore.save(c,snapshot);return true;
    }

    static JSONObject syncRecommendationState(Context c) throws Exception {return syncRecommendationState(c,false);}
    static JSONObject syncRecommendationState(Context c,boolean recompute) throws Exception {
        JSONObject payload=RecommendationPolicyStore.syncPayload(c);payload.put("recompute",recompute);JSONObject response=new JSONObject(post(c,"/mobile/v1/recommendation/v5/sync",payload));RecommendationPolicyStore.acknowledge(c,response);
        if(cachePortableBundle(c,response.optJSONObject("recommendationBundle")))return response;
        RecommendationBatch desktop=recommendationBatch(c,12);if(!desktop.items.isEmpty()){NativeRecommendationStore.Snapshot snapshot=new NativeRecommendationStore.Snapshot();snapshot.cycleId="desktop-sync-"+System.currentTimeMillis();snapshot.generatedAt=java.time.Instant.now().toString();snapshot.readiness="DESKTOP_SYNCED_FALLBACK";snapshot.candidateCount=desktop.items.size();snapshot.batchIndex=0;List<NativeRecommendationStore.Item> items=new ArrayList<>();for(RecommendationItem item:desktop.items)items.add(new NativeRecommendationStore.Item(item.id,item.title,item.author,item.reason,"DESKTOP","",item.score,item.tags,item.categories));snapshot.batches.add(items);NativeRecommendationStore.save(c,snapshot);}return response;
    }
'''
text = text[:start] + block + text[end:]
bridge.write_text(text, encoding='utf-8')

pairing = Path('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PairingActivity.java')
text = pairing.read_text(encoding='utf-8')
old = '    private void pair(){final String h=host.getText().toString().trim().replaceAll("/$","");final String c=code.getText().toString().trim();if(h.isEmpty()||c.length()!=6){status.setText("请填写电脑地址和 6 位配对码");return;}status.setText("正在连接…");new Thread(()->{try{JSONObject result=BridgeClient.pair(h,c);String token=result.optString("token"),name=result.optString("serverName","Pica Library Desktop");if(token.isEmpty())throw new IllegalStateException("配对失败");BridgeStore.save(this,h,token,name);try{BridgeClient.syncRecommendationState(this,true);}catch(Exception ignored){}try{ShelfStore.syncWithDesktop(this);}catch(Exception ignored){}SupporterSyncJobs.enqueue(this);runOnUiThread(()->{status.setText("配对成功");offerFavoriteImport();});}catch(Exception e){runOnUiThread(()->status.setText("连接失败："+(e.getMessage()==null?"请检查地址和配对码":e.getMessage())));}}).start();}'
new = '    private void pair(){final String h=host.getText().toString().trim().replaceAll("/$","");final String c=code.getText().toString().trim();if(h.isEmpty()||c.length()!=6){status.setText("请填写电脑地址和 6 位配对码");return;}status.setText("正在连接…");new Thread(()->{try{JSONObject result=BridgeClient.pair(h,c);String token=result.optString("token"),name=result.optString("serverName","Pica Library Desktop");if(token.isEmpty())throw new IllegalStateException("配对失败");BridgeStore.save(this,h,token,name);final boolean[] recommendationSynced={true};try{BridgeClient.syncRecommendationState(this,true);}catch(Exception ignored){recommendationSynced[0]=false;}try{ShelfStore.syncWithDesktop(this);}catch(Exception ignored){}SupporterSyncJobs.enqueue(this);runOnUiThread(()->{status.setText(recommendationSynced[0]?"配对成功 · 推荐策略与缓存已同步":"配对成功 · 推荐同步暂时失败，可稍后重试");if(!recommendationSynced[0])Toast.makeText(this,"连接已建立；推荐改动仍保留，可在推荐偏好中重新同步",Toast.LENGTH_LONG).show();offerFavoriteImport();});}catch(Exception e){runOnUiThread(()->status.setText("连接失败："+(e.getMessage()==null?"请检查地址和配对码":e.getMessage())));}}).start();}'
if old in text:
    text = text.replace(old, new, 1)
elif '推荐策略与缓存已同步' not in text:
    raise SystemExit('PairingActivity pair() marker not found')
pairing.write_text(text, encoding='utf-8')
