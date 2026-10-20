package com.kaadalgroup.toolbox;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

// Sign-in with a fingerprint or face (mobile/PLAN.md): the password is encrypted with a Keystore
// key that works only after the finger or face, so no page script can read it without one.
// Signing in itself is the site's ordinary password path.
@CapacitorPlugin(name = "BiometricSignIn")
public class BiometricSignInPlugin extends Plugin {

    private static final String KEY_ALIAS = "kaadal_sign_in";
    private static final String STORE = "biometric_sign_in";
    private static final int STRONG = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", BiometricManager.from(getContext()).canAuthenticate(STRONG) == BiometricManager.BIOMETRIC_SUCCESS);
        // A backup restored to another phone brings the stored email but not the key.
        String email = store().getString("email", null);
        if (email != null && !hasKey()) {
            clear();
            email = null;
        }
        result.put("email", email);
        call.resolve(result);
    }

    @PluginMethod
    public void save(PluginCall call) {
        String email = call.getString("email");
        String password = call.getString("password");
        if (email == null || email.isEmpty() || password == null || password.isEmpty()) {
            call.reject("Nothing to save.", "failed");
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (!onSignInPage(call)) return;
            Cipher cipher;
            try {
                clear();
                cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, newKey());
            } catch (Exception e) {
                call.reject("This phone can't keep a sign-in.", "failed", e);
                return;
            }
            prompt(call, cipher, "Save your sign-in", "Next time, sign in to Toolbox with your fingerprint or face.", "Not now", (done) -> {
                byte[] secret = done.doFinal(password.getBytes(StandardCharsets.UTF_8));
                store()
                    .edit()
                    .putString("email", email)
                    .putString("iv", Base64.encodeToString(done.getIV(), Base64.NO_WRAP))
                    .putString("secret", Base64.encodeToString(secret, Base64.NO_WRAP))
                    .apply();
                call.resolve();
            });
        });
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!onSignInPage(call)) return;
            SharedPreferences store = store();
            String email = store.getString("email", null);
            String iv = store.getString("iv", null);
            String secret = store.getString("secret", null);
            Cipher cipher;
            try {
                SecretKey key = existingKey();
                if (email == null || iv == null || secret == null || key == null) {
                    clear();
                    call.reject("No sign-in is saved on this phone.", "cleared");
                    return;
                }
                cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            } catch (KeyPermanentlyInvalidatedException e) {
                // A fingerprint or face was added or removed since: Android retires the key.
                clear();
                call.reject("The phone's fingerprints or face changed.", "cleared");
                return;
            } catch (Exception e) {
                clear();
                call.reject("The saved sign-in can't be read.", "cleared", e);
                return;
            }
            prompt(call, cipher, "Sign in to Toolbox", email, "Use password", (done) -> {
                String password = new String(done.doFinal(Base64.decode(secret, Base64.NO_WRAP)), StandardCharsets.UTF_8);
                JSObject result = new JSObject();
                result.put("email", email);
                result.put("password", password);
                call.resolve(result);
            });
        });
    }

    @PluginMethod
    public void forget(PluginCall call) {
        clear();
        call.resolve();
    }

    private interface Finish {
        void with(Cipher cipher) throws Exception;
    }

    private void prompt(PluginCall call, Cipher cipher, String title, String description, String cancel, Finish finish) {
        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setDescription(description)
            .setNegativeButtonText(cancel)
            .setAllowedAuthenticators(STRONG)
            .setConfirmationRequired(false)
            .build();
        BiometricPrompt prompt = new BiometricPrompt(
            getActivity(),
            ContextCompat.getMainExecutor(getContext()),
            new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                    BiometricPrompt.CryptoObject crypto = result.getCryptoObject();
                    try {
                        finish.with(crypto.getCipher());
                    } catch (Exception e) {
                        clear();
                        call.reject("The saved sign-in can't be read.", "cleared", e);
                    }
                }

                @Override
                public void onAuthenticationError(int code, @NonNull CharSequence message) {
                    boolean cancelled =
                        code == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                        code == BiometricPrompt.ERROR_USER_CANCELED ||
                        code == BiometricPrompt.ERROR_CANCELED;
                    call.reject(message.toString(), cancelled ? "cancelled" : "failed");
                }
            }
        );
        prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
    }

    // Only the site's own sign-in page may save or read the password; any other page, a
    // Dexter deck included, is refused here as well as by Capacitor's origin rule.
    private boolean onSignInPage(PluginCall call) {
        String page = getBridge().getWebView().getUrl();
        Uri url = page == null ? null : Uri.parse(page);
        String appHost = Uri.parse(getBridge().getServerUrl()).getHost();
        if (url != null && appHost != null && appHost.equalsIgnoreCase(url.getHost()) && "/login".equals(url.getPath())) {
            return true;
        }
        call.reject("Only the sign-in page can do this.", "failed");
        return false;
    }

    private SharedPreferences store() {
        return getContext().getSharedPreferences(STORE, Context.MODE_PRIVATE);
    }

    private boolean hasKey() {
        try {
            return existingKey() != null;
        } catch (Exception e) {
            return false;
        }
    }

    private SecretKey existingKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        Key key = keyStore.getKey(KEY_ALIAS, null);
        return key instanceof SecretKey ? (SecretKey) key : null;
    }

    private SecretKey newKey() throws Exception {
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(spec.build());
        return generator.generateKey();
    }

    private void clear() {
        store().edit().clear().apply();
        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            keyStore.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {
            // Nothing to delete.
        }
    }
}
