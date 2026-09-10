package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

/** Small authenticated LAN transport for binary supporter/theme payloads. */
final class BridgeBinaryClient {
    private BridgeBinaryClient(){}
    static byte[] get(Context c,String path,int maxBytes) throws Exception {String host=BridgeStore.host(c);if(host.isEmpty())throw new IllegalStateException("尚未配对 Desktop");HttpURLConnection con=(HttpURLConnection)new URL(host.replaceAll("/$","")+path).openConnection();con.setConnectTimeout(2500);con.setReadTimeout(20000);con.setRequestMethod("GET");con.setRequestProperty("Authorization","Bearer "+BridgeStore.token(c));con.setUseCaches(false);try{int status=con.getResponseCode();InputStream in=status>=400?con.getErrorStream():con.getInputStream();if(status>=400){String message=in==null?"":new String(readLimited(in,64*1024),StandardCharsets.UTF_8);throw new IllegalStateException("HTTP "+status+(message.isEmpty()?"":": "+message));}return readLimited(in,maxBytes);}finally{con.disconnect();}}
    static String text(Context c,String path,int maxBytes) throws Exception {return new String(get(c,path,maxBytes),StandardCharsets.UTF_8);}
    private static byte[] readLimited(InputStream in,int maxBytes) throws Exception {if(in==null)throw new IOException("响应为空");try(InputStream input=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int total=0,n;while((n=input.read(b))>0){total+=n;if(total>maxBytes)throw new IOException("响应过大");out.write(b,0,n);}return out.toByteArray();}}
}
