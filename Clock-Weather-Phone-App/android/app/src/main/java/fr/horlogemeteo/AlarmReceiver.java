package fr.horlogemeteo;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * System alarm clock. The page hands over its next ring time (setNextAlarm); at that time Android
 * wakes the phone and this receiver brings the app to the front, over the lock screen, where the
 * page rings (beeps or radio). Until it does, a full-screen notification plays the system alarm sound.
 */
public class AlarmReceiver extends BroadcastReceiver {

    static void schedule(Context c, long at) {
        App.setNextAlarm(c, at);
        AlarmManager am = c.getSystemService(AlarmManager.class);
        PendingIntent op = PendingIntent.getBroadcast(c, 0,
                new Intent(c, AlarmReceiver.class).putExtra(App.EXTRA_RING_AT, at),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (at <= System.currentTimeMillis()) {
            am.cancel(op);
            return;
        }
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, op);
            return;
        }
        PendingIntent show = PendingIntent.getActivity(c, 1, new Intent(c, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), op);
    }

    /** After a reboot or an update, the system forgets alarms: schedule the saved one again. */
    static void restore(Context c) {
        long at = App.nextAlarm(c);
        if (at > System.currentTimeMillis()) schedule(c, at);
    }

    static void cancelNotification(Context c) {
        c.getSystemService(NotificationManager.class).cancel(App.NOTIF_ALARM);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        long at = intent.getLongExtra(App.EXTRA_RING_AT, System.currentTimeMillis());
        if (MainActivity.inForeground) return; // the page is running and rings by itself

        App.setPendingRing(c, at);
        App.createChannels(c);
        Intent open = new Intent(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(App.EXTRA_RING_AT, at);
        PendingIntent pi = PendingIntent.getActivity(c, 2, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String time = new SimpleDateFormat("HH:mm", Locale.FRANCE).format(new Date(at));
        Notification n = new Notification.Builder(c, App.CHANNEL_ALARM)
                .setSmallIcon(R.drawable.ic_stat_alarm)
                .setContentTitle("Réveil " + time)
                .setContentText("Touchez pour ouvrir Horloge Météo")
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setFullScreenIntent(pi, true)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        n.flags |= Notification.FLAG_INSISTENT; // repeat the sound until the app takes over
        c.getSystemService(NotificationManager.class).notify(App.NOTIF_ALARM, n);
        try {
            c.startActivity(open);
        } catch (RuntimeException ignored) {
            // Background start refused: the full-screen notification opens the app instead.
        }
    }
}
