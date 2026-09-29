package com.sgroup.orbit.child.tracker;

import android.os.Build;
import androidx.annotation.Nullable;
import com.sgroup.orbit.child.BuildConfig;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The only way the tracker talks to the Orbit server: JSON over HTTPS with
 * HttpURLConnection, the device token as a Bearer header. Redirects are not
 * followed, so the token is never sent anywhere but the paired address.
 */
final class Api {

    static final int TIMEOUT_MS = 15_000;
    private static final int MAX_BODY = 1024 * 1024;

    private Api() {}

    static final class Response {

        final int code;

        @Nullable
        final JSONObject json;

        Response(int code, @Nullable JSONObject json) {
            this.code = code;
            this.json = json;
        }

        boolean ok() {
            return code >= 200 && code < 300;
        }

        /** The server's machine-readable code, e.g. PAIRING_INVALID, DEVICE_REVOKED. */
        @Nullable
        String errorCode() {
            return json == null ? null : emptyToNull(json.optString("code", null));
        }

        /** The server's plain-words message, if it sent one. */
        @Nullable
        String errorMessage() {
            return json == null ? null : emptyToNull(json.optString("error", null));
        }

        boolean isRevocation() {
            String c = errorCode();
            return code == 401 && ("DEVICE_REVOKED".equals(c) || "DEVICE_UNAUTHORIZED".equals(c));
        }
    }

    /** Release builds never talk plain http (the network security config also forbids it). */
    static boolean allowedScheme(String baseUrl) {
        String u = baseUrl.toLowerCase(java.util.Locale.ROOT);
        return u.startsWith("https://") || (BuildConfig.DEBUG && u.startsWith("http://"));
    }

    static Response post(String baseUrl, String path, @Nullable String token, JSONObject body) throws IOException {
        return post(baseUrl, path, token, body, TIMEOUT_MS);
    }

    static Response post(String baseUrl, String path, @Nullable String token, JSONObject body, int timeoutMs) throws IOException {
        if (!allowedScheme(baseUrl)) throw new IOException("Only https:// addresses are allowed");
        URL url = new URL(baseUrl + path);
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        try {
            c.setConnectTimeout(timeoutMs);
            c.setReadTimeout(timeoutMs);
            c.setInstanceFollowRedirects(false);
            c.setUseCaches(false);
            c.setDoOutput(true);
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty(
                "User-Agent",
                "OrbitChild/" + BuildConfig.VERSION_NAME + " (Android " + Build.VERSION.RELEASE + "; " + Build.MODEL + ")"
            );
            if (token != null) c.setRequestProperty("Authorization", "Bearer " + token);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            c.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = c.getOutputStream()) {
                out.write(bytes);
            }
            int code = c.getResponseCode();
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            JSONObject json = null;
            if (in != null) {
                try (InputStream s = in) {
                    String text = readAll(s);
                    if (!text.isEmpty()) {
                        try {
                            json = new JSONObject(text);
                        } catch (JSONException notJson) {
                            json = null;
                        }
                    }
                }
            }
            return new Response(code, json);
        } finally {
            c.disconnect();
        }
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while ((n = in.read(chunk)) != -1) {
            buf.write(chunk, 0, n);
            if (buf.size() > MAX_BODY) throw new IOException("Answer too large");
        }
        return buf.toString("UTF-8");
    }

    @Nullable
    private static String emptyToNull(@Nullable String s) {
        return s == null || s.isEmpty() ? null : s;
    }
}
