package com.picalibrary.android;

final class ShellPolicy {
    static String recommendationStatus(String source,boolean cached,int index,int total){
        if(!cached || !"final-v3-current".equals(source))return "电脑未声明缓存来源，请确认已安装推荐热修复";
        String text="电脑当前推荐 · 已缓存";
        if(index>=0 && total>0 && index<total)text+=" · 第 "+(index+1)+" / "+total+" 批";
        return text;
    }
}
