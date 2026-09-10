package com.picalibrary.android;

import android.graphics.Bitmap;
import android.graphics.Color;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.common.BitMatrix;

/** Exact payment destinations supplied by the project owner; QR rendering uses ZXing. */
final class SupportQr {
    static final String WECHAT="wxp://f2f04_W9ygrHkVzuyBDwcwQ-JD_s0x7ykO1XtWtemaqNViM";
    static final String ALIPAY="https://qr.alipay.com/fkx14989yqljy1lllnfn47b";
    private SupportQr(){}
    static Bitmap bitmap(String payload,int size){
        try{BitMatrix matrix=new MultiFormatWriter().encode(payload,BarcodeFormat.QR_CODE,size,size);Bitmap out=Bitmap.createBitmap(size,size,Bitmap.Config.ARGB_8888);for(int y=0;y<size;y++)for(int x=0;x<size;x++)out.setPixel(x,y,matrix.get(x,y)?Color.BLACK:Color.WHITE);return out;}catch(Exception e){throw new IllegalStateException("无法生成收款码",e);}
    }
}
