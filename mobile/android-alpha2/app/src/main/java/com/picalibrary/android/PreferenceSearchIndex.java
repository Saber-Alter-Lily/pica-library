package com.picalibrary.android;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Presentation-only OpenCC matching. Never use folded text as a policy/provider identity. */
final class PreferenceSearchIndex {
    private static final class Node { final Map<Integer,Node> children=new HashMap<>();String value; }
    private final Node root=new Node();
    private final MobileTagRegistry registry;
    private final Map<String,String> searchable=new HashMap<>();

    PreferenceSearchIndex(JSONArray mappings,MobileTagRegistry registry){
        this.registry=registry;
        for(int i=0;i<mappings.length();i++){
            JSONArray row=mappings.optJSONArray(i);if(row==null||row.length()<2)continue;
            String from=row.optString(0),to=row.optString(1);Node node=root;
            for(int at=0;at<from.length();){int cp=from.codePointAt(at);node=node.children.computeIfAbsent(cp,ignored->new Node());at+=Character.charCount(cp);}
            node.value=to;
        }
    }

    static PreferenceSearchIndex load(Context context) throws Exception {
        try(InputStream in=context.getAssets().open("preference-search/t2cn.json");ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int count;while((count=in.read(buffer))!=-1)out.write(buffer,0,count);
            JSONObject data=new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));
            return new PreferenceSearchIndex(data.getJSONArray("mappings"),MobileTagRegistry.load(context));
        }
    }

    String fold(String value){
        String text=MobileTagRegistry.normalize(value);StringBuilder out=new StringBuilder();
        for(int start=0;start<text.length();){Node node=root;String replacement=null;int end=start;
            for(int at=start;at<text.length();){int cp=text.codePointAt(at);node=node.children.get(cp);if(node==null)break;at+=Character.charCount(cp);if(node.value!=null){replacement=node.value;end=at;}}
            if(replacement!=null){out.append(replacement);start=end;}else{int cp=text.codePointAt(start);out.appendCodePoint(cp);start+=Character.charCount(cp);}
        }
        return out.toString();
    }

    boolean matches(JSONObject row,String query){
        String q=fold(query);if(q.isEmpty())return true;
        String key=row.optString("key"),label=row.optString("label",key),type=row.optString("targetType");
        String identity=type+":"+key+":"+label+":"+row.optString("facet");
        String tokens=searchable.get(identity);
        if(tokens==null){
            StringBuilder values=new StringBuilder(fold(key+" "+label+" "+type+" "+row.optString("facet")));
            if(registry!=null&&("TAG".equals(type)||"FANDOM".equals(type)))for(String alias:registry.presentationAliases(key))values.append('\n').append(fold(alias));
            tokens=values.toString();searchable.put(identity,tokens);
        }
        return tokens.contains(q);
    }
}
