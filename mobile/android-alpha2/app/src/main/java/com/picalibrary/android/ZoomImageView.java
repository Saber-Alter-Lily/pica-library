package com.picalibrary.android;

import android.content.Context;
import android.graphics.Matrix;
import android.graphics.drawable.Drawable;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.widget.ImageView;

final class ZoomImageView extends ImageView {
    interface NavigationListener { void onPrevious(); void onNext(); void onCenterTap(); }
    private final Matrix matrix = new Matrix();
    private final ScaleGestureDetector scaleDetector;
    private final GestureDetector gestureDetector;
    private NavigationListener navigationListener;
    private float scale = 1f;
    private float baseScale = 1f;
    private float translateX = 0f;
    private float translateY = 0f;
    private boolean laidOutOnce = false;
    private boolean pagerManaged = false;
    void setPagerManaged(boolean managed) { pagerManaged = managed; }

    ZoomImageView(Context context) {
        super(context);setScaleType(ScaleType.MATRIX);
        scaleDetector = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector detector) {float next=Math.max(1f,Math.min(4f,scale*detector.getScaleFactor()));float factor=next/scale;scale=next;matrix.postScale(factor,factor,detector.getFocusX(),detector.getFocusY());constrain();setImageMatrix(matrix);return true;}
        });
        gestureDetector = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(MotionEvent e){return true;}
            @Override public boolean onSingleTapConfirmed(MotionEvent e){if(navigationListener==null)return true;if(scale>1.03f){navigationListener.onCenterTap();return true;}float x=e.getX();if(x<getWidth()*.28f)navigationListener.onPrevious();else if(x>getWidth()*.72f)navigationListener.onNext();else navigationListener.onCenterTap();return true;}
            @Override public boolean onDoubleTap(MotionEvent e){if(scale>1.05f)resetZoom();else{float factor=2f/scale;scale=2f;matrix.postScale(factor,factor,e.getX(),e.getY());constrain();setImageMatrix(matrix);}return true;}
            @Override public boolean onScroll(MotionEvent e1,MotionEvent e2,float dx,float dy){if(scale<=1.03f)return false;matrix.postTranslate(-dx,-dy);translateX-=dx;translateY-=dy;constrain();setImageMatrix(matrix);return true;}
            @Override public boolean onFling(MotionEvent e1,MotionEvent e2,float vx,float vy){if(pagerManaged)return false;if(scale>1.03f||navigationListener==null||e1==null||e2==null)return false;float dx=e2.getX()-e1.getX();if(Math.abs(dx)<getWidth()*.18f||Math.abs(vx)<500f)return false;if(dx<0)navigationListener.onNext();else navigationListener.onPrevious();return true;}
        });
    }
    void setNavigationListener(NavigationListener listener){navigationListener=listener;}
    @Override public void setImageDrawable(Drawable drawable){super.setImageDrawable(drawable);laidOutOnce=false;post(this::fitDrawable);}
    private void fitDrawable(){Drawable d=getDrawable();if(d==null||getWidth()<=0||getHeight()<=0)return;int dw=Math.max(1,d.getIntrinsicWidth()),dh=Math.max(1,d.getIntrinsicHeight());float sx=(float)getWidth()/dw,sy=(float)getHeight()/dh;baseScale=Math.min(sx,sy);float dx=(getWidth()-dw*baseScale)*.5f,dy=(getHeight()-dh*baseScale)*.5f;matrix.reset();matrix.postScale(baseScale,baseScale);matrix.postTranslate(dx,dy);scale=1f;translateX=dx;translateY=dy;setImageMatrix(matrix);laidOutOnce=true;}
    void resetZoom(){fitDrawable();}
    @Override protected void onSizeChanged(int w,int h,int oldw,int oldh){super.onSizeChanged(w,h,oldw,oldh);if(w!=oldw||h!=oldh)fitDrawable();}
    private void constrain(){Drawable d=getDrawable();if(d==null)return;float[] v=new float[9];matrix.getValues(v);float currentScale=v[Matrix.MSCALE_X],width=d.getIntrinsicWidth()*currentScale,height=d.getIntrinsicHeight()*currentScale,tx=v[Matrix.MTRANS_X],ty=v[Matrix.MTRANS_Y];float minX=Math.min(0f,getWidth()-width),minY=Math.min(0f,getHeight()-height);float wantedX=width<=getWidth()?(getWidth()-width)*.5f:Math.max(minX,Math.min(0f,tx));float wantedY=height<=getHeight()?(getHeight()-height)*.5f:Math.max(minY,Math.min(0f,ty));matrix.postTranslate(wantedX-tx,wantedY-ty);}
    @Override public boolean onTouchEvent(MotionEvent event){if(getParent()!=null){boolean finished=event.getActionMasked()==MotionEvent.ACTION_UP||event.getActionMasked()==MotionEvent.ACTION_CANCEL;getParent().requestDisallowInterceptTouchEvent(!finished&&(scale>1.03f||event.getPointerCount()>1));}scaleDetector.onTouchEvent(event);gestureDetector.onTouchEvent(event);return true;}
}
