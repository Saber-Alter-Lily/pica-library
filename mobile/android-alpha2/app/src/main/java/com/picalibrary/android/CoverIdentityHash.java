package com.picalibrary.android;

import android.graphics.Bitmap;

/** Lightweight perceptual cover identity for Work Identity V3. */
final class CoverIdentityHash {
    private CoverIdentityHash(){}

    static double similarity(Bitmap left,Bitmap right){
        if(left==null||right==null)return 0d;
        long a1=averageHash(left),a2=averageHash(right);
        long d1=differenceHash(left),d2=differenceHash(right);
        double average=1d-(Long.bitCount(a1^a2)/64d);
        double difference=1d-(Long.bitCount(d1^d2)/64d);
        return Math.max(0d,Math.min(1d,average*.42d+difference*.58d));
    }

    private static long averageHash(Bitmap source){
        Bitmap bitmap=Bitmap.createScaledBitmap(source,8,8,true);
        int[] values=new int[64];long sum=0;
        for(int y=0;y<8;y++)for(int x=0;x<8;x++){
            int color=bitmap.getPixel(x,y);
            int gray=gray(color);values[y*8+x]=gray;sum+=gray;
        }
        if(bitmap!=source)bitmap.recycle();
        double mean=sum/64d;long hash=0L;
        for(int i=0;i<64;i++)if(values[i]>=mean)hash|=(1L<<i);
        return hash;
    }

    private static long differenceHash(Bitmap source){
        Bitmap bitmap=Bitmap.createScaledBitmap(source,9,8,true);
        long hash=0L;int bit=0;
        for(int y=0;y<8;y++)for(int x=0;x<8;x++){
            if(gray(bitmap.getPixel(x,y))>=gray(bitmap.getPixel(x+1,y)))hash|=(1L<<bit);
            bit++;
        }
        if(bitmap!=source)bitmap.recycle();
        return hash;
    }

    private static int gray(int color){
        int r=(color>>16)&255,g=(color>>8)&255,b=color&255;
        return (r*299+g*587+b*114)/1000;
    }
}
