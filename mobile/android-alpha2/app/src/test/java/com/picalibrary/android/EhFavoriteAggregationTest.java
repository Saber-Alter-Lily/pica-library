package com.picalibrary.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class EhFavoriteAggregationTest {
    @Test public void sourceAggregationIsAdditive(){assertFalse(EhFavoriteStore.aggregate(false,false,false));assertTrue(EhFavoriteStore.aggregate(true,false,false));assertTrue(EhFavoriteStore.aggregate(false,true,false));assertTrue(EhFavoriteStore.aggregate(false,false,true));assertTrue(EhFavoriteStore.aggregate(true,true,true));}
}
