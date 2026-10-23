package com.picalibrary.android;

import android.content.Context;
import java.util.*;

/** Read-only Android adapter: resolve public raw-tag sidecars before calling pure personal rules. */
final class TagFactSnapshot {
    private final Map<String,List<String>> rawFacts;
    private TagFactSnapshot(Map<String,List<String>> facts){
        Map<String,List<String>> copy=new HashMap<>();
        for(Map.Entry<String,List<String>> entry:facts.entrySet())copy.put(entry.getKey(),Collections.unmodifiableList(new ArrayList<>(entry.getValue())));
        rawFacts=Collections.unmodifiableMap(copy);
    }
    static TagFactSnapshot empty(){return new TagFactSnapshot(Collections.emptyMap());}
    static TagFactSnapshot load(Context context){
        Map<String,List<String>> facts=new HashMap<>();
        for(UnifiedCatalogStore.Entry entry:UnifiedCatalogStore.load(context).entries()){
            if("eh".equals(TagParticipation.provider(entry.id))&&!entry.providerRawTags.isEmpty())facts.put(entry.id,entry.providerRawTags);
        }
        for(PortableRecommendationPackageStore.Candidate candidate:PortableRecommendationPackageStore.load(context).candidates){
            if("eh".equals(TagParticipation.provider(candidate.comicId))&&!candidate.providerRawTags.isEmpty())facts.putIfAbsent(candidate.comicId,candidate.providerRawTags);
        }
        for(EhSemanticStore.Record record:EhSemanticStore.load(context).byComicId.values()){
            List<String> tags=new ArrayList<>();for(EhSemanticStore.Tag tag:record.rawTags)tags.add(tag.canonical);
            if(!tags.isEmpty())facts.put(record.comicId,tags);
        }
        return new TagFactSnapshot(facts);
    }
    List<String> facts(String id,Collection<String> fallback){
        List<String> raw=rawFacts.get(id);
        return new ArrayList<>(raw==null||raw.isEmpty()?fallback:raw);
    }
    EhSemanticStore.Snapshot semanticView(EhSemanticStore.Snapshot original){
        EhSemanticStore.Snapshot view=new EhSemanticStore.Snapshot();view.updatedAt=original.updatedAt;view.byComicId.putAll(original.byComicId);
        for(Map.Entry<String,List<String>> item:rawFacts.entrySet())if(!view.byComicId.containsKey(item.getKey())||view.byComicId.get(item.getKey()).rawTags.isEmpty()){
            EhSemanticStore.Record record=new EhSemanticStore.Record(item.getKey());
            for(String raw:item.getValue()){int split=raw.indexOf(':');record.rawTags.add(new EhSemanticStore.Tag(split>0?raw.substring(0,split):"",split>0?raw.substring(split+1):raw));}
            view.byComicId.put(item.getKey(),record);
        }
        return view; // A derived view, never written to the provider store.
    }
}
