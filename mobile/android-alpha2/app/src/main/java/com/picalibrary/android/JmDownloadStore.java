package com.picalibrary.android;

import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.util.AtomicFile;
import androidx.documentfile.provider.DocumentFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.UUID;
import org.json.JSONObject;

/** Separate resumable-page checkpoints; the existing phone index receives complete chapters only. */
final class JmDownloadStore {
    static final int MAX_BYTES = 20 * 1024 * 1024;
    private final Context context;
    private final String comicId, episodeId;
    private final AtomicFile checkpoint;
    private final JSONObject pages;

    JmDownloadStore(Context context, String comicId, String episodeId) throws Exception {
        this.context = context.getApplicationContext();
        remote(comicId, "jm:"); remote(episodeId, "jm-chapter:");
        this.comicId = comicId; this.episodeId = episodeId;
        File root = new File(context.getFilesDir(), "jm-download-checkpoints-v1");
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("Cannot create JM checkpoints");
        checkpoint = new AtomicFile(new File(root, ReaderPolicy.hash(comicId + "\n" + episodeId) + ".json"));
        JSONObject loaded;
        try { loaded = new JSONObject(new String(checkpoint.readFully(), StandardCharsets.UTF_8)); }
        catch (FileNotFoundException missing) { loaded = new JSONObject(); }
        catch (Exception corrupt) { loaded = new JSONObject(); }
        pages = loaded;
    }

    String reusable(String locator) {
        JSONObject record = pages.optJSONObject(locator);
        if (record == null) return "";
        String value = record.optString("uri");
        return valid(value, record.optString("sha256"), record.optLong("bytes", -1)) ? value : "";
    }

