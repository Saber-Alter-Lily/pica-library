package com.picalibrary.android;

import java.net.URI;
import java.net.URL;
import java.util.Locale;

/** User-entered endpoint policy only. No DNS, discovery, cookies, account or network access. */
final class HostEndpoint {
    final String value;
    final boolean encrypted,loopback;
    private final URI base;
    HostEndpoint(String input,boolean allowInsecureLan,String authMode) {
        try {
            if(input==null||input.isEmpty()||input.length()>2048||!input.equals(input.trim())||input.matches(".*[\\\\\\s@?#%\\x00-\\x1f\\x7f].*"))throw invalid();
            URI uri=new URI(input);String scheme=uri.getScheme(),host=uri.getHost(),raw=uri.getRawPath();
            if(host==null||!("https".equals(scheme)||"http".equals(scheme))||uri.getRawUserInfo()!=null||uri.getRawQuery()!=null||uri.getRawFragment()!=null||uri.getPort()==0||uri.getPort()>65535)throw invalid();
            host=host.toLowerCase(Locale.ROOT);if(raw==null||raw.isEmpty())raw="/";
            if(!raw.matches("/(?:[a-zA-Z0-9._~-]+/)*[a-zA-Z0-9._~-]*"))throw invalid();
            for(String part:raw.split("/"))if(".".equals(part)||"..".equals(part))throw invalid();
            String bare=host.replace("[","").replace("]","");int[] ip=null;
            if(bare.matches("[0-9.]+")){
                String[] octets=bare.split("\\.",-1);if(octets.length!=4)throw invalid();ip=new int[4];
                for(int i=0;i<4;i++){if(!octets[i].matches("0|[1-9][0-9]{0,2}"))throw invalid();ip[i]=Integer.parseInt(octets[i]);if(ip[i]>255)throw invalid();}
            }
            if(ip!=null&&(ip[0]==0||ip[0]>=224||ip[0]==169&&ip[1]==254)||bare.contains(":")&&(bare.matches("(?i)(fe[89ab]|ff|::ffff:).*" )||"::".equals(bare)))throw invalid();
            loopback="localhost".equals(bare)||"::1".equals(bare)||ip!=null&&ip[0]==127;
            boolean lan=ip!=null&&(ip[0]==10||ip[0]==172&&ip[1]>=16&&ip[1]<=31||ip[0]==192&&ip[1]==168);
            encrypted="https".equals(scheme);
            if(!encrypted&&!loopback&&!(lan&&allowInsecureLan))throw new IllegalArgumentException("SOURCE_HOST_INSECURE");
            if(!("none".equals(authMode)||"basic".equals(authMode)))throw invalid();
            if("basic".equals(authMode)&&!encrypted&&!loopback)throw new IllegalArgumentException("SOURCE_HOST_INSECURE");
            raw=raw.replaceAll("/$","")+"/";base=new URI(scheme,null,bare,uri.getPort(),raw,null,null);value=base.toASCIIString();
        }catch(IllegalArgumentException error){throw error;}catch(Exception error){throw invalid();}
    }
    URL request(String route) {
        if(!"api/graphql".equals(route)&&!route.matches("api/v1/manga/[1-9][0-9]{0,9}/chapter/(?:0|[1-9][0-9]{0,9})/page/(?:0|[1-9][0-9]{0,3})"))throw invalid();
        try{return base.resolve(route).toURL();}catch(Exception error){throw invalid();}
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("INVALID_SOURCE_HOST");}
}
