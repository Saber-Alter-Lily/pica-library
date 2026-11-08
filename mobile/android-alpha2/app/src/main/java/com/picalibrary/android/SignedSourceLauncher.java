package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.widget.Toast;

/** A single fail-closed optional source-only Host launcher, not a site SDK. */
final class SignedSourceLauncher {
    private static final String HOST="com.picalibrary.android.userhost.qa";
    private static final String ENTRY="com.picalibrary.android.HostBrowserActivity";
    private SignedSourceLauncher(){}
    static void open(Activity app){open(app,false);}
    static void openSaved(Activity app){open(app,true);}
    private static void open(Activity app,boolean saved){
        PackageManager packages=app.getPackageManager();
        if(packages.checkSignatures(app.getPackageName(),HOST)!=
                PackageManager.SIGNATURE_MATCH){
            new AlertDialog.Builder(app)
                .setTitle(LocalizedText.ui(app,"独立来源组件未就绪",
                    "Source companion unavailable","外部ソースが利用できません"))
                .setMessage(LocalizedText.ui(app,
                    "只有单独安装且同签名的可信来源组件才能连接。离线阅读无需来源组件。",
                    "Install a trusted separately distributed matching-signer Host. Offline reading does not require it.",
                    "同じ署名の信頼できる外部ソースが必要です。オフライン閲覧には不要です。"))
                .setPositiveButton(android.R.string.ok,null).show();
            return;
        }
        try{
            android.content.pm.ActivityInfo activity=packages.getActivityInfo(
                new android.content.ComponentName(HOST,ENTRY),0);
            if(!activity.exported||
                    !"com.picalibrary.android.remote.BIND_SOURCE".equals(activity.permission))
                throw new SecurityException("Untrusted source entry");
            Intent intent=new Intent().setClassName(HOST,ENTRY)
                .putExtra("pica.reader.package",app.getPackageName());
            if(saved)intent.putExtra("pica.open.saved.books",true);
            app.startActivity(intent);
        }catch(PackageManager.NameNotFoundException|
                android.content.ActivityNotFoundException|SecurityException unavailable){
            Toast.makeText(app,LocalizedText.ui(app,"来源组件不可用",
                "Source companion unavailable","外部ソースを利用できません"),
                Toast.LENGTH_LONG).show();
        }
    }
}
