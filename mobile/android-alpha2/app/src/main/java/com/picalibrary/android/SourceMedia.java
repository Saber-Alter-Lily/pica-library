package com.picalibrary.android;

import com.picalibrary.android.sources.SourceAccessPolicy;
import java.net.HttpURLConnection;
import java.net.URL;

/** Public provider cover URLs, without borrowing another provider's account or permission. */
final class SourceMedia {
    private SourceMedia(){}
    static HttpURLConnection thumbnail(String address,SourceAccessPolicy.Permit permit) throws Exception {
        permit.check();URL url=EhHttpSession.safePublicHttps(address);
        HttpURLConnection connection=(HttpURLConnection)url.openConnection();
        connection.setConnectTimeout(6000);connection.setReadTimeout(20000);
        connection.setRequestProperty("Accept","image/*");connection.setRequestProperty("User-Agent","Pica-Library-Android/0.1");
        connection.setUseCaches(false);connection.setInstanceFollowRedirects(true);
        return SourceHttpConnection.guard(connection,permit);
    }
}
