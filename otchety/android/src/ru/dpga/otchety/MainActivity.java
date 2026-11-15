package ru.dpga.otchety;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;

/**
 * Центр отчётов: страница из assets внутри WebView. Сеть не используется вовсе —
 * все запросы к https://appassets.androidplatform.net/ отдаются из самого приложения,
 * любые другие адреса блокируются.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final int PICK = 1, CREATE = 2;
    WebView web;
    ValueCallback<Uri[]> pickCallback;
    byte[] pendingBytes;
    Uri[] sharedIn;

    static String mimeOf(String name) {
        String n = name == null ? "" : name.toLowerCase();
        if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (n.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        if (n.endsWith(".zip")) return "application/zip";
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".csv")) return "text/csv";
        if (n.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setBlockNetworkLoads(true);
        s.setTextZoom(100);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) {
                    String path = u.getPath();
                    if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
                    try {
                        InputStream in = getAssets().open("www" + path);
                        String type = path.endsWith(".html") ? "text/html" : path.endsWith(".js") ? "application/javascript" : "application/octet-stream";
                        return new WebResourceResponse(type, "utf-8", in);
                    } catch (Exception e) { /* нет такого файла */ }
                }
                return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                if ("mailto".equals(u.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_SENDTO, u)); } catch (Exception e) { toast("Нет почтового приложения"); }
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pickCallback != null) pickCallback.onReceiveValue(null);
                pickCallback = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(i, PICK); } catch (Exception e) { pickCallback = null; return false; }
                return true;
            }
        });
        if (state != null) web.restoreState(state);
        else web.loadUrl("https://" + HOST + "/index.html");
        handleShare(getIntent());
    }

    /** Файлы, присланные в приложение через «Поделиться» из почты или мессенджера. */
    void handleShare(Intent it) {
        if (it == null) return;
        ArrayList<Uri> list = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(it.getAction())) {
            Uri u = it.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) list.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(it.getAction())) {
            ArrayList<Uri> us = it.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (us != null) list.addAll(us);
        }
        if (!list.isEmpty()) {
            sharedIn = list.toArray(new Uri[0]);
            toast("Файлов получено: " + list.size() + ". Нажмите «Выбрать файлы» — присланные добавятся к выбранным (можно сразу «Назад»).");
        }
    }

    @Override protected void onNewIntent(Intent it) { super.onNewIntent(it); handleShare(it); }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == PICK) {
            Uri[] out = null;
            if (res == RESULT_OK && data != null) {
                ArrayList<Uri> l = new ArrayList<>();
                ClipData cd = data.getClipData();
                if (cd != null) for (int i = 0; i < cd.getItemCount(); i++) l.add(cd.getItemAt(i).getUri());
                else if (data.getData() != null) l.add(data.getData());
                if (sharedIn != null) { for (Uri u : sharedIn) l.add(u); sharedIn = null; }
                out = l.toArray(new Uri[0]);
            } else if (sharedIn != null) { out = sharedIn; sharedIn = null; }
            if (pickCallback != null) pickCallback.onReceiveValue(out);
            pickCallback = null;
        } else if (req == CREATE) {
            if (res == RESULT_OK && data != null && data.getData() != null && pendingBytes != null) {
                try (OutputStream o = getContentResolver().openOutputStream(data.getData())) { o.write(pendingBytes); toast("Сохранено"); }
                catch (Exception e) { toast("Не удалось сохранить: " + e.getMessage()); }
            }
            pendingBytes = null;
        }
    }

    void toast(final String t) { runOnUiThread(new Runnable() { public void run() { Toast.makeText(MainActivity.this, t, Toast.LENGTH_LONG).show(); } }); }

    File toShare(String name, byte[] bytes) throws Exception {
        File dir = new File(getCacheDir(), "share");
        dir.mkdirs();
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > 86400000L) f.delete();
        File f = new File(dir, name.replaceAll("[\\\\/:*?\"<>|]", " "));
        try (FileOutputStream o = new FileOutputStream(f)) { o.write(bytes); }
        return f;
    }

    void shareFile(String name, String mime, byte[] bytes, String text) {
        try {
            File f = toShare(name, bytes);
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType(mime);
            i.putExtra(Intent.EXTRA_STREAM, Files.uriFor(f));
            i.putExtra(Intent.EXTRA_SUBJECT, name.replaceAll("\\.[^.]+$", ""));
            if (text != null && !text.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, text);
            i.setClipData(ClipData.newRawUri(name, Files.uriFor(f)));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(i, "Отправить «" + name + "»"));
        } catch (Exception e) { toast("Не удалось поделиться: " + e.getMessage()); }
    }

    void saveNow(final String name, final String mime, final byte[] bytes) {
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Отчёты");
                final Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                OutputStream o = getContentResolver().openOutputStream(u);
                try { o.write(bytes); } finally { o.close(); }
                new AlertDialog.Builder(this)
                    .setTitle("Сохранено")
                    .setMessage("«" + name + "»\nв папке Загрузки → Отчёты")
                    .setPositiveButton("Поделиться", new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, int w) { shareFile(name, mime, bytes, null); } })
                    .setNeutralButton("Открыть", new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, int w) {
                        Intent i = new Intent(Intent.ACTION_VIEW);
                        i.setDataAndType(u, mime);
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        try { startActivity(i); } catch (Exception e) { toast("Нет приложения, чтобы открыть этот файл"); }
                    } })
                    .setNegativeButton("Готово", null).show();
                return;
            } catch (Exception e) { /* запасной путь ниже */ }
        }
        pendingBytes = bytes;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(mime);
        i.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(i, CREATE);
    }

    class Bridge {
        /** Сохранить файл: в «Загрузки/Отчёты» (Android 10+) или через выбор места. */
        @JavascriptInterface public void save(final String name, final String mime, String b64) {
            final byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            runOnUiThread(new Runnable() { public void run() { saveNow(name, mime, bytes); } });
        }
        /** Поделиться файлом: почта, Telegram, WhatsApp, диск — что установлено на телефоне. */
        @JavascriptInterface public void share(final String name, final String mime, String b64, final String text) {
            final byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            runOnUiThread(new Runnable() { public void run() { shareFile(name, mime, bytes, text); } });
        }
        @JavascriptInterface public String version() { return "1.0"; }
    }
}
