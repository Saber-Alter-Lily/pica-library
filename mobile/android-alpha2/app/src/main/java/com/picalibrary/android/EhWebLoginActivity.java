package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import javax.net.ssl.SSLException;

/** Official E-H web login in an app-owned WebView; credentials stay on the official site. */
public final class EhWebLoginActivity extends LocaleAwareActivity {
    private static final String LOGIN_URL="https://forums.e-hentai.org/index.php?act=Login";
    private static final String FORUMS_URL="https://forums.e-hentai.org/",EH_URL="https://e-hentai.org/",EXH_URL="https://exhentai.org/";
    private WebView web;private TextView status;private ProgressBar loading;private boolean verifying,destroyed;private String lastSignature="";

    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);render();configure();if(saved==null)web.loadUrl(LOGIN_URL);}

    private void render(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"E-H 网页登录",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));bar.addView(Ui.button(this,"重试",v->capture(true),true));root.addView(bar);
        status=Ui.text(this,"请在官网完成登录",13,Ui.MUTED,false);status.setPadding(Ui.dp(this,14),Ui.dp(this,4),Ui.dp(this,14),Ui.dp(this,6));root.addView(status);
        loading=new ProgressBar(this);loading.setVisibility(View.GONE);root.addView(loading,new LinearLayout.LayoutParams(-1,Ui.dp(this,3)));
        web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();
    }

    private void configure(){
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager cookies=CookieManager.getInstance();cookies.setAcceptCookie(true);cookies.setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){Uri uri=request.getUrl();if(allowed(uri)){return false;}try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}return true;}
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap favicon){loading.setVisibility(View.VISIBLE);}
            @Override public void onPageFinished(WebView view,String url){loading.setVisibility(View.GONE);capture(false);}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())showStatus("页面加载失败，请检查网络后重试",Ui.BAD);}
        });
    }

    private static boolean allowed(Uri uri){if(uri==null||!"https".equalsIgnoreCase(uri.getScheme()))return false;String host=uri.getHost()==null?"":uri.getHost().toLowerCase(Locale.ROOT);return host.equals("e-hentai.org")||host.endsWith(".e-hentai.org")||host.equals("exhentai.org")||host.endsWith(".exhentai.org");}

    private void capture(boolean force){
        if(verifying||destroyed)return;CookieManager manager=CookieManager.getInstance();String forumRaw=clean(manager.getCookie(FORUMS_URL)),ehRaw=clean(manager.getCookie(EH_URL)),exhRaw=clean(manager.getCookie(EXH_URL));Map<String,String> jar=new LinkedHashMap<>();mergeCookies(jar,forumRaw);mergeCookies(jar,ehRaw);mergeCookies(jar,exhRaw);String member=clean(jar.get("ipb_member_id")),hash=clean(jar.get("ipb_pass_hash"));if(member.isEmpty()||hash.isEmpty()){if(force)showStatus("尚未检测到登录会话",Ui.BAD);return;}String signature=member+"|"+hash+"|"+clean(jar.get("igneous"))+"|"+clean(jar.get("cf_clearance"))+"|"+forumRaw.hashCode()+"|"+ehRaw.hashCode()+"|"+exhRaw.hashCode();if(!force&&signature.equals(lastSignature))return;lastSignature=signature;EhAccountStore.Session old=EhAccountStore.load(this);boolean sameAccount=member.equals(old.memberId);String ign=clean(jar.get("igneous"));if(ign.isEmpty()&&sameAccount)ign=old.igneous;String cf=clean(jar.get("cf_clearance"));if(cf.isEmpty()&&sameAccount)cf=old.cfClearance;EhAccountStore.Session next=new EhAccountStore.Session(member,hash,ign,cf);verify(old,next,forumRaw,ehRaw,exhRaw);
    }

    private void verify(EhAccountStore.Session old,EhAccountStore.Session next,String forumRaw,String ehRaw,String exhRaw){
        final String oldForums=EhAccountStore.cookieJar(this,"forums.e-hentai.org"),oldEh=EhAccountStore.cookieJar(this,"e-hentai.org"),oldExh=EhAccountStore.cookieJar(this,"exhentai.org");
        verifying=true;showStatus("正在连接…",Ui.MUTED);new Thread(()->{try{EhAccountStore.save(this,next);EhAccountStore.saveCookieJars(this,forumRaw,ehRaw,exhRaw);new EhClient(this).verifyAccount();runOnUiThread(()->{if(destroyed)return;verifying=false;Toast.makeText(this,"E-H 账号已登录",Toast.LENGTH_SHORT).show();setResult(RESULT_OK);finish();});}catch(Exception e){try{if(old.configured())EhAccountStore.save(this,old);else EhAccountStore.clear(this);if(old.configured())EhAccountStore.saveCookieJars(this,oldForums,oldEh,oldExh);}catch(Exception ignored){}runOnUiThread(()->{if(destroyed)return;verifying=false;showStatus(errorMessage(e),Ui.BAD);});}}).start();
    }

    private static void mergeCookies(Map<String,String> out,String raw){if(raw==null||raw.isEmpty())return;for(String part:raw.split(";")){String item=part.trim();int at=item.indexOf('=');if(at<=0)continue;String name=item.substring(0,at).trim(),value=item.substring(at+1).trim();if(!name.isEmpty()&&!value.isEmpty())out.put(name,value);}}
    private static String clean(String value){return value==null?"":value.trim();}
    private String errorMessage(Exception e){String message=e.getMessage()==null?"":e.getMessage();if(e instanceof SocketTimeoutException||e instanceof UnknownHostException||e instanceof ConnectException||e instanceof SSLException)return "无法连接 E-H，请检查网络后重试";if(message.contains("会话无效")||message.contains("已过期"))return "网页登录未形成可用会话，请重新登录";if(message.contains("403")||message.contains("拦截"))return "E-H 暂时拒绝了验证请求，请稍后重试";return message.isEmpty()?"连接失败，请重新登录":"连接失败："+message;}
    private void showStatus(String text,int color){status.setText(text);status.setTextColor(color);}

    @Override public void onBackPressed(){if(web!=null&&web.canGoBack()){web.goBack();return;}super.onBackPressed();}
    @Override protected void onDestroy(){destroyed=true;if(web!=null){web.stopLoading();web.setWebViewClient(null);web.destroy();}super.onDestroy();}
}
