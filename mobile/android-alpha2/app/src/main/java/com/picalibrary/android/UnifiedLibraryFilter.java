package com.picalibrary.android;

import java.util.*;

/** Pure, local filtering/faceting for the unified mobile library. */
final class UnifiedLibraryFilter {
    enum Source { PHONE, DESKTOP, WEBDAV, PICA }
    enum TagMode { ANY, ALL }
    enum Sort { LATEST, TITLE, AUTHOR }

    static final class Spec {
        String text="";
        final Set<Source> sources=new LinkedHashSet<>();
        final Set<String> authors=new LinkedHashSet<>();
        final Set<String> tags=new LinkedHashSet<>();
        final Set<String> categories=new LinkedHashSet<>();
        boolean favoriteOnly;
        boolean shelfOnly;
        Boolean finished;
        TagMode tagMode=TagMode.ANY;
        Sort sort=Sort.LATEST;

        Spec copy(){
            Spec next=new Spec();next.text=text;next.sources.addAll(sources);next.authors.addAll(authors);next.tags.addAll(tags);next.categories.addAll(categories);next.favoriteOnly=favoriteOnly;next.shelfOnly=shelfOnly;next.finished=finished;next.tagMode=tagMode;next.sort=sort;return next;
        }
        int activeCount(){
            int count=sources.isEmpty()?0:1;
            if(favoriteOnly)count++;if(shelfOnly)count++;if(finished!=null)count++;
            if(!authors.isEmpty())count++;if(!tags.isEmpty())count++;if(!categories.isEmpty())count++;
            if(sort!=Sort.LATEST)count++;return count;
        }
        void clear(){sources.clear();authors.clear();tags.clear();categories.clear();favoriteOnly=false;shelfOnly=false;finished=null;tagMode=TagMode.ANY;sort=Sort.LATEST;}
    }

    static final class Facet {
        final String value;final int count;
        Facet(String value,int count){this.value=value;this.count=count;}
    }
    static final class Facets {
        final List<Facet> authors,tags,categories;
        Facets(List<Facet> authors,List<Facet> tags,List<Facet> categories){this.authors=authors;this.tags=tags;this.categories=categories;}
    }

    private UnifiedLibraryFilter(){}

    static List<UnifiedCatalogStore.Entry> apply(List<UnifiedCatalogStore.Entry> source,Spec spec){
        ArrayList<UnifiedCatalogStore.Entry> out=new ArrayList<>();String text=norm(spec.text);
        for(UnifiedCatalogStore.Entry item:source){
            if(!text.isEmpty()&&!contains(item,text))continue;
            if(!spec.sources.isEmpty()&&!sourceMatch(item,spec.sources))continue;
            if(spec.favoriteOnly&&!item.favorite)continue;
            if(spec.shelfOnly&&!item.inShelf)continue;
            if(spec.finished!=null&&item.finished!=spec.finished.booleanValue())continue;
            if(!spec.authors.isEmpty()&&!spec.authors.contains(author(item)))continue;
            if(!matches(item.tags,spec.tags,spec.tagMode))continue;
            if(!matches(item.categories,spec.categories,TagMode.ANY))continue;
            out.add(item);
        }
        Comparator<UnifiedCatalogStore.Entry> comparator;
        if(spec.sort==Sort.TITLE)comparator=Comparator.comparing(a->norm(a.title));
        else if(spec.sort==Sort.AUTHOR)comparator=Comparator.comparing(a->norm(author(a)));
        else comparator=(a,b)->safe(b.updatedAt).compareTo(safe(a.updatedAt));
        out.sort(comparator.thenComparing(a->norm(a.title)));return out;
    }

    static Facets facets(List<UnifiedCatalogStore.Entry> items){
        Map<String,Integer> authors=new HashMap<>(),tags=new HashMap<>(),categories=new HashMap<>();
        for(UnifiedCatalogStore.Entry item:items){
            add(authors,author(item));for(String value:item.tags)add(tags,value);for(String value:item.categories)add(categories,value);
        }
        return new Facets(facetList(authors),facetList(tags),facetList(categories));
    }

    private static boolean sourceMatch(UnifiedCatalogStore.Entry item,Set<Source> selected){
        for(Source source:selected){
            if(source==Source.PHONE&&item.phoneDownloaded)return true;
            if(source==Source.DESKTOP&&item.desktopDownloaded)return true;
            if(source==Source.WEBDAV&&item.remoteAvailable)return true;
            if(source==Source.PICA&&item.picaAvailable)return true;
        }
        return false;
    }
    private static boolean contains(UnifiedCatalogStore.Entry item,String text){
        if(norm(item.title).contains(text)||norm(item.author).contains(text)||norm(item.canonicalAuthor).contains(text))return true;
        for(String value:item.tags)if(norm(value).contains(text))return true;
        for(String value:item.categories)if(norm(value).contains(text))return true;return false;
    }
    private static boolean matches(List<String> actual,Set<String> wanted,TagMode mode){
        if(wanted.isEmpty())return true;Set<String> values=new HashSet<>(actual);
        if(mode==TagMode.ALL)return values.containsAll(wanted);
        for(String value:wanted)if(values.contains(value))return true;return false;
    }
    private static String author(UnifiedCatalogStore.Entry item){return safe(item.canonicalAuthor).isEmpty()?safe(item.author):item.canonicalAuthor;}
    private static void add(Map<String,Integer> counts,String value){if(value==null||value.trim().isEmpty())return;counts.put(value,counts.getOrDefault(value,0)+1);}
    private static List<Facet> facetList(Map<String,Integer> counts){ArrayList<Facet> out=new ArrayList<>();for(Map.Entry<String,Integer> item:counts.entrySet())out.add(new Facet(item.getKey(),item.getValue()));out.sort((a,b)->{int count=Integer.compare(b.count,a.count);return count!=0?count:a.value.compareToIgnoreCase(b.value);});return out;}
    private static String norm(String value){return safe(value).trim().toLowerCase(Locale.ROOT);}
    private static String safe(String value){return value==null?"":value;}
}
