package com.picalibrary.android.tags;

import java.text.Normalizer;
import java.util.*;

/** Personal signal rules only. No Android, JSON, persistence, provider client or ranker dependency. */
public final class TagPolicyRules {
    public static final String PRIVATE_PREFIX = "@private/";
    private static final List<String> PROVIDERS = Arrays.asList("pica", "eh", "jm", "local");
    // ECMAScript whitespace, shared with the Desktop NFKC/trim/lowercase/collapse contract.
    private static final String SPACE = "[\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]";

    public final String mode;
    public final Set<String> selected, disabled;
    public final List<PrivateTag> privateTags;
    private final Map<String, PrivateTag> byId;

    public static String trim(String value) { return value.replaceAll("^" + SPACE + "+|" + SPACE + "+$", ""); }
    public static String normalizeKey(String raw) {
        return trim(Normalizer.normalize(raw == null ? "" : raw, Normalizer.Form.NFKC))
                .toLowerCase(Locale.ROOT).replaceAll(SPACE + "+", " ");
    }
    public static String provider(String id) { return provider(id, null); }
    public static String provider(String id, String explicit) {
        String comic = id == null ? "" : id;
        if ("local".equals(explicit) || comic.startsWith("local:")) return "local";
        if ("eh".equals(explicit) || comic.startsWith("eh:")) return "eh";
        if ("jm".equals(explicit) || comic.startsWith("jm:")) return "jm";
        return "pica";
    }
    public static String identity(String provider, String raw) { return provider + "|" + normalizeKey(raw); }
    public static String semanticValue(String provider, String raw) {
        int split = raw.indexOf(':');
        return "eh".equals(provider) && split > 0 ? trim(raw.substring(split + 1)) : raw;
    }

    private static List<String> normalized(Collection<String> values, boolean identities) {
        if (values == null || values.size() > 4096) throw new IllegalArgumentException("Invalid or oversized tag-policy list");
        TreeSet<String> sorted = new TreeSet<>();
        for (String value : values) {
            if (value == null) throw new IllegalArgumentException("Invalid tag-policy string");
            String clean = normalizeKey(value);
            if (clean.isEmpty()) continue;
            if (identities) {
                int split = clean.indexOf('|');
                String source = split < 0 ? "" : clean.substring(0, split), key = split < 0 ? "" : clean.substring(split + 1);
                if ((!PROVIDERS.contains(source) && !"private".equals(source)) || key.isEmpty() || key.length() > 200
                        || ("private".equals(source) && !key.matches("pt_[a-f0-9]{32}"))) {
                    throw new IllegalArgumentException("Invalid provider-scoped tag identity");
                }
            } else if (clean.length() > 200) throw new IllegalArgumentException("Invalid comic identity");
            sorted.add(clean);
        }
        return Collections.unmodifiableList(new ArrayList<>(sorted));
    }

    public static final class PrivateTag {
        public final String id, name, kind;
        public final List<String> comicIds, mappings;
        private final Set<String> comics, rawMappings;

        public PrivateTag(String id, String name, String kind, Collection<String> comicIds, Collection<String> mappings) {
            this.id = id;
            this.name = name == null ? "" : trim(Normalizer.normalize(name, Normalizer.Form.NFKC));
            this.kind = kind;
            if (id == null || !id.matches("pt_[a-f0-9]{32}") || this.name.isEmpty() || this.name.length() > 80
                    || this.name.matches("(?s).*[\\x00-\\x1f\\x7f].*") || !Arrays.asList("MANUAL", "MAPPED").contains(kind)) {
                throw new IllegalArgumentException("Invalid private tag");
            }
            this.comicIds = normalized(comicIds, false);
            this.mappings = normalized(mappings, true);
            if (this.mappings.stream().anyMatch(v -> v.startsWith("private|"))
                    || ("MANUAL".equals(kind) && !this.mappings.isEmpty())
                    || ("MAPPED".equals(kind) && !this.comicIds.isEmpty())) {
                throw new IllegalArgumentException("Mixed or recursive private-tag bindings");
            }
            this.comics = new HashSet<>(this.comicIds);
            this.rawMappings = new HashSet<>(this.mappings);
        }

        public boolean matches(Comic comic) {
            if ("MANUAL".equals(kind)) return comics.contains(normalizeKey(comic.id));
            for (String raw : comic.facts) if (rawMappings.contains(identity(comic.provider, raw))) return true;
            return false;
        }
    }

    /** Immutable facts handed in by the application adapter. Raw EH namespaces win when available. */
    public static final class Comic {
        public final String id, provider;
        public final List<String> facts;
        public final boolean favorite;

        public Comic(String id, String provider, Collection<String> displayTags, Collection<String> rawTags, boolean favorite) {
            this.id = id == null ? "" : id;
            this.provider = provider(id, provider);
            this.favorite = favorite;
            LinkedHashSet<String> raw = new LinkedHashSet<>();
            if ("eh".equals(this.provider) && rawTags != null) {
                for (String value : rawTags) if (value != null && !trim(value).isEmpty()) raw.add(value);
            }
            this.facts = Collections.unmodifiableList(new ArrayList<>(raw.isEmpty() ? displayTags : raw));
        }
    }