    String save(String locator, int position, byte[] bytes) throws Exception {
        String extension = extension(bytes), digest = digest(bytes);
        android.graphics.BitmapFactory.Options bounds = new android.graphics.BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try { android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds); }
        catch (RuntimeException invalid) { throw new IOException("JM image decoding failed", invalid); }
        if (bounds.outWidth < 1 || bounds.outHeight < 1 || (long) bounds.outWidth * bounds.outHeight > 100_000_000L)
            throw new IOException("JM image cannot be decoded safely");
        String filename = String.format(Locale.ROOT, "%06d-%s.%s", position + 1, digest.substring(0, 16), extension);
        String tree = StorageSettings.downloadTreeUri(context);
        String uri = tree == null || tree.isEmpty()
                ? saveFile(filename, bytes) : saveDocument(tree, filename, extension, bytes);
        pages.put(locator, new JSONObject().put("uri", uri).put("sha256", digest).put("bytes", bytes.length));
        FileOutputStream stream = null;
        try {
            stream = checkpoint.startWrite();
            stream.write(pages.toString().getBytes(StandardCharsets.UTF_8));
            checkpoint.finishWrite(stream);
        } catch (Exception error) {
            if (stream != null) checkpoint.failWrite(stream);
            throw error;
        }
        return uri;
    }

    private String saveFile(String name, byte[] bytes) throws Exception {
        File base = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (base == null) base = context.getFilesDir();
        File directory = new File(base, "PicaLibraryDownloads/jm/" + remote(comicId, "jm:") + "/" + remote(episodeId, "jm-chapter:"));
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create JM download directory");
        File target = new File(directory, name);
        if (target.exists()) {
            if (valid(Uri.fromFile(target).toString(), digest(bytes), bytes.length)) return Uri.fromFile(target).toString();
            target = new File(directory, UUID.randomUUID() + "-" + name);
        }
        AtomicFile output = new AtomicFile(target);
        FileOutputStream stream = null;
        try {
            stream = output.startWrite(); stream.write(bytes); output.finishWrite(stream);
            return Uri.fromFile(target).toString();
        } catch (Exception error) {
            if (stream != null) output.failWrite(stream);
            throw error;
        }
    }

    private String saveDocument(String tree, String name, String extension, byte[] bytes) throws Exception {
        DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(tree));
        if (root == null || !root.canWrite()) throw new IOException("JM download directory is not writable");
        DocumentFile directory = dir(dir(dir(dir(root, "PicaLibraryDownloads"), "jm"), remote(comicId, "jm:")), remote(episodeId, "jm-chapter:"));
        DocumentFile existing = directory.findFile(name);
        if (existing != null && valid(existing.getUri().toString(), digest(bytes), bytes.length)) return existing.getUri().toString();
        if (existing != null) name = UUID.randomUUID() + "-" + name;
        DocumentFile part = directory.createFile("application/octet-stream", UUID.randomUUID() + ".part");
        if (part == null) throw new IOException("Cannot create JM temporary page");
        DocumentFile target = null;
        try {
            try (OutputStream out = context.getContentResolver().openOutputStream(part.getUri(), "wt")) {
                if (out == null) throw new IOException("Cannot write JM page"); out.write(bytes);
            }
            if (!valid(part.getUri().toString(), digest(bytes), bytes.length)) throw new IOException("JM page verification failed");
            if (part.renameTo(name)) return part.getUri().toString();
            target = directory.createFile("image/" + ("jpg".equals(extension) ? "jpeg" : extension), name);
            if (target == null) throw new IOException("Cannot commit JM page");
            try (InputStream in = context.getContentResolver().openInputStream(part.getUri());
                    OutputStream out = context.getContentResolver().openOutputStream(target.getUri(), "wt")) {
                if (in == null || out == null) throw new IOException("Cannot commit JM page");
                byte[] buffer = new byte[32768]; int n;
                while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            }
            if (!valid(target.getUri().toString(), digest(bytes), bytes.length)) throw new IOException("JM page verification failed");
            part.delete(); return target.getUri().toString();
        } catch (Exception error) {
            part.delete(); if (target != null) target.delete(); throw error;
        }
    }

    private boolean valid(String value, String expected, long length) {
        if (length < 1 || length > MAX_BYTES || !expected.matches("[a-f0-9]{64}")) return false;
        try (InputStream in = context.getContentResolver().openInputStream(Uri.parse(value))) {
            if (in == null) return false;
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[32768]; long total = 0; int n;
            while ((n = in.read(buffer)) != -1) {
                total += n; if (total > length) return false; hash.update(buffer, 0, n);
            }
            return total == length && hex(hash.digest()).equals(expected);
        } catch (Exception error) { return false; }
    }

    static String extension(byte[] bytes) throws IOException {
        if (bytes == null || bytes.length < 12 || bytes.length > MAX_BYTES) throw new IOException("Invalid JM image size");
        if ((bytes[0]&255)==255 && (bytes[1]&255)==216 && (bytes[2]&255)==255) return "jpg";
        if ((bytes[0]&255)==137 && bytes[1]=='P' && bytes[2]=='N' && bytes[3]=='G' && bytes[4]==13 && bytes[5]==10 && bytes[6]==26 && bytes[7]==10) return "png";
        if (bytes[0]=='R' && bytes[1]=='I' && bytes[2]=='F' && bytes[3]=='F' && bytes[8]=='W' && bytes[9]=='E' && bytes[10]=='B' && bytes[11]=='P') return "webp";
        if (bytes[0]=='G' && bytes[1]=='I' && bytes[2]=='F' && bytes[3]=='8' && (bytes[4]=='7'||bytes[4]=='9') && bytes[5]=='a') return "gif";
        throw new IOException("JM returned non-image content");
    }

    static String remote(String id, String prefix) {
        if (id == null || !id.startsWith(prefix) || !id.substring(prefix.length()).matches("[1-9][0-9]{0,14}"))
            throw new IllegalArgumentException("Invalid JM download identity");
        return id.substring(prefix.length());
    }
    private static DocumentFile dir(DocumentFile parent, String name) throws IOException {
        DocumentFile value = parent.findFile(name);
        if (value != null && value.isDirectory()) return value;
        if (value != null) throw new IOException("JM directory conflicts with an existing file");
        value = parent.createDirectory(name);
        if (value == null) throw new IOException("Cannot create JM directory"); return value;
    }
    private static String digest(byte[] bytes) throws Exception { return hex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
    private static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder();
        for (byte b : bytes) value.append(String.format(Locale.ROOT, "%02x", b & 255)); return value.toString();
    }
}
