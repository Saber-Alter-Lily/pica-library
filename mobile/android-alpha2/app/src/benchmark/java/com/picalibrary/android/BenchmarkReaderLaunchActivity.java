package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * Benchmark-only bridge into the real ReaderActivity.
 * This source set is excluded from release/debug APKs.
 */
public final class BenchmarkReaderLaunchActivity extends Activity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        Intent source=getIntent();
        String comicId=source.getStringExtra("comicId");
        String episodeId=source.getStringExtra("episodeId");
        String readerSource=source.getStringExtra("source");
        String title=source.getStringExtra("title");
        if(comicId==null||comicId.trim().isEmpty()||episodeId==null||episodeId.trim().isEmpty()){
            finish();
            return;
        }
        Intent reader=new Intent(this,ReaderActivity.class);
        reader.putExtra("comicId",comicId);
        reader.putExtra("episodeId",episodeId);
        reader.putExtra("source",readerSource==null||readerSource.trim().isEmpty()?"pica":readerSource);
        reader.putExtra("title",title==null?"K3 Reader":title);
        startActivity(reader);
        finish();
    }
}