    public TagPolicyRules(String mode, Collection<String> selected, Collection<String> disabled, Collection<PrivateTag> privateTags) {
        if (!Arrays.asList("ALL", "SELECTED").contains(mode) || privateTags == null || privateTags.size() > 100) {
            throw new IllegalArgumentException("Unsupported tag policy");
        }
        this.mode = mode;
        this.selected = Collections.unmodifiableSet(new LinkedHashSet<>(normalized(selected, true)));
        this.disabled = Collections.unmodifiableSet(new LinkedHashSet<>(normalized(disabled, true)));
        TreeMap<String, PrivateTag> sorted = new TreeMap<>();
        int bindings = 0;
        for (PrivateTag tag : privateTags) {
            if (tag == null || sorted.put(tag.id, tag) != null) throw new IllegalArgumentException("Duplicate private tag");
            bindings += tag.comicIds.size() + tag.mappings.size();
            if (bindings > 4096) throw new IllegalArgumentException("Too many private-tag bindings");
        }
        this.privateTags = Collections.unmodifiableList(new ArrayList<>(sorted.values()));
        this.byId = Collections.unmodifiableMap(sorted);
    }

    public static TagPolicyRules legacy() { return new TagPolicyRules("ALL", Collections.emptyList(), Collections.emptyList(), Collections.emptyList()); }
    public boolean enabled(String identity) { return "ALL".equals(mode) ? !disabled.contains(identity) : selected.contains(identity); }
    public boolean rawEnabled(String provider, String raw) { return enabled(identity(provider, raw)); }
    public PrivateTag privateTag(String key) {
        String normalized = normalizeKey(key);
        return normalized.startsWith(PRIVATE_PREFIX) ? byId.get(normalized.substring(PRIVATE_PREFIX.length())) : null;
    }
    public boolean matchesPrivate(String key, Comic comic) {
        PrivateTag tag = privateTag(key);
        return tag != null && tag.matches(comic);
    }
    public boolean controlEnabled(String type, String key, Comic comic) {
        if (!"TAG".equals(type) && !"FANDOM".equals(type)) return true;
        String normalized = normalizeKey(key);
        if (normalized.startsWith(PRIVATE_PREFIX)) {
            PrivateTag tag = privateTag(key);
            return tag != null && enabled(identity("private", tag.id));
        }
        if (comic != null) {
            boolean observed = false, active = false;
            for (String raw : comic.facts) {
                if (normalizeKey(raw).equals(normalized) || normalizeKey(semanticValue(comic.provider, raw)).equals(normalized)) {
                    observed = true;
                    active |= rawEnabled(comic.provider, raw);
                }
            }
            return observed ? active : rawEnabled(comic.provider, normalized);
        }
        for (String provider : PROVIDERS) if (rawEnabled(provider, normalized)) return true;
        if ("SELECTED".equals(mode)) for (String identity : selected) {
            if (identity.startsWith("eh|") && normalizeKey(semanticValue("eh", identity.substring(3))).equals(normalized)) return true;
        }
        return false;
    }
    public List<String> tags(Comic comic, boolean includePrivate) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (String raw : comic.facts) {
            if (!normalizeKey(raw).startsWith(PRIVATE_PREFIX) && rawEnabled(comic.provider, raw)) out.add(semanticValue(comic.provider, raw));
        }
        if (includePrivate) for (PrivateTag tag : privateTags) {
            if (enabled(identity("private", tag.id)) && tag.matches(comic)) out.add(PRIVATE_PREFIX + tag.id);
        }
        return new ArrayList<>(out);
    }

    public interface Classifier { String classify(String provider, String raw); }
    public static final class DirectoryRow {
        public final String identity, provider, key, label, facet, kind;
        public final boolean enabled;
        public final Set<String> favoriteIds, catalogIds;
        private DirectoryRow(String identity, String provider, String key, String label, String facet, String kind,
                boolean enabled, Collection<String> favoriteIds, Collection<String> catalogIds) {
            this.identity=identity;this.provider=provider;this.key=key;this.label=label;this.facet=facet;this.kind=kind;this.enabled=enabled;
            this.favoriteIds=Collections.unmodifiableSet(new HashSet<>(favoriteIds));
            this.catalogIds=Collections.unmodifiableSet(new HashSet<>(catalogIds));
        }
    }
    public List<DirectoryRow> directory(Collection<Comic> catalog, Classifier classifier, boolean includePrivate) {
        Map<String, String[]> metadata = new LinkedHashMap<>();
        Map<String, Set<String>> favorites = new HashMap<>(), ids = new HashMap<>();
        for (Comic comic : catalog) for (String raw : comic.facts) {
            String key = normalizeKey(raw);
            if (key.isEmpty()) continue;
            String identity = identity(comic.provider, raw);
            if (!metadata.containsKey(identity)) metadata.put(identity, new String[]{comic.provider, key, raw, classifier.classify(comic.provider, raw)});
            ids.computeIfAbsent(identity, v -> new HashSet<>()).add(comic.id);
            if (comic.favorite) favorites.computeIfAbsent(identity, v -> new HashSet<>()).add(comic.id);
        }
        List<DirectoryRow> rows = new ArrayList<>();
        for (Map.Entry<String, String[]> entry : metadata.entrySet()) {
            String id=entry.getKey();String[] row=entry.getValue();
            rows.add(new DirectoryRow(id,row[0],row[1],row[2],row[3],"PROVIDER_RAW",enabled(id),favorites.getOrDefault(id,Collections.emptySet()),ids.get(id)));
        }
        if (includePrivate) for (PrivateTag tag : privateTags) {
            Set<String> liked = new HashSet<>(), all = new HashSet<>();
            for (Comic comic : catalog) if (tag.matches(comic)) { all.add(comic.id); if (comic.favorite) liked.add(comic.id); }
            String id = identity("private",tag.id);
            rows.add(new DirectoryRow(id,"private",PRIVATE_PREFIX+tag.id,tag.name,"PRIVATE","PRIVATE_"+tag.kind,enabled(id),liked,all));
        }
        rows.sort((a,b)->{int group=a.facet.compareTo(b.facet);if(group!=0)return group;int count=Integer.compare(b.favoriteIds.size(),a.favoriteIds.size());return count!=0?count:a.identity.compareTo(b.identity);});
        return rows;
    }
}
