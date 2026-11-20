package ru.sotka.forma;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** Сохранение файла в папку, выбранную пользователем (системный диалог Android, Storage Access Framework). Разрешений не требует. */
@CapacitorPlugin(name = "FormaFiles")
public class FormaFilesPlugin extends Plugin {
    @PluginMethod
    public void saveAs(PluginCall call) {
        String name = call.getString("name", "forma.bin");
        String mime = call.getString("mime", "application/octet-stream");
        // данные передаются через файл во временной папке приложения, а не через параметры вызова:
        // параметры сохраняются Android при уходе в системный диалог и не должны быть большими
        String path = call.getString("path");
        if (path == null || !new File(path).exists()) { call.reject("Нет временного файла"); return; }
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(mime);
        i.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, i, "onSaved");
    }

    @ActivityCallback
    private void onSaved(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject o = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            o.put("saved", false); o.put("uri", ""); call.resolve(o); return;
        }
        Uri uri = result.getData().getData();
        File src = new File(call.getString("path"));
        try (InputStream in = new FileInputStream(src); OutputStream os = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            byte[] buf = new byte[65536]; int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
        } catch (Exception e) {
            call.reject("Не удалось записать файл: " + e.getMessage()); return;
        }
        src.delete();
        o.put("saved", true); o.put("uri", uri.toString()); call.resolve(o);
    }
}
