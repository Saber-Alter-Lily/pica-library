package com.picalibrary.android;

import com.picalibrary.android.sources.SourceAccessPolicy;
import java.io.*;
import java.net.*;
import java.util.*;

/** Decorates existing transports, preserving redirects/cookies/timeouts; no second HTTP stack. */
final class SourceHttpConnection extends HttpURLConnection {
    private final HttpURLConnection delegate;
    private final SourceAccessPolicy.Permit permit;
    private final SourceAccessPolicy.Registration registration;
    private volatile boolean closed;
    static HttpURLConnection guard(HttpURLConnection connection,SourceAccessPolicy.Permit permit){
        try{return new SourceHttpConnection(connection,permit);}catch(RuntimeException error){connection.disconnect();throw error;}
    }
    private SourceHttpConnection(HttpURLConnection delegate,SourceAccessPolicy.Permit permit){
        super(delegate.getURL());this.delegate=delegate;this.permit=permit;permit.check();
        registration=permit.onCancel(delegate::disconnect);
    }
    private void check(){permit.check();if(closed)throw new IllegalStateException("Connection is closed");}
    @Override public void disconnect(){closed=true;registration.close();delegate.disconnect();}
    @Override public boolean usingProxy(){return delegate.usingProxy();}
    @Override public void connect() throws IOException {check();try{delegate.connect();}finally{permit.check();}}
    @Override public int getResponseCode() throws IOException {check();try{return delegate.getResponseCode();}finally{permit.check();}}
    @Override public String getResponseMessage() throws IOException {check();try{return delegate.getResponseMessage();}finally{permit.check();}}
    private InputStream input(InputStream stream){if(stream==null)return null;return new FilterInputStream(stream){
        @Override public int read() throws IOException {check();try{return in.read();}finally{permit.check();}}
        @Override public int read(byte[] b,int off,int len) throws IOException {check();try{return in.read(b,off,len);}finally{permit.check();}}
        @Override public long skip(long n) throws IOException {check();try{return in.skip(n);}finally{permit.check();}}
    };}
    @Override public InputStream getInputStream() throws IOException {check();try{return input(delegate.getInputStream());}finally{permit.check();}}
    @Override public InputStream getErrorStream(){check();InputStream stream=delegate.getErrorStream();permit.check();return input(stream);}
    @Override public OutputStream getOutputStream() throws IOException {check();OutputStream stream=delegate.getOutputStream();permit.check();return new FilterOutputStream(stream){
        @Override public void write(int b) throws IOException {check();try{out.write(b);}finally{permit.check();}}
        @Override public void write(byte[] b,int off,int len) throws IOException {check();try{out.write(b,off,len);}finally{permit.check();}}
    };}
    @Override public URL getURL(){return delegate.getURL();}
    @Override public String getHeaderField(String name){check();String value=delegate.getHeaderField(name);permit.check();return value;}
    @Override public String getHeaderField(int index){check();String value=delegate.getHeaderField(index);permit.check();return value;}
    @Override public String getHeaderFieldKey(int index){check();return delegate.getHeaderFieldKey(index);}
    @Override public Map<String,List<String>> getHeaderFields(){check();Map<String,List<String>> value=delegate.getHeaderFields();permit.check();return value;}
    @Override public String getContentType(){return getHeaderField("Content-Type");}
    @Override public int getContentLength(){check();int result=delegate.getContentLength();permit.check();return result;}
    @Override public long getContentLengthLong(){check();long result=delegate.getContentLengthLong();permit.check();return result;}
    @Override public void setRequestMethod(String value) throws ProtocolException {delegate.setRequestMethod(value);}
    @Override public String getRequestMethod(){return delegate.getRequestMethod();}
    @Override public void setRequestProperty(String key,String value){delegate.setRequestProperty(key,value);}
    @Override public void addRequestProperty(String key,String value){delegate.addRequestProperty(key,value);}
    @Override public String getRequestProperty(String key){return delegate.getRequestProperty(key);}
    @Override public Map<String,List<String>> getRequestProperties(){return delegate.getRequestProperties();}
    @Override public void setConnectTimeout(int value){delegate.setConnectTimeout(value);}
    @Override public int getConnectTimeout(){return delegate.getConnectTimeout();}
    @Override public void setReadTimeout(int value){delegate.setReadTimeout(value);}
    @Override public int getReadTimeout(){return delegate.getReadTimeout();}
    @Override public void setDoInput(boolean value){delegate.setDoInput(value);}
    @Override public boolean getDoInput(){return delegate.getDoInput();}
    @Override public void setDoOutput(boolean value){delegate.setDoOutput(value);}
    @Override public boolean getDoOutput(){return delegate.getDoOutput();}
    @Override public void setUseCaches(boolean value){delegate.setUseCaches(value);}
    @Override public boolean getUseCaches(){return delegate.getUseCaches();}
    @Override public void setInstanceFollowRedirects(boolean value){delegate.setInstanceFollowRedirects(value);}
    @Override public boolean getInstanceFollowRedirects(){return delegate.getInstanceFollowRedirects();}
    @Override public void setFixedLengthStreamingMode(int value){delegate.setFixedLengthStreamingMode(value);}
    @Override public void setFixedLengthStreamingMode(long value){delegate.setFixedLengthStreamingMode(value);}
    @Override public void setChunkedStreamingMode(int value){delegate.setChunkedStreamingMode(value);}
}
