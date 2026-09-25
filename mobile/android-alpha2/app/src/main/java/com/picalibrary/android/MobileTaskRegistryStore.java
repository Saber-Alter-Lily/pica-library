package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.*;

/** Durable identities for WorkManager tasks that must reconstruct after process death. */
final class MobileTaskRegistryStore {
    private static final String PREFS="background-task-registry-v1";
    private static final String DOWNLOADS="downloads";

    static final class DownloadRef {
        final String provider,comicId,episodeId,workId;
        DownloadRef(String provider,String comicId,String episodeId,String workId){
            this.provider=safe(provider);
            this.comicId=safe(comicId);
            this.episodeId=safe(episodeId);
            this.workId=safe(workId);
        }
        String key(){return provider+"\n"+comicId+"\n"+episodeId;}
    }

    private MobileTaskRegistryStore(){}

    private static SharedPreferences prefs(Context context){
        return context.getApplicationContext().getSharedPreferences(PREFS,Context.MODE_PRIVATE);
    }

    private static String workKey(String scope,String id){
        return "work:"+ReaderPolicy.hash(safe(scope)+"\n"+safe(id));
    }

    static synchronized void setWorkId(Context context,String scope,String id,UUID workId){
        prefs(context).edit().putString(workKey(scope,id),workId==null?"":workId.toString()).apply();
    }

    static synchronized String workId(Context context,String scope,String id){
        return prefs(context).getString(workKey(scope,id),"");
    }

    static synchronized void clearWorkId(Context context,String scope,String id){
        prefs(context).edit().remove(workKey(scope,id)).apply();
    }

    static synchronized void registerDownload(Context context,String provider,String comicId,String episodeId,UUID workId){
        String p=safe(provider),comic=safe(comicId),episode=safe(episodeId),id=workId==null?"":workId.toString();
        ArrayList<DownloadRef> values=new ArrayList<>(downloads(context));
        String key=new DownloadRef(p,comic,episode,id).key();
        values.removeIf(value->value.key().equals(key));
        values.add(new DownloadRef(p,comic,episode,id));
        saveDownloads(context,values);
    }

    static synchronized void unregisterDownload(Context context,String provider,String comicId,String episodeId){
        String key=new DownloadRef(provider,comicId,episodeId,"").key();
        ArrayList<DownloadRef> values=new ArrayList<>(downloads(context));
        values.removeIf(value->value.key().equals(key));
        saveDownloads(context,values);
    }

    static synchronized List<DownloadRef> downloads(Context context){
        ArrayList<DownloadRef> out=new ArrayList<>();
        String raw=prefs(context).getString(DOWNLOADS,"[]");
        try{
            JSONArray rows=new JSONArray(raw==null?"[]":raw);
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.optJSONObject(i);
                if(row==null)continue;
                String provider=row.optString("provider",""),comicId=row.optString("comicId",""),episodeId=row.optString("episodeId",""),workId=row.optString("workId","");
                if(provider.isEmpty()||comicId.isEmpty())continue;
                out.add(new DownloadRef(provider,comicId,episodeId,workId));
            }
        }catch(Exception ignored){}
        return out;
    }

    private static void saveDownloads(Context context,List<DownloadRef> values){
        JSONArray rows=new JSONArray();
        for(DownloadRef value:values){
            try{
                JSONObject row=new JSONObject();
                row.put("provider",value.provider);
                row.put("comicId",value.comicId);
                row.put("episodeId",value.episodeId);
                row.put("workId",value.workId);
                rows.put(row);
            }catch(Exception ignored){}
        }
        prefs(context).edit().putString(DOWNLOADS,rows.toString()).apply();
    }

    private static String safe(String value){return value==null?"":value;}
}
