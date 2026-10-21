package org.picalibrary.sources;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

/** Private child-process protocol. Passwords travel on stdin, never argv, files or diagnostics. */
public final class JmProtocolMain {
    public static void main(String[] args) throws Exception {
        Gson json=new Gson();JmSource source=new JmSource();
        Runtime.getRuntime().addShutdownHook(new Thread(source::close));
        try(BufferedReader input=new BufferedReader(new InputStreamReader(System.in,StandardCharsets.UTF_8));PrintWriter output=new PrintWriter(new OutputStreamWriter(System.out,StandardCharsets.UTF_8),true)){
            String line;while((line=input.readLine())!=null){
                JsonObject request=null;Map<String,Object> response;
                try{
                    if(line.length()>65536)throw new IllegalArgumentException("请求过大");
                    request=json.fromJson(line,JsonObject.class);String op=request.get("op").getAsString();Object value;
                    switch(op){
                        case "status":value=source.status();break;
                        case "configure":source.configureProxy(request.has("proxyHost")?request.get("proxyHost").getAsString():"",number(request,"proxyPort",0));value=source.status();break;
                        case "login":value=source.login(request.get("username").getAsString(),request.get("password").getAsString());break;
                        case "logout":source.close();value=source.status();break;
                        case "favorites":value=source.favorites(number(request,"folderId",0),number(request,"page",1));break;
                        case "search":value=source.search(request.has("keyword")?request.get("keyword").getAsString():"",number(request,"page",1));break;
                        case "details":value=source.details(request.get("comicId").getAsString());break;
                        case "episodes":value=source.episodes(request.get("comicId").getAsString());break;
                        case "pages":value=source.pages(request.get("episodeId").getAsString());break;
                        case "image":byte[] bytes=source.image(request.get("locator").getAsString(),number(request,"maxBytes",20*1024*1024));value=JmSource.map("base64",Base64.getEncoder().encodeToString(bytes),"contentType",JmSource.imageContentType(bytes));break;
                        default:throw new IllegalArgumentException("不支持的来源操作");
                    }
                    response=JmSource.map("id",request.get("id").getAsString(),"ok",true,"value",value);
                }catch(Exception error){
                    // Upstream exceptions can contain URLs or request data. Return a stable, secret-free error.
                    response=JmSource.map("id",request!=null&&request.has("id")?request.get("id").getAsString():"","ok",false,"error","JM 操作未完成，请检查登录状态、网络或重试");
                }
                output.println(json.toJson(response));
            }
        }finally{source.close();}
    }
    private static int number(JsonObject value,String key,int fallback){return value.has(key)?value.get(key).getAsInt():fallback;}
}
