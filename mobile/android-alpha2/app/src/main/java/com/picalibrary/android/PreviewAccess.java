package com.picalibrary.android;

import android.content.Context;
import android.content.pm.PackageInfo;

/** Temporary official-build tester grant for the Alpha8.4/8.5 personalization QA rounds. */
final class PreviewAccess {
    private static final int TEST_MIN_VERSION_CODE=27;
    private static final int TEST_MAX_VERSION_CODE=30;
    private static final String TESTER_ENTITLEMENT="{\"schema\":1,\"supporterId\":\"alpha8.4-local-tester\",\"issuedAt\":\"2026-09-10T05:57:19.396884Z\",\"expiresAt\":\"2026-10-15T00:00:00Z\",\"features\":[\"theme-packs\"],\"nonce\":\"t2wYhxyJ6v5QE3dFrkCYVRij\",\"signature\":\"MEYCIQD/J2wtigC7qQRc+mNzkfgFYZZU3EbdZB/Ld63iX9t/DAIhAMsz2pZcJG3mgWrs31qtn2pi1NpenSXimoZeUjFtljzA\"}";
    private PreviewAccess(){}
    static void installIfEligible(Context context){
        long version=versionCode(context);
        if(version<TEST_MIN_VERSION_CODE||version>TEST_MAX_VERSION_CODE||!OfficialBuildGate.isOfficial(context))return;
        if(SupporterEntitlement.load(context).has(SupporterEntitlement.FEATURE_THEME_PACKS))return;
        try{SupporterEntitlement.install(context,TESTER_ENTITLEMENT);}catch(Exception ignored){}
    }
    private static long versionCode(Context context){try{PackageInfo info=context.getPackageManager().getPackageInfo(context.getPackageName(),0);return info.getLongVersionCode();}catch(Exception e){return -1;}}
}