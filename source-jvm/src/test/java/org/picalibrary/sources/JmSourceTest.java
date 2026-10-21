package org.picalibrary.sources;

import static org.junit.Assert.*;
import com.google.gson.Gson;
import io.github.jukomu.jmcomic.api.client.JmClient;
import io.github.jukomu.jmcomic.api.model.*;
import java.lang.reflect.Proxy;
import java.util.*;
import org.junit.Test;

public class JmSourceTest {
    private JmClient client(boolean validIdentity){
        Gson json=new Gson();
        return (JmClient)Proxy.newProxyInstance(JmClient.class.getClassLoader(),new Class[]{JmClient.class},(proxy,method,args)->{
            switch(method.getName()){
                case "login": return json.fromJson(validIdentity?"{\"uid\":\"fixture-id\",\"username\":\"fixture-user\",\"email\":\"private@example.invalid\"}":"{\"username\":\"unverified\"}",JmUserInfo.class);
                case "getFavorites": return new JmFavoritePage("All",0,((FavoriteQuery)args[0]).getPage(),1,1,Collections.singletonList(new JmAlbumMeta("123","Fixture work",Collections.singletonList("Writer"),Collections.emptyList())),Collections.singletonMap("0","All"));
                case "getAlbum": return json.fromJson("{\"id\":\"123\",\"title\":\"Fixture work\",\"tags\":[\"story\"],\"authors\":[\"Writer\"],\"pageCount\":2,\"photoMetas\":[{\"id\":\"456\",\"title\":\"Chapter\",\"sortOrder\":1}]}",JmAlbum.class);
                case "getPhoto": return new JmPhoto("456","Chapter","123","0",1,"Writer",Collections.emptyList(),Collections.singletonList(new JmImage("456","0","one.jpg","https://example.invalid/one.jpg","",1)),false);
                case "fetchImageBytes": return new byte[]{1,2,3,4};
                default: throw new UnsupportedOperationException(method.getName());
            }
        });
    }
    @Test public void requiresVerifiedIdentityForPrivateFavorites() throws Exception {
        try(JmSource source=new JmSource(client(true))){
            try{source.favorites(0,1);fail();}catch(IllegalStateException expected){}
            Map<String,Object> identity=source.login("fixture-user","not-a-real-secret");
            assertEquals("fixture-id",identity.get("accountId"));assertFalse(identity.containsKey("email"));assertFalse(identity.containsKey("password"));
            assertEquals(1,source.favorites(0,1).get("total"));
        }
    }
    @Test public void rejectsPartialHtmlIdentityInsteadOfTrustingEnteredUsername() throws Exception {
        try(JmSource source=new JmSource(client(false))){try{source.login("unverified","fixture");fail();}catch(IllegalStateException expected){}assertEquals(false,source.status().get("configured"));}
    }
    @Test public void mapsChaptersAndKeepsImagesRestrictedToSdkIssuedLocators() throws Exception {
        try(JmSource source=new JmSource(client(true))){
            assertEquals("jm:123",source.details("jm:123").get("comicId"));assertEquals("jm-chapter:456",source.episodes("jm:123").get(0).get("id"));
            String locator=(String)source.pages("jm-chapter:456").get(0).get("url");assertEquals("jm-page:456:1",locator);
            assertArrayEquals(new byte[]{1,2,3,4},source.image(locator,100));
            try{source.image("https://example.invalid/arbitrary",100);fail();}catch(IllegalStateException expected){}
            try{source.image(locator,2);fail();}catch(IllegalStateException expected){}
        }
    }
    @Test public void rejectsWrongNamespacesAndKeepsUnknownCompletionUnknown() throws Exception {
        try(JmSource source=new JmSource(client(true))){
            try{source.details("pica:123");fail();}catch(IllegalArgumentException expected){}
            assertEquals("UNKNOWN",source.details("jm:123").get("completionStatus"));
            assertEquals(false,source.status().get("configured"));
        }
    }
}
