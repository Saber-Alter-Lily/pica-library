package com.picalibrary.android;

import java.util.*;

/** Native E-H favorite snapshot. Category names/slots are organization metadata, not semantic preference labels. */
final class EhFavoriteSync {
    static final class Item {
        final String comicId;final int slot;final String note;
        Item(String comicId,int slot,String note){this.comicId=comicId;this.slot=slot>=0&&slot<=9?slot:-1;this.note=note==null?"":note;}
    }
    final List<EhClient.Comic> comics;
    final List<Item> items;
    final List<String> categoryNames;
    final int[] categoryCounts;
    EhFavoriteSync(List<EhClient.Comic> comics,List<Item> items,List<String> categoryNames,int[] categoryCounts){this.comics=comics==null?Collections.emptyList():comics;this.items=items==null?Collections.emptyList():items;this.categoryNames=categoryNames==null?Collections.emptyList():categoryNames;this.categoryCounts=categoryCounts==null?new int[10]:Arrays.copyOf(categoryCounts,10);}
}
