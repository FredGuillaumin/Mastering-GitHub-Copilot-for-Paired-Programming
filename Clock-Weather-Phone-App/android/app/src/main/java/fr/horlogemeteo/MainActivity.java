package fr.horlogemeteo;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.media.AudioManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Fullscreen clock: the web interface (assets/www) in a WebView, shown over the lock screen,
 * with a bridge (window.HorlogeAndroid) for what a web page cannot do on its own.
 */
public class MainActivity extends Activity {

    static volatile boolean inForeground;

    // The interface is served from the APK under an https origin (secure context:
    // localStorage, geolocation and https requests behave as on the web).
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/www/index.html";
    private static final int REQ_PERMISSIONS = 1;

    private WebView web;
    private BroadcastReceiver batteryReceiver;
    private Intent lastBattery;
    private GeolocationPermissions.Callback pendingGeo;
    private String pendingGeoOrigin;
    private boolean permissionRequestRunning;
    private int volumeBeforeRing = -1;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        App.createChannels(this);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        setContentView(web);
        hideSystemBars();
        keepClearOfCameraCutout();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // the alarm rings without a first tap
        s.setGeolocationEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.setWebViewClient(new AssetClient());
        web.setWebChromeClient(new Chrome());
        web.addJavascriptInterface(new Bridge(), "HorlogeAndroid");

        handleIntent(getIntent());
        web.loadUrl(START_URL);

