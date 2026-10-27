package com.picalibrary.android;

import android.util.JsonReader;
import android.util.JsonToken;
import java.io.*;
import java.nio.*;
import java.nio.charset.*;
import java.util.*;
import org.json.JSONObject;

/** Strict, bounded JSON intake before Android's more permissive JSONObject parser. */
final class HostJson {
    private HostJson(){}
    static JSONObject object(byte[] bytes)throws IOException {
        try {
            if(bytes.length>1024*1024)throw new IOException();
            String text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
            try(JsonReader reader=new JsonReader(new StringReader(text))){
                reader.setLenient(false);
                if(reader.peek()!=JsonToken.BEGIN_OBJECT)throw new IOException();
                value(reader,0,new int[]{0});
                if(reader.peek()!=JsonToken.END_DOCUMENT)throw new IOException();
            }
            return new JSONObject(text);
        }catch(Exception invalid){throw new IOException("SOURCE_HOST_PROTOCOL");}
    }
    private static void value(JsonReader reader,int depth,int[] count)throws IOException {
        if(depth>32||++count[0]>100000)throw new IOException();
        switch(reader.peek()){
            case BEGIN_OBJECT:
                reader.beginObject();Set<String> names=new HashSet<>();
                while(reader.hasNext()){if(!names.add(reader.nextName()))throw new IOException();value(reader,depth+1,count);}reader.endObject();return;
            case BEGIN_ARRAY:
                reader.beginArray();while(reader.hasNext())value(reader,depth+1,count);reader.endArray();return;
            case STRING:case NUMBER:reader.nextString();return;
            case BOOLEAN:reader.nextBoolean();return;
            case NULL:reader.nextNull();return;
            default:throw new IOException();
        }
    }
}
