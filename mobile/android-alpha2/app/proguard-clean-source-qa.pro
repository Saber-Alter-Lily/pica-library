# Original product source-neutral QA: use R8 to expose any remaining
# provider reachability rather than falsely calling hidden source code removed.
# Persisted WorkManager worker constructors still follow the existing model.
-keepnames class * extends androidx.work.ListenableWorker
-keepclassmembers class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}
-keepattributes Signature,InnerClasses,EnclosingMethod,RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
-renamesourcefileattribute SourceFile
-dontnote org.json.**
# No keep rule for JM runtime or Pica/E-H built-in provider implementations.
-dontwarn java.awt.**
-dontwarn javax.imageio.**

# Temporary R3 excision diagnostics: explain actual source-code retention.
# This never adds a keep rule or weakens the APK fail-closed gate.
-whyareyoukeeping class com.picalibrary.android.PicaClient
-whyareyoukeeping class com.picalibrary.android.EhClient
-whyareyoukeeping class com.picalibrary.android.JmClientManager
-whyareyoukeeping class org.picalibrary.sources.JmSource
