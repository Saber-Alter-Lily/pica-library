package com.picalibrary.android;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** In-memory edits. Only an explicit Save passes these mutations to the policy store. */
final class PreferenceDraft {
    private final Map<String, JSONObject> changes = new LinkedHashMap<>();

    private static String id(String type, String key) {
        return type + ":" + (key == null ? "" : java.text.Normalizer.normalize(key, java.text.Normalizer.Form.NFKC).trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " "));
    }

    int size() { return changes.size(); }
    boolean isEmpty() { return changes.isEmpty(); }
    void clear() { changes.clear(); }

    void restore(JSONArray saved) {
        if (saved == null) return;
        for (int i = 0; i < saved.length(); i++) {
            JSONObject row = saved.optJSONObject(i);
            if (row != null) changes.put(id(row.optString("targetType"), row.optString("key")), row);
        }
    }

    JSONObject effective(String type, String key, JSONObject persisted) {
        JSONObject change = changes.get(id(type, key));
        if (change == null) return persisted;
        return "DEFAULT".equals(change.optString("direction")) ? null : change;
    }

    void stage(String type, String key, String label, String direction, Integer delta, JSONObject persisted) {
        JSONObject value = new JSONObject();
        try {
            value.put("targetType", type);
            value.put("key", key);
            value.put("label", label);
            value.put("direction", direction);
            value.put("scope", "PERSISTENT");
            if (delta != null && !"BLOCK".equals(direction)) value.put("levelDelta", delta);
        } catch (Exception error) { throw new IllegalArgumentException("无效的偏好调整", error); }
        boolean same = persisted == null ? "DEFAULT".equals(direction)
                : direction.equals(persisted.optString("direction"))
                  && value.has("levelDelta") == persisted.has("levelDelta")
                  && (!value.has("levelDelta") || value.optInt("levelDelta") == persisted.optInt("levelDelta"));
        if (same) changes.remove(id(type, key));
        else changes.put(id(type, key), value);
    }

    JSONArray mutations() {
        JSONArray out = new JSONArray();
        for (JSONObject value : changes.values()) {
            try { out.put(new JSONObject(value.toString())); }
            catch (Exception error) { throw new IllegalStateException(error); }
        }
        return out;
    }
}
