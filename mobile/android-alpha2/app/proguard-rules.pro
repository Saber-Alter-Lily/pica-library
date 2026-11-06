# Pica Library release hardening.
# Android Gradle Plugin contributes manifest/component keep rules automatically.

# WorkManager persists worker class names. Keep those names stable across upgrades
# while still allowing the rest of the application implementation to be renamed.
-keepnames class * extends androidx.work.ListenableWorker
-keepclassmembers class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}

# Keep generic/annotation metadata needed by AndroidX while removing ordinary
# debug/source naming from the distributable release.
-keepattributes Signature,InnerClasses,EnclosingMethod,RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
-renamesourcefileattribute SourceFile

# Never emit verbose shrinker diagnostics into the packaged app.
-dontnote org.json.**

# The shared SDK's only AWT/ImageIO references are its optional desktop fallback.
# Android must keep the native SPI provider; JmCatalogIntegrationTest verifies its selection.
-keep class io.github.jukomu.jmcomic.android.support.AndroidImageProcessor { *; }
-keep class io.github.jukomu.jmcomic.api.model.** { *; }
-dontwarn java.awt.Graphics2D
-dontwarn java.awt.Image
-dontwarn java.awt.image.BufferedImage
-dontwarn java.awt.image.ImageObserver
-dontwarn java.awt.image.RenderedImage
-dontwarn javax.imageio.ImageIO
