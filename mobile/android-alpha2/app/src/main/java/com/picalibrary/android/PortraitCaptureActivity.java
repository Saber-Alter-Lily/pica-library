package com.picalibrary.android;

import com.journeyapps.barcodescanner.CaptureActivity;

/**
 * Portrait-only QR scanner used for Desktop pairing.
 * Uses JourneyApps' supported custom CaptureActivity hook so pairing stays
 * portrait without changing Reader orientation behavior.
 */
public final class PortraitCaptureActivity extends CaptureActivity {
}
