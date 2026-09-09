package com.picalibrary.android;

import android.content.SharedPreferences;
import java.util.HashSet;
import java.util.Set;

/** Persists grouped library filters without mixing them into source configuration. */
final class UnifiedFilterStore {
    private static final String PREFIX="unified-filter-v1-";
    private UnifiedFilterStore(){}

    static UnifiedLibraryFilter.Spec load(SharedPreferences preferences){
        UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();
        spec.sources.addAll(enumSet(UnifiedLibraryFilter.Source.class,preferences.getStringSet(PREFIX+"sources",new HashSet<>())));
        spec.authors.addAll(copy(preferences.getStringSet(PREFIX+"authors",new HashSet<>())));
        spec.tags.addAll(copy(preferences.getStringSet(PREFIX+"tags",new HashSet<>())));
        spec.categories.addAll(copy(preferences.getStringSet(PREFIX+"categories",new HashSet<>())));
        spec.favoriteOnly=preferences.getBoolean(PREFIX+"favorite",false);
        spec.shelfOnly=preferences.getBoolean(PREFIX+"shelf",false);
        int finished=preferences.getInt(PREFIX+"finished",-1);spec.finished=finished<0?null:finished==1;
        try{spec.tagMode=UnifiedLibraryFilter.TagMode.valueOf(preferences.getString(PREFIX+"tag-mode",UnifiedLibraryFilter.TagMode.ANY.name()));}catch(Exception ignored){}
        try{spec.sort=UnifiedLibraryFilter.Sort.valueOf(preferences.getString(PREFIX+"sort",UnifiedLibraryFilter.Sort.LATEST.name()));}catch(Exception ignored){}
        return spec;
    }

    static void save(SharedPreferences preferences,UnifiedLibraryFilter.Spec spec){
        Set<String> sources=new HashSet<>();for(UnifiedLibraryFilter.Source value:spec.sources)sources.add(value.name());
        preferences.edit()
            .putStringSet(PREFIX+"sources",sources)
            .putStringSet(PREFIX+"authors",new HashSet<>(spec.authors))
            .putStringSet(PREFIX+"tags",new HashSet<>(spec.tags))
            .putStringSet(PREFIX+"categories",new HashSet<>(spec.categories))
            .putBoolean(PREFIX+"favorite",spec.favoriteOnly)
            .putBoolean(PREFIX+"shelf",spec.shelfOnly)
            .putInt(PREFIX+"finished",spec.finished==null?-1:spec.finished?1:0)
            .putString(PREFIX+"tag-mode",spec.tagMode.name())
            .putString(PREFIX+"sort",spec.sort.name())
            .apply();
    }

    private static Set<String> copy(Set<String> source){return source==null?new HashSet<>():new HashSet<>(source);}
    private static <T extends Enum<T>> Set<T> enumSet(Class<T> type,Set<String> raw){Set<T> out=new HashSet<>();if(raw!=null)for(String value:raw)try{out.add(Enum.valueOf(type,value));}catch(Exception ignored){}return out;}
}
