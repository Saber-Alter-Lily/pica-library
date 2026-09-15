package com.picalibrary.android;

import android.content.Context;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.*;

/** Derived, auditable creator concepts over the unified catalog and lossless E-H semantics. */
final class AuthorConceptStore {
    static final class Binding {
        final String providerId,rawName,providerCanonical,role;final LinkedHashSet<String> comicIds=new LinkedHashSet<>();
        Binding(String providerId,String rawName,String providerCanonical,String role){this.providerId=safe(providerId);this.rawName=safe(rawName);this.providerCanonical=safe(providerCanonical);this.role=safe(role);}
    }
    static final class Concept {
        final String id;String canonicalName="";double confidence=0.7;final LinkedHashSet<String> aliases=new LinkedHashSet<>(),circles=new LinkedHashSet<>(),roles=new LinkedHashSet<>(),comicIds=new LinkedHashSet<>();final ArrayList<Binding> bindings=new ArrayList<>();
        Concept(String id,String canonicalName){this.id=id;this.canonicalName=canonicalName;}
        Binding binding(String provider,String canonical,String role){for(Binding value:bindings)if(value.providerId.equals(provider)&&value.providerCanonical.equals(canonical)&&value.role.equals(role))return value;Binding next=new Binding(provider,canonicalValue(canonical),canonical,role);bindings.add(next);return next;}
        boolean hasProvider(String provider){for(Binding b:bindings)if(provider.equals(b.providerId))return true;return false;}
        String bindingCanonical(String provider){for(Binding b:bindings)if(provider.equals(b.providerId)&&("artist".equals(b.role)||"author".equals(b.role)))return b.providerCanonical;for(Binding b:bindings)if(provider.equals(b.providerId))return b.providerCanonical;return "";}
        int works(){return comicIds.size();}
    }
    static final class Snapshot {
        final LinkedHashMap<String,Concept> byId=new LinkedHashMap<>();
        final LinkedHashMap<String,String> personIndex=new LinkedHashMap<>();
        final LinkedHashMap<String,String> groupIndex=new LinkedHashMap<>();
        List<Concept> all(){ArrayList<Concept> out=new ArrayList<>(byId.values());out.sort((a,b)->{int w=Integer.compare(b.works(),a.works());return w!=0?w:a.canonicalName.compareToIgnoreCase(b.canonicalName);});return out;}
        List<Concept> forComic(String comicId){ArrayList<Concept> out=new ArrayList<>();for(Concept c:byId.values())if(c.comicIds.contains(comicId))out.add(c);out.sort((a,b)->{int role=Integer.compare(roleRank(a),roleRank(b));return role!=0?role:a.canonicalName.compareToIgnoreCase(b.canonicalName);});return out;}
        Concept get(String id){return byId.get(id);}
        private static int roleRank(Concept c){return c.roles.contains("artist")||c.roles.contains("author")?0:1;}
    }
    private static final class ParsedPica {final String circle,creator;ParsedPica(String circle,String creator){this.circle=circle;this.creator=creator;}}
    private AuthorConceptStore(){}

    static Snapshot build(Context context){return build(UnifiedCatalogStore.load(context),EhSemanticStore.load(context));}
    static Snapshot build(UnifiedCatalogStore.Snapshot catalog,EhSemanticStore.Snapshot semantics){
        Snapshot out=new Snapshot();
        // Strong catalog identities establish canonical aliases before provider-specific inference.
        for(UnifiedCatalogStore.Entry e:catalog.entries())if(!safe(e.authorId).isEmpty()||!safe(e.canonicalAuthor).isEmpty()){
            ParsedPica parsed=parsePica(e.author);String canonical=!safe(e.canonicalAuthor).isEmpty()?e.canonicalAuthor:parsed.creator;String id=!safe(e.authorId).isEmpty()?e.authorId:conceptId("person",canonical);Concept c=ensure(out,id,canonical);c.confidence=!safe(e.authorId).isEmpty()?1.0:0.9;c.aliases.add(canonical);if(!safe(e.author).isEmpty())c.aliases.add(e.author);if(!parsed.creator.isEmpty())c.aliases.add(parsed.creator);if(!parsed.circle.isEmpty())c.circles.add(parsed.circle);indexPerson(out,c);
        }
        for(UnifiedCatalogStore.Entry e:catalog.entries()){
            if(EhClient.isEhId(e.id)||"eh".equals(e.providerId))bindEh(out,e,semantics.byComicId.get(e.id));else bindPica(out,e);
        }
        for(Concept c:out.byId.values()){c.aliases.remove("");c.circles.remove("");}
        return out;
    }

    private static void bindPica(Snapshot out,UnifiedCatalogStore.Entry e){ParsedPica parsed=parsePica(e.author);String creator=!safe(e.canonicalAuthor).isEmpty()?e.canonicalAuthor:parsed.creator;if(creator.isEmpty()||generic(creator))return;Concept c=null;if(!safe(e.authorId).isEmpty())c=out.byId.get(e.authorId);if(c==null)c=findPerson(out,creator);if(c==null)c=ensure(out,conceptId("person",creator),creator);c.roles.add("author");c.aliases.add(creator);c.aliases.add(safe(e.author));if(!parsed.circle.isEmpty())c.circles.add(parsed.circle);c.comicIds.add(e.id);Binding binding=c.binding("pica",creator,"author");binding.comicIds.add(e.id);indexPerson(out,c);}

