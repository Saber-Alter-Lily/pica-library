package com.picalibrary.android;

import android.content.SharedPreferences;
import java.util.HashSet;
import java.util.Set;

/** Persists grouped library filters without mixing replica location with provider identity. */
final class UnifiedFilterStore {
    private static final String V1="unified-filter-v1-",V2="unified-filter-v2-";
    private UnifiedFilterStore(){}

    static UnifiedLibraryFilter.Spec load(SharedPreferences preferences){
        UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();
        if(preferences.getBoolean(V2+"ready",false)){
            spec.locations.addAll(enumSet(UnifiedLibraryFilter.Location.class,preferences.getStringSet(V2+"locations",new HashSet<>())));
            spec.providers.addAll(enumSet(UnifiedLibraryFilter.Provider.class,preferences.getStringSet(V2+"providers",new HashSet<>())));
            readShared(preferences,spec,V2);
            return spec;
        }
        Set<String> legacy=copy(preferences.getStringSet(V1+"sources",new HashSet<>()));
        if(legacy.contains("PHONE"))spec.locations.add(UnifiedLibraryFilter.Location.PHONE);
        if(legacy.contains("DESKTOP"))spec.locations.add(UnifiedLibraryFilter.Location.DESKTOP);
        if(legacy.contains("WEBDAV"))spec.locations.add(UnifiedLibraryFilter.Location.WEBDAV);
        if(legacy.contains("PICA")){spec.locations.add(UnifiedLibraryFilter.Location.ONLINE);spec.providers.add(UnifiedLibraryFilter.Provider.PICA);}
        readShared(preferences,spec,V1);save(preferences,spec);return spec;
    }

    private static void readShared(SharedPreferences preferences,UnifiedLibraryFilter.Spec spec,String prefix){
        spec.authors.addAll(copy(preferences.getStringSet(prefix+"authors",new HashSet<>())));
        spec.tags.addAll(copy(preferences.getStringSet(prefix+"tags",new HashSet<>())));
        spec.categories.addAll(copy(preferences.getStringSet(prefix+"categories",new HashSet<>())));
        spec.favoriteOnly=preferences.getBoolean(prefix+"favorite",false);
        spec.shelfOnly=preferences.getBoolean(prefix+"shelf",false);
        int finished=preferences.getInt(prefix+"finished",-1);spec.finished=finished<0?null:finished==1;
        try{spec.tagMode=UnifiedLibraryFilter.TagMode.valueOf(preferences.getString(prefix+"tag-mode",UnifiedLibraryFilter.TagMode.ANY.name()));}catch(Exception ignored){}
        try{spec.sort=UnifiedLibraryFilter.Sort.valueOf(preferences.getString(prefix+"sort",UnifiedLibraryFilter.Sort.LATEST.name()));}catch(Exception ignored){}
    }

    static void save(SharedPreferences preferences,UnifiedLibraryFilter.Spec spec){
        Set<String> locations=new HashSet<>();for(UnifiedLibraryFilter.Location value:spec.locations)locations.add(value.name());Set<String> providers=new HashSet<>();for(UnifiedLibraryFilter.Provider value:spec.providers)providers.add(value.name());
        preferences.edit()
            .putBoolean(V2+"ready",true)
            .putStringSet(V2+"locations",locations)
            .putStringSet(V2+"providers",providers)
            .putStringSet(V2+"authors",new HashSet<>(spec.authors))
            .putStringSet(V2+"tags",new HashSet<>(spec.tags))
            .putStringSet(V2+"categories",new HashSet<>(spec.categories))
            .putBoolean(V2+"favorite",false)
            .putBoolean(V2+"shelf",spec.shelfOnly)
            .putInt(V2+"finished",spec.finished==null?-1:spec.finished?1:0)
            .putString(V2+"tag-mode",spec.tagMode.name())
            .putString(V2+"sort",spec.sort.name())
            .apply();
    }

    private static Set<String> copy(Set<String> source){return source==null?new HashSet<>():new HashSet<>(source);}
    private static <T extends Enum<T>> Set<T> enumSet(Class<T> type,Set<String> raw){Set<T> out=new HashSet<>();if(raw!=null)for(String value:raw)try{out.add(Enum.valueOf(type,value));}catch(Exception ignored){}return out;}
}
