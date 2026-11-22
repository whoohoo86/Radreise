package de.fabian.radreise;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Zeigt bikerouter.de in einer eigenen WebView, die über der Capacitor-WebView
 * an einem von Angular gemessenen Rechteck liegt. Downloads (Export) werden
 * abgefangen und als Event "fileExported" an Angular geliefert.
 */
@CapacitorPlugin(name = "Bikerouter")
public class BikerouterPlugin extends Plugin {

    private WebView web;
    private String hookJs;
    private OnBackPressedCallback backCallback;

    private static class Rect {
        final float x, y, w, h;
        Rect(float x, float y, float w, float h) { this.x = x; this.y = y; this.w = w; this.h = h; }
    }

    private Rect read(PluginCall call) {
        return new Rect(
            call.getFloat("x", 0f), call.getFloat("y", 0f),
            call.getFloat("width", 0f), call.getFloat("height", 0f));
    }

    private FrameLayout.LayoutParams params(Rect r) {
        ViewGroup content = getActivity().findViewById(android.R.id.content);
        View cap = getBridge().getWebView();
        int[] c = new int[2];
        int[] w = new int[2];
        content.getLocationInWindow(c);
        cap.getLocationInWindow(w);
        float d = getActivity().getResources().getDisplayMetrics().density;
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(Math.round(r.w * d), Math.round(r.h * d));
        lp.leftMargin = (w[0] - c[0]) + Math.round(r.x * d);
        lp.topMargin = (w[1] - c[1]) + Math.round(r.y * d);
        return lp;
    }

    private String loadHook() {
        if (hookJs != null) return hookJs;
        try (InputStream in = getActivity().getAssets().open("export-hook.js")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            hookJs = out.toString("UTF-8");
        } catch (Exception e) {
            hookJs = "";
        }
        return hookJs;
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @PluginMethod
    public void open(PluginCall call) {
        final String url = call.getString("url");
        final Rect r = read(call);
        if (url == null) { call.reject("url fehlt"); return; }
        getActivity().runOnUiThread(() -> {
            if (web == null) {
                web = new WebView(getActivity());
                WebSettings s = web.getSettings();
                s.setJavaScriptEnabled(true);
                s.setDomStorageEnabled(true); // bikerouter speichert Profile/Einstellungen im Browser
                s.setSupportMultipleWindows(false);
                web.addJavascriptInterface(new Object() {
                    @JavascriptInterface
                    public void onFile(String name, String mime, String base64) {
                        String text = new String(Base64.decode(base64, Base64.DEFAULT), StandardCharsets.UTF_8);
                        JSObject o = new JSObject();
                        o.put("filename", name);
                        o.put("mime", mime);
                        o.put("text", text);
                        notifyListeners("fileExported", o);
                    }
                }, "RadreiseNative");
                web.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageStarted(WebView v, String u, Bitmap f) { v.evaluateJavascript(loadHook(), null); }
                    @Override
                    public void onPageFinished(WebView v, String u) { v.evaluateJavascript(loadHook(), null); }
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, android.webkit.WebResourceRequest req) {
                        Uri u = req.getUrl();
                        String host = u.getHost() == null ? "" : u.getHost();
                        if (host.endsWith("bikerouter.de")) return false;
                        getActivity().startActivity(new Intent(Intent.ACTION_VIEW, u));
                        return true;
                    }
                });
                // Fallback, falls ein Download doch am Hook vorbeikommt (Blob-/data:-URLs).
                web.setDownloadListener((u, ua, cd, mime, len) -> {
                    if (u.startsWith("blob:") || u.startsWith("data:")) {
                        String name = URLUtil.guessFileName(u, cd, mime);
                        web.evaluateJavascript(
                            "window.__radreiseCapture && window.__radreiseCapture(" + JSONquote(u) + "," + JSONquote(name) + ")", null);
                    }
                });
                backCallback = new OnBackPressedCallback(false) {
                    @Override
                    public void handleOnBackPressed() {
                        if (web != null && web.canGoBack()) web.goBack();
                        else notifyListeners("closeRequested", new JSObject());
                    }
                };
                getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), backCallback);
                getActivity().addContentView(web, params(r));
                web.loadUrl(url);
            } else {
                web.setLayoutParams(params(r));
            }
            web.setVisibility(View.VISIBLE);
            backCallback.setEnabled(true);
            call.resolve();
        });
    }

    private static String JSONquote(String s) {
        return org.json.JSONObject.quote(s);
    }

    @PluginMethod
    public void setBounds(PluginCall call) {
        final Rect r = read(call);
        getActivity().runOnUiThread(() -> {
            if (web != null) web.setLayoutParams(params(r));
            call.resolve();
        });
    }

    @PluginMethod
    public void setVisible(PluginCall call) {
        final boolean visible = Boolean.TRUE.equals(call.getBoolean("visible", true));
        getActivity().runOnUiThread(() -> {
            if (web != null) web.setVisibility(visible ? View.VISIBLE : View.GONE);
            if (backCallback != null) backCallback.setEnabled(visible && web != null);
            call.resolve();
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (web != null) {
                ((ViewGroup) web.getParent()).removeView(web);
                web.destroy();
                web = null;
            }
            if (backCallback != null) backCallback.setEnabled(false);
            call.resolve();
        });
    }
}
