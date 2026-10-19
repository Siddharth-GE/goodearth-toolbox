package com.kaadalgroup.toolbox;

import android.content.ActivityNotFoundException;
import android.net.Uri;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

// Other sites open in a Chrome tab over the app rather than in Chrome itself: Google's sign-in
// must run in a real browser and hand back to the app, and a WorkDrive or product link closes
// back to where the person was.
@CapacitorPlugin(name = "ExternalLinks")
public class ExternalLinksPlugin extends Plugin {

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        String scheme = url.getScheme();
        if (!"https".equals(scheme) && !"http".equals(scheme)) return null;
        String appHost = Uri.parse(getBridge().getServerUrl()).getHost();
        if (appHost != null && appHost.equalsIgnoreCase(url.getHost())) return null;

        int burgundy = ContextCompat.getColor(getContext(), R.color.kaadal_burgundy);
        CustomTabsIntent tab = new CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(new CustomTabColorSchemeParams.Builder().setToolbarColor(burgundy).build())
            .setShowTitle(true)
            .build();
        try {
            tab.launchUrl(getActivity(), url);
            // Sign-in hands over to Google by leaving the page, which never happens here; the page
            // is left waiting, so it reloads when the person comes back (MainActivity.onResume).
            String page = getBridge().getWebView().getUrl();
            String path = page == null ? null : Uri.parse(page).getPath();
            if (path != null && path.startsWith("/login")) {
                ((MainActivity) getActivity()).reloadOnReturn();
            }
            return true;
        } catch (ActivityNotFoundException e) {
            return null; // no browser at all: Capacitor's own handling says so its way
        }
    }
}
