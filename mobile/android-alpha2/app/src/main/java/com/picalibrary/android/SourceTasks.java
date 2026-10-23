package com.picalibrary.android;

import android.content.Context;
import androidx.work.WorkManager;

/** Stop provider work, not the user's files, registry, identity or ordinary LAN/WebDAV sync. */
final class SourceTasks {
    private SourceTasks(){}
    static void pause(Context context,String source){
        for(MobileTaskRegistryStore.DownloadRef ref:MobileTaskRegistryStore.downloads(context)){
            if(!source.equals(ref.provider))continue;
            try{
                String name="pica".equals(source)?PicaDownloadJobs.name(ref.comicId,ref.episodeId)
                        :"eh".equals(source)?EhDownloadJobs.name(ref.comicId):JmDownloadJobs.name(ref.comicId);
                MobileTaskPauseStore.setPaused(context,"download",name,true);
            }catch(IllegalArgumentException invalidRecord){
                // Keep the old record for task recovery; it must not prevent cancelling the source.
                android.util.Log.w("SourceTasks","Skipping invalid download identity while pausing source");
            }
        }
        // Workers also check their epoch before every request/commit. Cancelling queued work is
        // supplementary, including jobs not yet reconstructed into the task registry.
        if("pica".equals(source))MobileTaskPauseStore.setPaused(context,"pica-bootstrap",PicaBootstrapJobs.UNIQUE_NAME,true);
        try{
            WorkManager work=WorkManager.getInstance(context.getApplicationContext());
            work.cancelAllWorkByTag(source+"-download");
            if("pica".equals(source))work.cancelUniqueWork(PicaBootstrapJobs.UNIQUE_NAME);
        }catch(IllegalStateException schedulerUnavailable){
            // The saved policy and revoked permits are already effective. Do not report that
            // saving failed just because WorkManager could not initialize in this process.
            android.util.Log.w("SourceTasks","Source is disabled; task scheduler is unavailable");
        }
    }
}
