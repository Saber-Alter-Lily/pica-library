package com.picalibrary.android;

import android.app.*;
import android.content.Intent;
import android.widget.Toast;
import java.util.*;

/** Item-level recommendation semantics shared by recommendation cards and comic detail. */
final class RecommendationItemControlDialog {
    private RecommendationItemControlDialog(){}

    static void show(Activity activity,UnifiedCatalogStore.Entry entry,Runnable onChanged){
        if(activity==null||entry==null||entry.id==null||entry.id.isEmpty())return;
        ArrayList<String> labels=new ArrayList<>();
        ArrayList<Runnable> actions=new ArrayList<>();

        String author=entry.displayAuthor();
        if(author!=null&&!author.trim().isEmpty()){
            labels.add("调节作者 / 标签…");
            actions.add(()->{
                Intent intent=new Intent(activity,RecommendationControlActivity.class);
                intent.putExtra("query",author.trim());
                activity.startActivity(intent);
            });
            boolean authorBlocked=authorBlocked(activity,author);
            labels.add(authorBlocked?"恢复推荐此作者":"不推荐此作者");
            actions.add(()->{
                RecommendationPolicyStore.setLocalControl(
                    activity,"AUTHOR",author,author,
                    authorBlocked?"DEFAULT":"BLOCK","PERSISTENT",null
                );
                changed(activity,onChanged,authorBlocked?"已恢复此作者":"已屏蔽此作者");
            });
        }

        if(entry.favorite){
            boolean excluded=RecommendationPolicyStore.tasteExcluded(activity,entry.id);
            labels.add(excluded?"恢复用于推荐口味":"保留收藏，但不用于推荐口味");
            actions.add(()->{
                RecommendationPolicyStore.setTasteExcluded(activity,entry.id,!excluded);
                changed(activity,onChanged,!excluded?"已从口味画像排除；收藏保留":"已恢复参与推荐口味");
            });
        }

        addDisposition(activity,entry,onChanged,labels,actions,"already_seen","已经看过","取消“已经看过”");
        addDisposition(activity,entry,onChanged,labels,actions,"already_owned","已经拥有","取消“已经拥有”");
        addDisposition(activity,entry,onChanged,labels,actions,"duplicate","重复上传","取消“重复上传”");
        addDisposition(activity,entry,onChanged,labels,actions,"temporary","暂时不想看（30 天）","取消暂时隐藏");

        new AlertDialog.Builder(activity)
            .setTitle(LocalizedText.ui("调节推荐"))
            .setItems(labels.toArray(new String[0]),(d,which)->{
                if(which>=0&&which<actions.size())actions.get(which).run();
            })
            .setNegativeButton(LocalizedText.ui("关闭"),null)
            .show();
    }

    private static void addDisposition(
        Activity activity,UnifiedCatalogStore.Entry entry,Runnable onChanged,
        List<String> labels,List<Runnable> actions,
        String reason,String activeLabel,String clearLabel
    ){
        boolean active=RecommendationPolicyStore.dispositionActive(activity,entry.id,reason);
        labels.add(active?clearLabel:activeLabel);
        actions.add(()->{
            RecommendationPolicyStore.setItemDisposition(activity,entry.id,reason,!active,30);
            String message;
            if(active)message="已取消该推荐约束";
            else if("temporary".equals(reason))message="已暂时隐藏 30 天";
            else if("already_seen".equals(reason))message="已标记看过，不再作为新作推荐";
            else if("already_owned".equals(reason))message="已标记已有，不再作为新作推荐";
            else message="已标记重复上传";
            changed(activity,onChanged,message);
        });
    }

    private static boolean authorBlocked(Activity activity,String author){
        String wanted=normalize(author);
        org.json.JSONArray controls=RecommendationPolicyStore.controls(activity);
        for(int i=0;i<controls.length();i++){
            org.json.JSONObject row=controls.optJSONObject(i);if(row==null)continue;
            if("AUTHOR".equals(row.optString("targetType"))&&
                wanted.equals(normalize(row.optString("key")))&&
                "BLOCK".equals(row.optString("direction")))return true;
        }
        return false;
    }

    private static String normalize(String value){
        return value==null?"":value.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+"," ");
    }

    private static void changed(Activity activity,Runnable onChanged,String message){
        Toast.makeText(activity,message+LocalizedText.ui(" · 下次连接可与电脑同步"),Toast.LENGTH_SHORT).show();
        if(onChanged!=null)onChanged.run();
    }
}
