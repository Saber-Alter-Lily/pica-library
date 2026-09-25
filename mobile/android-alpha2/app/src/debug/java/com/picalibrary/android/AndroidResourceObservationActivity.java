package com.picalibrary.android;

import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Debug-only ADB collection surface for P2-G17 Android resource overlap evidence. */
public final class AndroidResourceObservationActivity extends Activity {
    static final String OUTPUT_FILE="p2-g17-resource-snapshot.json";
    private final ExecutorService worker=Executors.newSingleThreadExecutor();

    @Override protected void onCreate(Bundle savedInstanceState){
        super.onCreate(savedInstanceState);
        TextView status=new TextView(this);
        status.setPadding(32,32,32,32);
        status.setText("P2-G17 resource observation: collecting");
        setContentView(status);
        worker.execute(()->{
            try{
                AndroidTaskResources.Snapshot snapshot=
                    AndroidTaskResources.snapshot(getApplicationContext());
                JSONObject root=new JSONObject();
                root.put("capturedAt",System.currentTimeMillis());
                root.put("runningTotal",snapshot.runningTotal());
                root.put("waitingTotal",snapshot.waitingTotal());
                root.put("runningByResource",map(snapshot.runningByResource));
                root.put("waitingByResource",map(snapshot.waitingByResource));
                root.put("runningWorkIds",new JSONArray(snapshot.runningWorkIds));
                root.put("waitingWorkIds",new JSONArray(snapshot.waitingWorkIds));
                JSONObject byWork=new JSONObject();
                for(Map.Entry<String,Set<String>> row:snapshot.resourcesByWork.entrySet()){
                    byWork.put(row.getKey(),new JSONArray(row.getValue()));
                }
                root.put("resourcesByWork",byWork);
                File target=new File(getFilesDir(),OUTPUT_FILE);
                try(FileOutputStream out=new FileOutputStream(target,false)){
                    out.write((root.toString(2)+"\n").getBytes(StandardCharsets.UTF_8));
                    out.getFD().sync();
                }
                runOnUiThread(()->{status.setText("P2-G17 resource observation: saved");finish();});
            }catch(Exception error){
                runOnUiThread(()->{
                    status.setText("P2-G17 resource observation: failed");
                    finish();
                });
            }
        });
    }

    private static JSONObject map(Map<String,Integer> values) throws Exception {
        JSONObject out=new JSONObject();
        for(Map.Entry<String,Integer> row:values.entrySet())out.put(row.getKey(),row.getValue());
        return out;
    }

    @Override protected void onDestroy(){
        worker.shutdownNow();
        super.onDestroy();
    }
}