        requestStartupPermissions();
        if (App.autoStart(this)) DockService.start(this);
        registerBack();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        long at = intent.getLongExtra(App.EXTRA_RING_AT, 0);
        if (at != 0) App.setPendingRing(this, at); // read by the page (consumePendingRing)
    }

    @Override
    protected void onResume() {
        super.onResume();
        inForeground = true;
        web.onResume();
        hideSystemBars();
        startBatteryUpdates();
        web.evaluateJavascript("window.onNativeResume && window.onNativeResume()", null);
    }

    @Override
    protected void onPause() {
        inForeground = false;
        stopBatteryUpdates();
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    // ---------------------------------------------------------------- display

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    /** Keeps the page away from the camera hole (the app draws edge to edge). */
    private void keepClearOfCameraCutout() {
        if (Build.VERSION.SDK_INT < 30) return;
        web.setOnApplyWindowInsetsListener((v, insets) -> {
            Insets cut = insets.getInsets(WindowInsets.Type.displayCutout());
            v.setPadding(cut.left, cut.top, cut.right, cut.bottom);
            return insets;
        });
    }

    private void registerBack() {
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::onBack);
        }
    }

    // Only reached on Android 12 and below: from 13 on, Back goes through registerBack().
    @SuppressLint("GestureBackNavigation")
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        onBack();
    }

    /** Back: closes the settings if open, otherwise sends the clock to the background (kept alive). */
    private void onBack() {
        web.evaluateJavascript("!!(window.onNativeBack && window.onNativeBack())", handled -> {
            if (!"true".equals(handled)) moveTaskToBack(true);
        });
    }

    // ---------------------------------------------------------------- battery

    private void startBatteryUpdates() {
        if (batteryReceiver != null) return;
        batteryReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                lastBattery = intent;
                pushBattery();
            }
        };
        lastBattery = registerReceiver(batteryReceiver, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        pushBattery();
    }

    private void stopBatteryUpdates() {
        if (batteryReceiver == null) return;
        unregisterReceiver(batteryReceiver);
        batteryReceiver = null;
    }

    private void pushBattery() {
        Intent b = lastBattery;
        if (b == null) return;
        int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        boolean plugged = b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0;
        if (level < 0 || scale <= 0) return;
        web.evaluateJavascript("window.onNativeBattery && window.onNativeBattery("
                + (level / (double) scale) + "," + plugged + ")", null);
    }

    // ---------------------------------------------------------------- permissions

    private void requestStartupPermissions() {
        List<String> missing = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (missing.isEmpty()) return;
        permissionRequestRunning = true;
        requestPermissions(missing.toArray(new String[0]), REQ_PERMISSIONS);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        permissionRequestRunning = false;
        answerGeolocation();
    }

    private boolean hasLocation() {
        return checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void answerGeolocation() {
        if (pendingGeo == null) return;
        pendingGeo.invoke(pendingGeoOrigin, hasLocation(), false);
        pendingGeo = null;
    }

    // ---------------------------------------------------------------- WebView plumbing

    private class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!HOST.equals(url.getHost())) return null; // weather, radio...: normal network
            String path = url.getPath() == null ? "" : url.getPath().replaceFirst("^/", "");
            try {
                return new WebResourceResponse(mimeType(path), "UTF-8", getAssets().open(path));
            } catch (IOException e) {
                WebResourceResponse notFound = new WebResourceResponse("text/plain", "UTF-8", null);
                notFound.setStatusCodeAndReasonPhrase(404, "Not Found");
                return notFound;
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (HOST.equals(request.getUrl().getHost())) return false;
            startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); // external links: browser
            return true;
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            recreate(); // the page crashed or was killed for memory: start again
            return true;
        }
    }

    private static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".json") || path.endsWith(".webmanifest")) return "application/json";
        return "application/octet-stream";
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (hasLocation()) {
                callback.invoke(origin, true, false);
                return;
            }
            pendingGeo = callback;
            pendingGeoOrigin = origin;
            if (!permissionRequestRunning) {
                permissionRequestRunning = true;
                requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_PERMISSIONS);
            }
        }
    }

    // ---------------------------------------------------------------- bridge for the page

    private class Bridge {
        @JavascriptInterface
        public void keepScreenOn(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public void requestBattery() {
            runOnUiThread(MainActivity.this::pushBattery);
        }

        @JavascriptInterface
        public void setNextAlarm(String epochMillis) {
            long at;
            try {
                at = Long.parseLong(epochMillis);
            } catch (NumberFormatException e) {
                return;
            }
            AlarmReceiver.schedule(MainActivity.this, at);
        }

        @JavascriptInterface
        public String consumePendingRing() {
            AlarmReceiver.cancelNotification(MainActivity.this); // the page takes over from here
            return Long.toString(App.takePendingRing(MainActivity.this));
        }

        /** Alarm ringing: make sure the media volume (used by the page) is audible. */
        @JavascriptInterface
        public void ringStarted() {
            AlarmReceiver.cancelNotification(MainActivity.this);
            AudioManager am = getSystemService(AudioManager.class);
            int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int current = am.getStreamVolume(AudioManager.STREAM_MUSIC);
            int minimum = (int) Math.ceil(max * 0.4);
            if (current < minimum) {
                try {
                    am.setStreamVolume(AudioManager.STREAM_MUSIC, minimum, 0);
                    volumeBeforeRing = current;
                } catch (SecurityException ignored) {
                    // Do Not Disturb may forbid it
                }
            }
        }

        @JavascriptInterface
        public void ringStopped() {
            AlarmReceiver.cancelNotification(MainActivity.this);
            if (volumeBeforeRing < 0) return;
            try {
                getSystemService(AudioManager.class).setStreamVolume(AudioManager.STREAM_MUSIC, volumeBeforeRing, 0);
            } catch (SecurityException ignored) {
                // ignore
            }
            volumeBeforeRing = -1;
        }

        @JavascriptInterface
        public boolean getAutoStart() {
            return App.autoStart(MainActivity.this);
        }

        @JavascriptInterface
        public void setAutoStart(boolean on) {
            App.setAutoStart(MainActivity.this, on);
            if (on) DockService.start(MainActivity.this);
            else DockService.stop(MainActivity.this);
        }

        @JavascriptInterface
        public boolean canDrawOverlays() {
            return Settings.canDrawOverlays(MainActivity.this);
        }

        @JavascriptInterface
        public void openOverlaySettings() {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName())));
        }

        /** Notifications allowed and, on Android 14+, full-screen notifications allowed. */
        @JavascriptInterface
        public boolean canRingWhenLocked() {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (!nm.areNotificationsEnabled()) return false;
            return Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent();
        }

        @JavascriptInterface
        public void openFullScreenSettings() {
            NotificationManager nm = getSystemService(NotificationManager.class);
            Intent i;
            if (nm.areNotificationsEnabled() && Build.VERSION.SDK_INT >= 34) {
                i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getPackageName()));
            } else {
                i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            }
            startActivity(i);
        }
    }
}
