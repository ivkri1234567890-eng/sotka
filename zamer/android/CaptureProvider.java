package ru.zamer.smeta;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.UUID;

public final class CaptureProvider extends ContentProvider {
    private static File directory(Context context) { return new File(context.getCacheDir(), "survey-camera"); }
    static Uri create(Context context) throws IOException {
        File dir = directory(context);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("camera directory");
        File[] previous = dir.listFiles();
        if (previous != null) for (File f : previous)
            if (f.lastModified() < System.currentTimeMillis()-86400000L) f.delete();
        String name = UUID.randomUUID().toString()+".jpg";
        if (!new File(dir, name).createNewFile()) throw new IOException("camera file");
        return new Uri.Builder().scheme("content").authority(context.getPackageName()+".capture").appendPath(name).build();
    }
    static File file(Context context, Uri uri) {
        String name = uri.getLastPathSegment();
        if (uri.getPathSegments().size()!=1 || name==null || !name.matches("[a-f0-9-]{36}\\.jpg")) return null;
        return new File(directory(context), name);
    }
    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) { return "image/jpeg"; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File photo = file(getContext(), uri);
        if (photo == null || !photo.isFile()) throw new FileNotFoundException();
        return ParcelFileDescriptor.open(photo, ParcelFileDescriptor.parseMode(mode));
    }
    @Override public Cursor query(Uri uri, String[] columns, String where, String[] args, String order) {
        if (columns==null) columns = new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor cursor = new MatrixCursor(columns);
        File photo = file(getContext(), uri);
        if (photo == null || !photo.isFile()) return cursor;
        Object[] values = new Object[columns.length];
        for (int i=0;i<columns.length;i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) values[i]=photo.getName();
            if (OpenableColumns.SIZE.equals(columns[i])) values[i]=photo.length();
        }
        cursor.addRow(values);
        return cursor;
    }
    @Override public Uri insert(Uri u, ContentValues v) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri u, ContentValues v, String w, String[] a) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri u, String w, String[] a) { throw new UnsupportedOperationException(); }
}
