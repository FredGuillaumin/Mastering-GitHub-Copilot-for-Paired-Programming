package fr.horlogemeteo;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;

/** Shared preferences and notification channels. */
final class App {
    private App() {}

    static final String CHANNEL_ALARM = "alarm";
    static final String CHANNEL_OPEN = "open";
    static final String CHANNEL_SERVICE = "service";

    static final int NOTIF_ALARM = 1;
    static final int NOTIF_OPEN = 2;
    static final int NOTIF_SERVICE = 3;

    static final String EXTRA_RING_AT = "ringAt";

    private static final String KEY_NEXT_ALARM = "nextAlarm";
    private static final String KEY_PENDING_RING = "pendingRing";
    private static final String KEY_AUTO_START = "autoStart";

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("horloge", Context.MODE_PRIVATE);
    }

    static long nextAlarm(Context c) { return prefs(c).getLong(KEY_NEXT_ALARM, 0); }
    static void setNextAlarm(Context c, long at) { prefs(c).edit().putLong(KEY_NEXT_ALARM, at).apply(); }

    /** Scheduled time of the alarm that woke the app up, read once by the page. */
    static long takePendingRing(Context c) {
        long at = prefs(c).getLong(KEY_PENDING_RING, 0);
        if (at != 0) prefs(c).edit().remove(KEY_PENDING_RING).apply();
        return at;
    }
    static void setPendingRing(Context c, long at) { prefs(c).edit().putLong(KEY_PENDING_RING, at).commit(); }

    static boolean autoStart(Context c) { return prefs(c).getBoolean(KEY_AUTO_START, true); }
    static void setAutoStart(Context c, boolean on) { prefs(c).edit().putBoolean(KEY_AUTO_START, on).apply(); }

    static void createChannels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);

        // Alarm: system alarm sound as a safety net until the app itself rings (then cancelled).
        NotificationChannel alarm = new NotificationChannel(CHANNEL_ALARM, "Réveil", NotificationManager.IMPORTANCE_HIGH);
        alarm.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        alarm.enableVibration(true);
        alarm.setBypassDnd(true);
        nm.createNotificationChannel(alarm);

        NotificationChannel open = new NotificationChannel(CHANNEL_OPEN, "Ouverture en charge", NotificationManager.IMPORTANCE_HIGH);
        open.setSound(null, null);
        open.enableVibration(false);
        nm.createNotificationChannel(open);

        NotificationChannel service = new NotificationChannel(CHANNEL_SERVICE, "Surveillance de la charge", NotificationManager.IMPORTANCE_MIN);
        service.setShowBadge(false);
        nm.createNotificationChannel(service);
    }
}
