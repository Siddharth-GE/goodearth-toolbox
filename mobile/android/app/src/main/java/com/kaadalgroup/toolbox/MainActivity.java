package com.kaadalgroup.toolbox;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.widget.Toast;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends BridgeActivity {

    // A web view can't show a PDF or save a CSV, so prints and exports go through DownloadManager
    // with the session's cookies, then open in the phone's own viewer.
    private final Map<Long, String> downloads = new HashMap<>();
    private DownloadManager downloadManager;

    private final BroadcastReceiver downloadDone = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            String mimeType = downloads.remove(id);
            if (mimeType != null) openDownload(id, mimeType);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ExternalLinksPlugin.class);
        super.onCreate(savedInstanceState);
        downloadManager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        ContextCompat.registerReceiver(
            this,
            downloadDone,
            new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_EXPORTED
        );
        bridge.getWebView().setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
            startDownload(url, userAgent, contentDisposition, mimeType)
        );
    }

    // Google's sign-in returns to com.kaadalgroup.toolbox://auth/callback (lib/native/app.ts); the
    // code is finished on the site's own callback, in this web view, where its PKCE cookie lives.
    // Called by Capacitor at a cold start too.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Uri data = intent.getData();
        boolean fromRecents = (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0;
        if (data == null || fromRecents || bridge == null) return;
        if (!getPackageName().equals(data.getScheme()) || !"auth".equals(data.getHost()) || !"/callback".equals(data.getPath())) {
            return;
        }
        String query = data.getEncodedQuery();
        String callback = bridge.getServerUrl() + "/auth/callback" + (query == null ? "" : "?" + query);
        reloadOnReturn = false;
        bridge.getWebView().loadUrl(callback);
    }

    private boolean reloadOnReturn = false;

    void reloadOnReturn() {
        reloadOnReturn = true;
    }

    // Back from Google's tab without signing in (closed, or Google refused): the sign-in page
    // was left waiting for a hand-over that never came, so it starts fresh.
    @Override
    public void onResume() {
        super.onResume();
        if (reloadOnReturn) {
            reloadOnReturn = false;
            bridge.getWebView().reload();
        }
    }

    @Override
    public void onDestroy() {
        unregisterReceiver(downloadDone);
        super.onDestroy();
    }

    private void startDownload(String url, String userAgent, String contentDisposition, String mimeType) {
        if (!URLUtil.isHttpsUrl(url)) {
            Toast.makeText(this, "This file can't be saved in the app.", Toast.LENGTH_LONG).show();
            return;
        }
        String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
        // The same print downloaded twice replaces the old copy instead of piling up as name-1, name-2.
        new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName).delete();

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
            .setMimeType(mimeType)
            .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url))
            .addRequestHeader("User-Agent", userAgent)
            .setTitle(fileName)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);
        downloads.put(downloadManager.enqueue(request), mimeType);
        Toast.makeText(this, "Opening " + fileName + "…", Toast.LENGTH_SHORT).show();
    }

    private void openDownload(long id, String mimeType) {
        String localUri = null;
        try (Cursor cursor = downloadManager.query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor != null && cursor.moveToFirst()) {
                int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    localUri = cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI));
                }
            }
        }
        if (localUri == null) {
            Toast.makeText(this, "The file didn't download. Check your connection and try again.", Toast.LENGTH_LONG).show();
            return;
        }

        File file = new File(Uri.parse(localUri).getPath());
        Uri shared = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
        Intent view = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(shared, mimeType)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(view);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Saved. No app on this phone opens it; find it in your notifications.", Toast.LENGTH_LONG).show();
        }
    }
}
