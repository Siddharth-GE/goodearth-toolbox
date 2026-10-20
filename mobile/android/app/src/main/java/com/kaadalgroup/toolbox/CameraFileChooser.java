package com.kaadalgroup.toolbox;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Parcelable;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

// A page asking for a picture gets the camera beside the phone's picker, as Chrome offers. Other
// files, and a page asking for the camera outright, keep Capacitor's own handling. The phone's camera
// app takes the shot, so the app asks no camera permission.
class CameraFileChooser extends BridgeWebChromeClient {

    private final Activity activity;
    private final ActivityResultLauncher<Intent> launcher;
    private ValueCallback<Uri[]> pending;
    private File shot;
    private Uri shotUri;

    CameraFileChooser(Bridge bridge) {
        super(bridge);
        activity = bridge.getActivity();
        launcher = bridge.registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result ->
            finish(result.getResultCode(), result.getData())
        );
    }

    @Override
    public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (params.isCaptureEnabled() || !acceptsImages(params.getAcceptTypes())) {
            return super.onShowFileChooser(webView, callback, params);
        }
        Intent camera = cameraIntent();
        if (camera == null) return super.onShowFileChooser(webView, callback, params);

        Intent picker = params.createIntent();
        String[] types = mimeTypes(params.getAcceptTypes());
        if (types.length > 1) {
            picker.setType("*/*");
            picker.putExtra(Intent.EXTRA_MIME_TYPES, types);
        }
        if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

        Intent chooser = Intent.createChooser(picker, "Add a picture").putExtra(
            Intent.EXTRA_INITIAL_INTENTS,
            new Parcelable[] { camera }
        );
        if (pending != null) pending.onReceiveValue(null);
        pending = callback;
        try {
            launcher.launch(chooser);
        } catch (ActivityNotFoundException e) {
            pending = null;
            callback.onReceiveValue(null);
        }
        return true;
    }

    private Intent cameraIntent() {
        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (camera.resolveActivity(activity.getPackageManager()) == null) return null;
        File folder = new File(activity.getCacheDir(), "camera");
        // Each shot is read once, at upload, so the last one is dropped when the next is taken.
        File[] old = folder.listFiles();
        if (old != null) for (File file : old) file.delete();
        try {
            if (!folder.isDirectory() && !folder.mkdirs()) return null;
            shot = File.createTempFile("photo-", ".jpg", folder);
        } catch (IOException e) {
            return null;
        }
        shotUri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", shot);
        camera.putExtra(MediaStore.EXTRA_OUTPUT, shotUri);
        camera.setClipData(ClipData.newRawUri("", shotUri));
        camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return camera;
    }

    private void finish(int resultCode, Intent data) {
        ValueCallback<Uri[]> callback = pending;
        pending = null;
        if (callback == null) return;
        if (resultCode != Activity.RESULT_OK) {
            callback.onReceiveValue(null);
            return;
        }
        if (data != null && data.getClipData() != null && data.getData() == null) {
            ClipData clip = data.getClipData();
            Uri[] uris = new Uri[clip.getItemCount()];
            for (int i = 0; i < uris.length; i++) uris[i] = clip.getItemAt(i).getUri();
            callback.onReceiveValue(uris);
        } else if (data != null && data.getData() != null) {
            callback.onReceiveValue(new Uri[] { data.getData() });
        } else if (shot != null && shot.length() > 0) {
            // The camera returns nothing; the picture is in the file it was handed.
            callback.onReceiveValue(new Uri[] { shotUri });
        } else {
            callback.onReceiveValue(null);
        }
    }

    private static boolean acceptsImages(String[] types) {
        for (String type : types) {
            String t = type.trim().toLowerCase();
            if (t.startsWith("image/") || t.equals(".jpg") || t.equals(".jpeg") || t.equals(".png")) return true;
        }
        return false;
    }

    private static String[] mimeTypes(String[] types) {
        List<String> out = new ArrayList<>();
        for (String type : types) {
            String t = type.trim().toLowerCase();
            if (t.contains("/") && !out.contains(t)) out.add(t);
        }
        return out.toArray(new String[0]);
    }
}
