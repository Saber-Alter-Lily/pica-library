package com.picalibrary.android;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class ReaderPolicy {
    static int clampPage(int page, int count) { return Math.max(0, Math.min(page, Math.max(0, count - 1))); }
    static String hash(String input) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder text = new StringBuilder();
            for (byte value : digest) text.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
            return text.toString();
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
    static int sampleSize(int width, int height, int targetWidth) {
        int sample = 1;
        while (width / (sample * 2) >= Math.max(1, targetWidth) ||
               (long)(width / sample) * (height / sample) > 8_000_000L ||
               Math.max(width, height) / sample > 8192) sample *= 2;
        return sample;
    }
    static boolean acknowledge(long sentRevision, long currentRevision) { return sentRevision == currentRevision; }
}
