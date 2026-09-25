package com.picalibrary.android;

import static org.junit.Assert.*;

import android.content.ComponentCallbacks2;
import android.graphics.Bitmap;

import java.lang.reflect.Method;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, application = PicaLibraryApp.class)
public final class AndroidMemoryPressureTest {
    private PicaLibraryApp app;

    @Before public void setUp() {
        app = (PicaLibraryApp) RuntimeEnvironment.getApplication();
        CoverRepository.trimMemory();
        ImageRepository.trimMemory();
    }

    @After public void tearDown() {
        CoverRepository.trimMemory();
        ImageRepository.trimMemory();
    }

    @Test public void uiHiddenEvictsReconstructibleBitmapCaches() throws Exception {
        Bitmap cover = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888);
        Bitmap image = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888);
        try {
            rememberCover("g16-cover", cover);
            ImageRepository.put("g16-image", image);
            assertTrue(CoverRepository.memoryBytes() > 0);
            assertTrue(ImageRepository.memoryBytes() > 0);

            app.onTrimMemory(ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN);

            assertEquals(0, CoverRepository.memoryBytes());
            assertEquals(0, ImageRepository.memoryBytes());
        } finally {
            if (!cover.isRecycled()) cover.recycle();
            if (!image.isRecycled()) image.recycle();
        }
    }

    @Test public void backgroundEvictsReconstructibleBitmapCaches() throws Exception {
        Bitmap cover = Bitmap.createBitmap(128, 128, Bitmap.Config.ARGB_8888);
        Bitmap image = Bitmap.createBitmap(128, 128, Bitmap.Config.ARGB_8888);
        try {
            rememberCover("g16-cover-background", cover);
            ImageRepository.put("g16-image-background", image);

            app.onTrimMemory(ComponentCallbacks2.TRIM_MEMORY_BACKGROUND);

            assertEquals(0, CoverRepository.memoryBytes());
            assertEquals(0, ImageRepository.memoryBytes());
        } finally {
            if (!cover.isRecycled()) cover.recycle();
            if (!image.isRecycled()) image.recycle();
        }
    }

    @Test public void modernNonTrimHintDoesNotPurgeCaches() throws Exception {
        Bitmap cover = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888);
        Bitmap image = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888);
        try {
            rememberCover("g16-cover-small-hint", cover);
            ImageRepository.put("g16-image-small-hint", image);

            app.onTrimMemory(5);

            assertTrue(CoverRepository.memoryBytes() > 0);
            assertTrue(ImageRepository.memoryBytes() > 0);
        } finally {
            CoverRepository.trimMemory();
            ImageRepository.trimMemory();
            if (!cover.isRecycled()) cover.recycle();
            if (!image.isRecycled()) image.recycle();
        }
    }

    private static void rememberCover(String key, Bitmap bitmap) throws Exception {
        Method method = CoverRepository.class.getDeclaredMethod(
            "remember", String.class, Bitmap.class
        );
        method.setAccessible(true);
        method.invoke(null, key, bitmap);
    }
}
