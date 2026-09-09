package com.picalibrary.android;

import android.content.Context;
import java.io.*;

/** App-scoped mobile storage roots. Credentials and SharedPreferences stay internal. */
final class MobileStoragePaths {
    private static final String[] PORTABLE_FILES={"unified-catalog-v1.json","favorite-catalog-v1.json","portable-shelves-v1.json"};
    private MobileStoragePaths(){}

    static File dataRoot(Context context){
        if(StorageSettings.dataExternal(context)){
            File external=context.getExternalFilesDir(null);
            if(external!=null){File root=new File(external,"PicaLibraryData");root.mkdirs();return root;}
        }
        return context.getFilesDir();
    }
    static File dataFile(Context context,String name){return new File(dataRoot(context),name);}

    static File cacheRoot(Context context){
        if(StorageSettings.cacheExternal(context)){
            File external=context.getExternalFilesDir(null);
            if(external!=null){File root=new File(external,"PicaLibraryCache");root.mkdirs();return root;}
        }
        return context.getFilesDir();
    }
    static File cacheDir(Context context,String name){File dir=new File(cacheRoot(context),name);dir.mkdirs();return dir;}

    static boolean externalAvailable(Context context){return context.getExternalFilesDir(null)!=null;}

    static synchronized void migrateDataRoot(Context context,boolean external) throws IOException {
        File from=dataRoot(context);
        File to;
        if(external){File base=context.getExternalFilesDir(null);if(base==null)throw new IOException("当前设备没有可用的应用外部存储");to=new File(base,"PicaLibraryData");}
        else to=context.getFilesDir();
        to.mkdirs();
        if(from.getCanonicalFile().equals(to.getCanonicalFile())){StorageSettings.setDataExternal(context,external);return;}
        for(String name:PORTABLE_FILES){File source=new File(from,name);if(!source.isFile())continue;File target=new File(to,name);copyAtomic(source,target);}
        StorageSettings.setDataExternal(context,external);
    }

    private static void copyAtomic(File source,File target) throws IOException {
        target.getParentFile().mkdirs();File temp=File.createTempFile("migrate-",".tmp",target.getParentFile());
        try(InputStream in=new FileInputStream(source);OutputStream out=new FileOutputStream(temp)){byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))>0)out.write(buffer,0,n);}
        if(target.exists()&&!target.delete())throw new IOException("无法替换目标数据文件："+target.getName());
        if(!temp.renameTo(target))throw new IOException("无法迁移数据文件："+target.getName());
    }
}
