package fr.horlogemeteo;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;

/**
 * Opens the clock when the phone is plugged in and stands in landscape.
 * Runs as a discreet foreground service; the accelerometer is only read while charging,
 * and once the clock has been opened, not again until the phone is unplugged.
 */
public class DockService extends Service implements SensorEventListener {

    private static final long LANDSCAPE_DELAY_MS = 1500;   // must stay in landscape that long

    private SensorManager sensors;
    private Sensor accelerometer;
    private PowerManager.WakeLock cpu;
    private boolean listening;
    private boolean openedThisCharge;
    private long landscapeSince;

    static void start(Context c) {
        c.startForegroundService(new Intent(c, DockService.class));
    }

    static void stop(Context c) {
        c.stopService(new Intent(c, DockService.class));
    }

    private final BroadcastReceiver power = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent intent) {
            openedThisCharge = false;
            if (Intent.ACTION_POWER_CONNECTED.equals(intent.getAction())) startListening();
            else stopListening();
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        App.createChannels(this);
        Notification n = new Notification.Builder(this, App.CHANNEL_SERVICE)
                .setSmallIcon(R.drawable.ic_stat_alarm)
                .setContentTitle("Ouverture automatique en charge")
                .setContentText("L'horloge s'ouvre quand le téléphone est en charge et en paysage.")
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(App.NOTIF_SERVICE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(App.NOTIF_SERVICE, n);
        }
        sensors = getSystemService(SensorManager.class);
        accelerometer = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        cpu = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "horloge:dock");
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_POWER_CONNECTED);
        f.addAction(Intent.ACTION_POWER_DISCONNECTED);
        registerReceiver(power, f);
        if (isPlugged()) startListening();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopListening();
        unregisterReceiver(power);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private boolean isPlugged() {
        Intent battery = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        return battery != null && battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0;
    }

    private void startListening() {
        if (listening || openedThisCharge || accelerometer == null) return;
        listening = true;
        landscapeSince = 0;
        cpu.acquire(4 * 60 * 60 * 1000L); // charging: keeps the sensor readable while the screen is off
        sensors.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_NORMAL);
    }

    private void stopListening() {
        if (!listening) return;
        listening = false;
        sensors.unregisterListener(this);
        if (cpu.isHeld()) cpu.release();
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        float x = Math.abs(e.values[0]), y = Math.abs(e.values[1]);
        // Gravity along the phone's short side: it stands on its long edge (landscape).
        boolean landscape = x > 6.5f && x > y + 2f;
        long now = SystemClock.elapsedRealtime();
        if (!landscape) {
            landscapeSince = 0;
        } else if (landscapeSince == 0) {
            landscapeSince = now;
        } else if (now - landscapeSince >= LANDSCAPE_DELAY_MS) {
            openClock();
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    private void openClock() {
        openedThisCharge = true;
        stopListening();
        if (MainActivity.inForeground) return;
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Settings.canDrawOverlays(this)) {
            try {
                startActivity(open);
                return;
            } catch (RuntimeException ignored) {
                // fall back to the notification below
            }
        }
        // Without "display over other apps", Android only lets us open via a full-screen
        // notification (works when the phone is locked; otherwise a tap opens the clock).
        PendingIntent pi = PendingIntent.getActivity(this, 3, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, App.CHANNEL_OPEN)
                .setSmallIcon(R.drawable.ic_stat_alarm)
                .setContentTitle("Horloge Météo")
                .setContentText("Touchez pour afficher l'horloge")
                .setCategory(Notification.CATEGORY_REMINDER)
                .setFullScreenIntent(pi, true)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setTimeoutAfter(60 * 1000)
                .build();
        getSystemService(NotificationManager.class).notify(App.NOTIF_OPEN, n);
    }
}
