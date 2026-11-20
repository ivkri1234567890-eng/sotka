package ru.sotka.forma;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

/** Сохранение файла в папку, выбранную пользователем (системный диалог Android, Storage Access Framework). Разрешений не требует. */
@CapacitorPlugin(name = "FormaFiles")
public class FormaFilesPlugin extends Plugin {
    @PluginMethod
    public void saveAs(PluginCall call) {
        String name = call.getString("name", "forma.bin");
        String mime = call.getString("mime", "application/octet-stream");
        if (call.getString("base64") == null) { call.reject("Нет данных файла"); return; }
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
        try (OutputStream os = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            os.write(Base64.decode(call.getString("base64"), Base64.DEFAULT));
        } catch (Exception e) {
            call.reject("Не удалось записать файл: " + e.getMessage()); return;
        }
        o.put("saved", true); o.put("uri", uri.toString()); call.resolve(o);
    }
}
