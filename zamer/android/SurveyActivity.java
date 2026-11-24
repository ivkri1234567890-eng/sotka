package ru.zamer.smeta;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.Toast;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Set;

public final class SurveyActivity extends UpdatedActivity {
    private static final int PICK = 9274;
    private ValueCallback<Uri[]> pending;
    private Uri capture;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (pending != null) {
                    callback.onReceiveValue(null);
                    return true;
                }
                pending = callback;
                try {
                    if (params.isCaptureEnabled()) {
                        capture = CaptureProvider.create(SurveyActivity.this);
                        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        intent.putExtra(MediaStore.EXTRA_OUTPUT, capture);
                        intent.setClipData(ClipData.newRawUri("Фото", capture));
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                        startActivityForResult(intent, PICK);
                    } else {
                        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
                        Set<String> types = new LinkedHashSet<>();
                        for (String entry : params.getAcceptTypes()) {
                            if (entry == null) continue;
                            for (String item : entry.split(",")) {
                                String type = item.trim();
                                if (type.contains("/")) types.add(type);
                                // Some document providers report DXF, ZIP and JSON as generic binary.
                                if (type.startsWith(".") && !type.matches("(?i)\\.(jpe?g|png|webp)")) types.add("*/*");
                            }
                        }
                        intent.setType(types.size() == 1 ? types.iterator().next() : "*/*");
                        if (types.size() > 1 && !types.contains("*/*"))
                            intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
                        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                        startActivityForResult(intent, PICK);
                    }
                } catch (ActivityNotFoundException | SecurityException | IOException e) {
                    finishPick(null);
                    Toast.makeText(SurveyActivity.this, "Не удалось открыть камеру или выбор файла", Toast.LENGTH_LONG).show();
                }
                return true;
            }
        });
    }

    private boolean externalDocument(Uri uri) {
        if (uri == null || !"content".equals(uri.getScheme())) return false;
        android.content.pm.ProviderInfo provider = getPackageManager().resolveContentProvider(uri.getAuthority(), 0);
        // On Android 11+ an external provider may be hidden by package visibility.
        return !(getPackageName()+".photos").equals(uri.getAuthority())
            && !(getPackageName()+".files").equals(uri.getAuthority())
            && !(getPackageName()+".capture").equals(uri.getAuthority())
            && (provider == null || !getPackageName().equals(provider.packageName));
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        if (request != PICK) {
            super.onActivityResult(request, result, data);
            return;
        }
        ArrayList<Uri> selected = new ArrayList<>();
        if (result == Activity.RESULT_OK) {
            if (capture != null) {
                File photo = CaptureProvider.file(this, capture);
                if (photo != null && photo.length() > 0) selected.add(capture);
            } else if (data != null) {
                ClipData clip = data.getClipData();
                if (clip != null) {
                    for (int i=0; i<clip.getItemCount(); i++) {
                        Uri uri = clip.getItemAt(i).getUri();
                        if (externalDocument(uri)) selected.add(uri);
                    }
                } else if (externalDocument(data.getData())) selected.add(data.getData());
            }
        }
        finishPick(selected.isEmpty() ? null : selected.toArray(new Uri[0]));
    }

    private void finishPick(Uri[] result) {
        if (capture != null) {
            revokeUriPermission(capture, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (result == null) {
                File unused = CaptureProvider.file(this, capture);
                if (unused != null) unused.delete();
            }
            capture = null;
        }
        ValueCallback<Uri[]> callback = pending;
        pending = null;
        if (callback != null) callback.onReceiveValue(result);
    }

    @Override protected void onDestroy() {
        finishPick(null);
        super.onDestroy();
    }
}
