package com.picalibrary.android;

import android.content.Context;

import androidx.work.WorkInfo;
import androidx.work.WorkManager;
import androidx.work.OneTimeWorkRequest;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Observe-only Android resource classification for P2-G17.
 *
 * Tags describe coarse resources occupied by heavy WorkManager jobs. They do not throttle,
 * reprioritize or replace WorkManager scheduling.
 */
final class AndroidTaskResources {
    static final String PREFIX="pica-resource:";
    static final String PROVIDER_NETWORK="provider-network";
    static final String MEDIA_NETWORK="media-network";
    static final String BRIDGE_NETWORK="bridge-network";
    static final String CPU_ANALYSIS="cpu-analysis";
    static final String FILESYSTEM_HEAVY="filesystem-heavy";

    static final List<String> ALL=Collections.unmodifiableList(
        java.util.Arrays.asList(
            PROVIDER_NETWORK,
            MEDIA_NETWORK,
            BRIDGE_NETWORK,
            CPU_ANALYSIS,
            FILESYSTEM_HEAVY
        )
    );

    private AndroidTaskResources(){}

    static OneTimeWorkRequest.Builder tag(
        OneTimeWorkRequest.Builder builder,String...resources
    ){
        if(builder==null)return null;
        if(resources!=null)for(String resource:resources){
            if(resource==null||resource.trim().isEmpty())continue;
            builder.addTag(PREFIX+resource.trim());
        }
        return builder;
    }

    static Set<String> resources(WorkInfo info){
        LinkedHashSet<String> out=new LinkedHashSet<>();
        if(info==null)return out;
        for(String tag:info.getTags()){
            if(tag!=null&&tag.startsWith(PREFIX)){
                String value=tag.substring(PREFIX.length());
                if(ALL.contains(value))out.add(value);
            }
        }
        return out;
    }

    static Snapshot snapshot(Context context) throws Exception {
        WorkManager manager=WorkManager.getInstance(context.getApplicationContext());
        LinkedHashMap<String,Integer> running=new LinkedHashMap<>();
        LinkedHashMap<String,Integer> waiting=new LinkedHashMap<>();
        LinkedHashSet<String> runningIds=new LinkedHashSet<>();
        LinkedHashSet<String> waitingIds=new LinkedHashSet<>();
        LinkedHashMap<String,Set<String>> resourcesByWork=new LinkedHashMap<>();

        for(String resource:ALL){
            int runningCount=0,waitingCount=0;
            List<WorkInfo> infos=manager.getWorkInfosByTag(PREFIX+resource)
                .get(5,TimeUnit.SECONDS);
            for(WorkInfo info:infos){
                WorkInfo.State state=info.getState();
                String id=info.getId().toString();
                if(state==WorkInfo.State.RUNNING){
                    runningCount++;
                    runningIds.add(id);
                    resourcesByWork.computeIfAbsent(id,k->new LinkedHashSet<>()).add(resource);
                }else if(state==WorkInfo.State.ENQUEUED||state==WorkInfo.State.BLOCKED){
                    waitingCount++;
                    waitingIds.add(id);
                    resourcesByWork.computeIfAbsent(id,k->new LinkedHashSet<>()).add(resource);
                }
            }
            running.put(resource,runningCount);
            waiting.put(resource,waitingCount);
        }
        return new Snapshot(running,waiting,runningIds,waitingIds,resourcesByWork);
    }

    static final class Snapshot {
        final Map<String,Integer> runningByResource;
        final Map<String,Integer> waitingByResource;
        final Set<String> runningWorkIds;
        final Set<String> waitingWorkIds;
        final Map<String,Set<String>> resourcesByWork;

        Snapshot(
            Map<String,Integer> runningByResource,
            Map<String,Integer> waitingByResource,
            Set<String> runningWorkIds,
            Set<String> waitingWorkIds,
            Map<String,Set<String>> resourcesByWork
        ){
            this.runningByResource=Collections.unmodifiableMap(
                new LinkedHashMap<>(runningByResource)
            );
            this.waitingByResource=Collections.unmodifiableMap(
                new LinkedHashMap<>(waitingByResource)
            );
            this.runningWorkIds=Collections.unmodifiableSet(
                new LinkedHashSet<>(runningWorkIds)
            );
            this.waitingWorkIds=Collections.unmodifiableSet(
                new LinkedHashSet<>(waitingWorkIds)
            );
            LinkedHashMap<String,Set<String>> copy=new LinkedHashMap<>();
            for(Map.Entry<String,Set<String>> row:resourcesByWork.entrySet()){
                copy.put(
                    row.getKey(),
                    Collections.unmodifiableSet(new LinkedHashSet<>(row.getValue()))
                );
            }
            this.resourcesByWork=Collections.unmodifiableMap(copy);
        }

        int runningTotal(){return runningWorkIds.size();}
        int waitingTotal(){return waitingWorkIds.size();}
        int running(String resource){return runningByResource.getOrDefault(resource,0);}
        int waiting(String resource){return waitingByResource.getOrDefault(resource,0);}
    }
}
