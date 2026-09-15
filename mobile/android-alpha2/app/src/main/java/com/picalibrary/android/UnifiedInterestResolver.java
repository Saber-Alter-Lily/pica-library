package com.picalibrary.android;

import java.util.*;

/** Provider-aware semantic bridge. Ranking identity never depends on translated display text. */
final class UnifiedInterestResolver {
    static final class Signal {
        final String key,label,facet,utility,observedLabel,providerCanonical;
        final boolean eligible;
        Signal(String key,String label,String facet,String utility,String observedLabel,String providerCanonical,boolean eligible){this.key=key;this.label=label;this.facet=facet;this.utility=utility;this.observedLabel=observedLabel;this.providerCanonical=providerCanonical;this.eligible=eligible;}
    }

    private UnifiedInterestResolver(){}

    static List<Signal> resolve(PicaClient.Comic comic,MobileTagRegistry registry,EhSemanticStore.Snapshot ehSemantics,EhTagTranslationStore translations){
        if(comic==null)return Collections.emptyList();
        return comic.id!=null&&comic.id.startsWith("eh:")?resolveEh(comic,registry,ehSemantics,translations):resolvePica(comic,registry);
    }

    private static List<Signal> resolvePica(PicaClient.Comic comic,MobileTagRegistry registry){
        LinkedHashMap<String,Signal> out=new LinkedHashMap<>();for(String raw:comic.tags){MobileTagRegistry.Resolved r=registry.resolve(raw);if(!r.primaryEligible())continue;Signal s=new Signal(r.canonicalKey,r.canonicalLabel,r.facet,r.retrievalUtility,raw,"pica:"+MobileTagRegistry.normalize(raw),true);out.putIfAbsent(s.facet+"\u0000"+s.key,s);}return new ArrayList<>(out.values());
    }

    private static List<Signal> resolveEh(PicaClient.Comic comic,MobileTagRegistry registry,EhSemanticStore.Snapshot semantics,EhTagTranslationStore translations){
        LinkedHashMap<String,Signal> out=new LinkedHashMap<>();EhSemanticStore.Record record=semantics==null?null:semantics.byComicId.get(comic.id);
        if(record==null||record.rawTags.isEmpty()){
            // Compatibility while old catalog rows are naturally backfilled by future E-H metadata refreshes.
            for(String raw:comic.tags){MobileTagRegistry.Resolved r=registry.resolve(raw);if(!r.primaryEligible())continue;Signal s=new Signal(r.canonicalKey,r.canonicalLabel,r.facet,r.retrievalUtility,raw,"eh-flat:"+MobileTagRegistry.normalize(raw),true);out.putIfAbsent(s.facet+"\u0000"+s.key,s);}return new ArrayList<>(out.values());
        }
        for(EhSemanticStore.Tag tag:record.rawTags){Signal signal=resolveEhTag(tag,registry,translations);if(signal==null||!signal.eligible)continue;out.putIfAbsent(signal.facet+"\u0000"+signal.key,signal);}return new ArrayList<>(out.values());
    }

    static Signal resolveEhTag(EhSemanticStore.Tag tag,MobileTagRegistry registry,EhTagTranslationStore translations){
        if(tag==null||tag.value.isEmpty())return null;
        // First bridge into the existing frozen Pica registry. This gives true cross-provider concepts when aliases/entities match.
        MobileTagRegistry.Resolved bridged=registry.resolve(tag.value);if(bridged.primaryEligible())return new Signal(bridged.canonicalKey,bridged.canonicalLabel,bridged.facet,bridged.retrievalUtility,tag.value,tag.canonical,true);
        String ns=tag.namespace,label=translations==null?tag.value:translations.display(ns,tag.value),key="eh:"+tag.canonical;
        if("parody".equals(ns))return new Signal(key,label,"FANDOM_IP","HIGH_PRECISION_ANCHOR",tag.value,tag.canonical,true);
        if("character".equals(ns))return new Signal(key,label,"FANDOM_CHARACTER","HIGH_PRECISION_ANCHOR",tag.value,tag.canonical,true);
        if("female".equals(ns)||"male".equals(ns)||"mixed".equals(ns)||"location".equals(ns)||"other".equals(ns))return new Signal(key,label,"SEMANTIC_TRAIT","CONJUNCTION_ANCHOR",tag.value,tag.canonical,true);
        // Creator namespaces are already represented by comic.author/creator intents. Language/reclass are useful filters but weak preference evidence.
        if("artist".equals(ns)||"group".equals(ns)||"cosplayer".equals(ns)||"language".equals(ns)||"reclass".equals(ns))return new Signal(key,label,"PROFILE_ONLY","PROFILE_ONLY",tag.value,tag.canonical,false);
        return new Signal(key,label,"PROFILE_ONLY","PROFILE_ONLY",tag.value,tag.canonical,false);
    }
}
