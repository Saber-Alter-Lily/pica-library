package com.picalibrary.android;

import android.content.Context;
import com.picalibrary.android.sources.SourceAccessPolicy;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Fixed same-Host operations over the existing guarded HttpURLConnection, never a URL proxy. */
final class HostHttp {
    interface Factory {HttpURLConnection open(URL url)throws Exception;}
    private final Factory factory;
    private final JSONObject operations;
    private final Semaphore slots=new Semaphore(4,true);
    static HostHttp create(Context context)throws Exception {try(InputStream in=context.getResources().openRawResource(R.raw.host_source_operations)){return new HostHttp(url->(HttpURLConnection)url.openConnection(),HostJson.object(read(in,32768)));}}
    HostHttp(Factory factory,JSONObject operations)throws Exception {
        this.factory=factory;this.operations=new JSONObject(operations.toString());
        if(operations.length()!=10||operations.getInt("schemaVersion")!=1||!"40bc5da57820324ed0ae724cbbc020cc4673b594".equals(operations.getString("upstreamCommit")))throw failure("SOURCE_HOST_PROTOCOL");
        for(String name:Arrays.asList("info","sources","library","manga","chapter","pages","search","prepare")){JSONObject op=operations.getJSONObject(name);if(op.length()!=2||!op.getString("operationName").matches("Pica(?:SourceHost|Host)[A-Za-z]+")||op.getString("query").length()>2048)throw failure("SOURCE_HOST_PROTOCOL");}
    }
    JSONObject json(HostEndpoint endpoint,String auth,String operation,JSONObject variables,SourceAccessPolicy.Access access)throws Exception {
        if(!Arrays.asList("info","sources","library","manga","chapter","pages","search","prepare").contains(operation))throw failure("INVALID_SOURCE_HOST");
        JSONObject op=operations.getJSONObject(operation);byte[] body=new JSONObject().put("operationName",op.getString("operationName")).put("query",op.getString("query")).put("variables",variables).toString().getBytes(StandardCharsets.UTF_8);
        access.check();if(!slots.tryAcquire(15,TimeUnit.SECONDS))throw failure("SOURCE_HOST_BUSY");
        HttpURLConnection connection=null;
        try{access.check();connection=open(endpoint,"api/graphql",auth,access);connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Accept","application/json");connection.setRequestProperty("Content-Type","application/json; charset=utf-8");connection.setFixedLengthStreamingMode(body.length);try(OutputStream out=connection.getOutputStream()){out.write(body);}status(connection);String type=connection.getContentType();if(type==null||!type.toLowerCase(Locale.ROOT).matches("application/json(?:\\s*;.*)?"))throw failure("SOURCE_HOST_PROTOCOL");byte[] response;try(InputStream in=connection.getInputStream()){response=read(in,1024*1024);}access.check();return HostJson.object(response);}
        catch(InterruptedException error){Thread.currentThread().interrupt();throw failure("SOURCE_HOST_CANCELLED");}
        catch(Exception error){throw safe(error);}
        finally{if(connection!=null)connection.disconnect();slots.release();}
    }
    HttpURLConnection image(HostEndpoint endpoint,String auth,String route,SourceAccessPolicy.Access access)throws Exception {
        access.check();if(!slots.tryAcquire(15,TimeUnit.SECONDS))throw failure("SOURCE_HOST_BUSY");
        final HttpURLConnection delegate;
        try{delegate=open(endpoint,route,auth,access);delegate.setRequestProperty("Accept","image/png,image/jpeg,image/gif,image/webp");}
        catch(Exception error){slots.release();throw error;}
        return new HttpURLConnection(delegate.getURL()) {
            private boolean checked,closed;private String type;
            private void validate()throws IOException {try{if(checked)return;status(delegate);String header=delegate.getContentType();type=header==null?"":header.split(";",2)[0].trim().toLowerCase(Locale.ROOT);if(!Arrays.asList("image/png","image/jpeg","image/gif","image/webp").contains(type))throw failure("SOURCE_HOST_PROTOCOL");checked=true;}catch(Exception error){throw safe(error);}}
            public synchronized void disconnect(){try{delegate.disconnect();}finally{if(!closed){closed=true;slots.release();}}}public boolean usingProxy(){return delegate.usingProxy();}public void connect()throws IOException {getResponseCode();}
            public int getResponseCode()throws IOException {validate();return 200;}public String getContentType(){try{validate();return type;}catch(IOException error){return "";}}
            public InputStream getInputStream()throws IOException {
                validate();InputStream raw;try{raw=delegate.getInputStream();}catch(Exception error){throw safe(error);}PushbackInputStream in=new PushbackInputStream(raw,24);byte[] header=new byte[24];int count=0,n;
                try{while(count<header.length&&(n=in.read(header,count,header.length-count))!=-1)count+=n;if(!raster(header,count,type))throw failure("SOURCE_HOST_PROTOCOL");in.unread(header,0,count);}
                catch(Exception error){try{in.close();}catch(IOException ignored){}throw safe(error);}
                return new FilterInputStream(in){long total,started=System.nanoTime();private void add(long n)throws IOException {access.check();if(n>0&&(total+=n)>20L*1024*1024)throw failure("SOURCE_HOST_TOO_LARGE");if(System.nanoTime()-started>TimeUnit.SECONDS.toNanos(15))throw failure("SOURCE_HOST_TIMEOUT");}
                    public int read()throws IOException{try{int n=in.read();add(n<0?0:1);return n;}catch(Exception error){throw safe(error);}}public int read(byte[] b,int off,int len)throws IOException{try{int n=in.read(b,off,len);add(n);return n;}catch(Exception error){throw safe(error);}}public long skip(long n)throws IOException{try{long count=in.skip(n);add(count);return count;}catch(Exception error){throw safe(error);}}};
            }
        };
    }
    private HttpURLConnection open(HostEndpoint endpoint,String route,String auth,SourceAccessPolicy.Access access)throws Exception {
        access.check();if(Thread.currentThread().isInterrupted())throw failure("SOURCE_HOST_CANCELLED");
        // Do not change process-wide handlers or replay another provider's ambient credentials.
        if(CookieHandler.getDefault()!=null||Authenticator.getDefault()!=null)throw failure("SOURCE_HOST_UNSUPPORTED");
        HttpURLConnection connection=factory.open(endpoint.request(route));
        try{connection=SourceHttpConnection.guard(connection,access);connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);connection.setConnectTimeout(4000);connection.setReadTimeout(12000);connection.setRequestProperty("Cache-Control","no-store");if(auth!=null&&!auth.isEmpty())connection.setRequestProperty("Authorization",auth);return connection;}
        catch(Exception failure){connection.disconnect();throw failure;}
    }
    private static void status(HttpURLConnection connection)throws IOException {int code=connection.getResponseCode();if(code==401)throw failure("SOURCE_HOST_AUTH_REQUIRED");if(code>=300&&code<400)throw failure("SOURCE_HOST_REDIRECT");if(code==429)throw failure("SOURCE_HOST_BUSY");if(code!=200)throw failure("SOURCE_HOST_UNAVAILABLE");}
    static byte[] read(InputStream in,int max)throws IOException {try(ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[16384];int n;long started=System.nanoTime();while((n=in.read(b))!=-1){if(Thread.currentThread().isInterrupted())throw failure("SOURCE_HOST_CANCELLED");if(out.size()+n>max)throw failure("SOURCE_HOST_TOO_LARGE");if(System.nanoTime()-started>TimeUnit.SECONDS.toNanos(15))throw failure("SOURCE_HOST_TIMEOUT");out.write(b,0,n);}return out.toByteArray();}}
    private static boolean raster(byte[] b,int n,String type){if("image/png".equals(type))return n>=24&&Arrays.equals(Arrays.copyOf(b,8),new byte[]{(byte)137,80,78,71,13,10,26,10});if("image/jpeg".equals(type))return n>=4&&(b[0]&255)==255&&(b[1]&255)==216&&(b[2]&255)==255;if("image/gif".equals(type))return n>=6&&new String(b,0,6,StandardCharsets.US_ASCII).matches("GIF8[79]a");return n>=16&&"RIFF".equals(new String(b,0,4,StandardCharsets.US_ASCII))&&"WEBP".equals(new String(b,8,4,StandardCharsets.US_ASCII));}
    static IOException failure(String code){return new IOException(code);}
    private static IOException safe(Exception error){String code=error.getMessage();return failure(code!=null&&code.matches("(?:INVALID_SOURCE_HOST|SOURCE_HOST_[A-Z_]+)")?code:"SOURCE_HOST_UNAVAILABLE");}
}
