package com.picalibrary.android;

import com.picalibrary.android.tags.TagPolicyRules;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

/** Existing org.json codec and wire-size limit. Pure rules do not depend on Android's JSON classes. */
final class TagPolicyJson {
    private TagPolicyJson() {}

    private static String text(JSONObject object, String key) {
        Object value=object.opt(key);
        if (!(value instanceof String)) throw new IllegalArgumentException("Invalid tag-policy text: "+key);
        return (String)value;
    }
    private static List<String> strings(JSONObject object, String key) {
        JSONArray values=object.optJSONArray(key);
        if(values==null||values.length()>4096)throw new IllegalArgumentException("Invalid or oversized tag-policy list");
        List<String> out=new ArrayList<>();
        for(int i=0;i<values.length();i++){Object value=values.opt(i);if(!(value instanceof String))throw new IllegalArgumentException("Invalid tag-policy string");out.add((String)value);}
        return out;
    }
    static TagPolicyRules read(JSONObject value) {
        if(value==null)return TagPolicyRules.legacy();
        if(!(value.opt("schemaVersion") instanceof Number)||value.optDouble("schemaVersion",0)!=1d)throw new IllegalArgumentException("Unsupported tag policy");
        JSONArray tags=value.optJSONArray("privateTags");
        if(tags==null||tags.length()>100)throw new IllegalArgumentException("Invalid private tags");
        List<TagPolicyRules.PrivateTag> parsed=new ArrayList<>();
        for(int i=0;i<tags.length();i++){
            JSONObject tag=tags.optJSONObject(i);if(tag==null)throw new IllegalArgumentException("Invalid private tag");
            parsed.add(new TagPolicyRules.PrivateTag(text(tag,"id"),text(tag,"name"),text(tag,"kind"),strings(tag,"comicIds"),strings(tag,"mappings")));
        }
        TagPolicyRules rules=new TagPolicyRules(text(value,"mode"),strings(value,"selected"),strings(value,"disabled"),parsed);
        if(write(rules).toString().getBytes(StandardCharsets.UTF_8).length>128*1024)throw new IllegalArgumentException("Tag policy exceeds 128 KiB");
        return rules;
    }
    static JSONObject write(TagPolicyRules rules) {
        try{
            JSONArray tags=new JSONArray();
            for(TagPolicyRules.PrivateTag tag:rules.privateTags)tags.put(new JSONObject().put("id",tag.id).put("name",tag.name).put("kind",tag.kind)
                    .put("comicIds",new JSONArray(tag.comicIds)).put("mappings",new JSONArray(tag.mappings)));
            return new JSONObject().put("schemaVersion",1).put("mode",rules.mode).put("selected",new JSONArray(rules.selected))
                    .put("disabled",new JSONArray(rules.disabled)).put("privateTags",tags);
        }catch(JSONException error){throw new IllegalArgumentException("Invalid tag policy",error);}
    }
}
