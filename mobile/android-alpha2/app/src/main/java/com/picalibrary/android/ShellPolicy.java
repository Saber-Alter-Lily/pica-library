package com.picalibrary.android;

final class ShellPolicy {
    private static final String[] BOTTOM_TABS={"书库","推荐","在线","连接"};

    private ShellPolicy(){}

    static String[] bottomTabs(){return BOTTOM_TABS.clone();}

    static int clampTab(int value){
        return value<0?0:Math.min(value,BOTTOM_TABS.length-1);
    }

    static String recommendationStatus(String source,boolean cached,int index,int total){
        if(!cached || !"final-v3-current".equals(source))return "电脑推荐暂不可用";
        String text="电脑推荐已就绪";
        if(index>=0 && total>0 && index<total)text+=" · 第 "+(index+1)+" / "+total+" 批";
        return text;
    }
}