    private static void bindEh(Snapshot out,UnifiedCatalogStore.Entry e,EhSemanticStore.Record record){ArrayList<EhSemanticStore.Tag> artists=new ArrayList<>(),groups=new ArrayList<>();if(record!=null)for(EhSemanticStore.Tag tag:record.rawTags){if("artist".equals(tag.namespace))artists.add(tag);else if("group".equals(tag.namespace))groups.add(tag);}if(!artists.isEmpty()){for(EhSemanticStore.Tag tag:artists){String name=tag.value;if(name.isEmpty()||generic(name))continue;Concept c=findPerson(out,name);if(c==null)c=ensure(out,conceptId("person",name),name);c.roles.add("artist");c.aliases.add(name);c.comicIds.add(e.id);Binding b=c.binding("eh","artist:"+name,"artist");b.comicIds.add(e.id);indexPerson(out,c);}for(EhSemanticStore.Tag tag:groups)for(Concept c:out.byId.values())if(c.comicIds.contains(e.id)&&(c.roles.contains("artist")||c.roles.contains("author")))c.circles.add(tag.value);return;}
        if(!groups.isEmpty()){for(EhSemanticStore.Tag tag:groups){String name=tag.value;if(name.isEmpty()||generic(name))continue;String key=norm(name);Concept c=out.groupIndex.containsKey(key)?out.byId.get(out.groupIndex.get(key)):null;if(c==null)c=ensure(out,conceptId("group",name),name);c.roles.add("group");c.aliases.add(name);c.comicIds.add(e.id);Binding b=c.binding("eh","group:"+name,"group");b.comicIds.add(e.id);out.groupIndex.put(key,c.id);}return;}
        String fallback=safe(e.author);if(fallback.isEmpty()||generic(fallback))return;Concept c=findPerson(out,fallback);if(c==null)c=ensure(out,conceptId("person",fallback),fallback);c.roles.add("author");c.aliases.add(fallback);c.comicIds.add(e.id);Binding b=c.binding("eh","", "author");b.comicIds.add(e.id);indexPerson(out,c);
    }

    static boolean matches(Concept c,String value){String key=norm(value);if(key.isEmpty())return false;if(norm(c.canonicalName).equals(key))return true;for(String alias:c.aliases)if(norm(alias).equals(key))return true;return false;}
    static String queryForPica(Concept c){for(Binding b:c.bindings)if("pica".equals(b.providerId)&&!b.rawName.isEmpty())return b.rawName;return c.canonicalName;}
    static String queryForEh(Concept c){String canonical=c.bindingCanonical("eh");return canonical.isEmpty()?c.canonicalName:EhOnlineFilterSpec.exactCanonical(canonical);}
    static String sourceLabel(Concept c){ArrayList<String> values=new ArrayList<>();if(c.hasProvider("pica"))values.add("Pica");if(c.hasProvider("eh"))values.add("E-H");return values.isEmpty()?"本地":String.join(" · ",values);}

    private static Concept findPerson(Snapshot out,String name){String id=out.personIndex.get(norm(name));return id==null?null:out.byId.get(id);}
    private static void indexPerson(Snapshot out,Concept c){out.personIndex.put(norm(c.canonicalName),c.id);for(String alias:c.aliases){String key=norm(alias);if(!key.isEmpty())out.personIndex.putIfAbsent(key,c.id);}}
    private static Concept ensure(Snapshot out,String id,String canonical){Concept c=out.byId.get(id);if(c==null){c=new Concept(id,canonical);out.byId.put(id,c);}if(c.canonicalName.isEmpty())c.canonicalName=canonical;return c;}
    private static ParsedPica parsePica(String raw){String value=safe(raw).trim();if(value.isEmpty())return new ParsedPica("","");int open=value.lastIndexOf('('),close=value.endsWith(")")?value.length()-1:-1;if(open>0&&close>open+1){String circle=value.substring(0,open).trim(),creator=value.substring(open+1,close).trim();if(!creator.isEmpty()&&!creator.contains(",")&&!creator.contains("、")&&!creator.contains("/"))return new ParsedPica(circle,creator);}return new ParsedPica("",value);}
    private static boolean generic(String value){String key=norm(value);return key.isEmpty()||key.equals("unknown")||key.equals("未知作者")||key.equals("various")||key.equals("multiple")||key.equals("不明")||key.equals("よろず");}
    private static String conceptId(String type,String name){try{byte[] digest=MessageDigest.getInstance("SHA-1").digest((type+"\n"+norm(name)).getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder(type).append('_');for(int i=0;i<8;i++)out.append(String.format(Locale.ROOT,"%02x",digest[i]&255));return out.toString();}catch(Exception e){return type+'_'+Integer.toHexString(norm(name).hashCode());}}
    private static String canonicalValue(String canonical){int at=canonical==null?-1:canonical.indexOf(':');return at>=0?canonical.substring(at+1):safe(canonical);}
    private static String norm(String value){return Normalizer.normalize(safe(value),Normalizer.Form.NFKC).replaceAll("\\s+"," ").trim().toLowerCase(Locale.ROOT);}
    private static String safe(String value){return value==null?"":value;}
}
