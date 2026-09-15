package com.picalibrary.android;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Supporter-only capabilities are accepted by the fixed official Preview signing identity.
 * The isolated debuggable Dev package is also admitted strictly for manual QA so Star/theme
 * behavior can be tested without exposing the formal Preview signing key to public CI.
 */
final class OfficialBuildGate {
    private static final String CERT_SHA256="64fb87dc7d8bd6bc7b2cec92cc8c83fad3afe8cfb07591a2e53d53cbd3ab2f9d";
    private static final String DEV_PACKAGE="com.picalibrary.android.dev";
    private OfficialBuildGate(){}
    static boolean isOfficial(Context c){if(isIsolatedDevBuild(c))return true;try{PackageInfo info=c.getPackageManager().getPackageInfo(c.getPackageName(),PackageManager.GET_SIGNING_CERTIFICATES);if(info.signingInfo==null)return false;Signature[] signatures=info.signingInfo.hasMultipleSigners()?info.signingInfo.getApkContentsSigners():info.signingInfo.getSigningCertificateHistory();if(signatures==null)return false;MessageDigest digest=MessageDigest.getInstance("SHA-256");for(Signature signature:signatures){String hex=hex(digest.digest(signature.toByteArray()));if(CERT_SHA256.equalsIgnoreCase(hex))return true;}return false;}catch(Exception e){return false;}}
    private static boolean isIsolatedDevBuild(Context c){try{return DEV_PACKAGE.equals(c.getPackageName())&&(c.getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)!=0;}catch(Exception e){return false;}}
    private static String hex(byte[] value){StringBuilder out=new StringBuilder(value.length*2);for(byte b:value)out.append(String.format(Locale.ROOT,"%02x",b&0xff));return out.toString();}
}
