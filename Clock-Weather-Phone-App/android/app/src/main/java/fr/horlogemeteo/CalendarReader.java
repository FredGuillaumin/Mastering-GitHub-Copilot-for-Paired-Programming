package fr.horlogemeteo;

import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import android.provider.CalendarContract.Instances;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Upcoming events from the calendars synced on the phone (Google Agenda of the Gmail account,
 * and any other visible calendar). Read locally: no Google sign-in needed, works offline.
 */
final class CalendarReader {
    private CalendarReader() {}

    private static final int MAX_EVENTS = 20;

    /** Last read error, shown in the settings to help diagnose (null when fine). */
    private static volatile String lastError;

    /** JSON array of {title, begin, end, allDay, color} between two epoch times, earliest first. */
    static String events(Context c, long from, long to) {
        Uri.Builder uri = Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(uri, from);
        ContentUris.appendId(uri, to);
        String[] projection = {
                Instances.TITLE, Instances.BEGIN, Instances.END, Instances.ALL_DAY,
                Instances.DISPLAY_COLOR, Instances.SELF_ATTENDEE_STATUS,
        };
        JSONArray out = new JSONArray();
        try (Cursor cur = c.getContentResolver().query(uri.build(), projection,
                Instances.VISIBLE + "=1", null, Instances.BEGIN + " ASC")) {
            while (cur != null && cur.moveToNext() && out.length() < MAX_EVENTS) {
                if (cur.getInt(5) == CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED) continue;
                JSONObject e = new JSONObject();
                e.put("title", cur.isNull(0) ? "" : cur.getString(0));
                e.put("begin", cur.getLong(1));
                e.put("end", cur.getLong(2));
                e.put("allDay", cur.getInt(3) == 1);
                e.put("color", String.format("#%06x", cur.getInt(4) & 0xFFFFFF));
                out.put(e);
            }
            lastError = null;
        } catch (RuntimeException | JSONException e) { // permission withdrawn, provider error...
            lastError = e.getClass().getSimpleName() + ": " + e.getMessage();
            return "[]";
        }
        return out.toString();
    }

    /** Diagnostic for the settings: visible calendars on the phone and their accounts. */
    static String info(Context c) {
        JSONObject o = new JSONObject();
        try {
            JSONArray accounts = new JSONArray();
            int visible = 0, total = 0;
            String[] projection = {CalendarContract.Calendars.ACCOUNT_NAME, CalendarContract.Calendars.VISIBLE};
            try (Cursor cur = c.getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, projection, null, null, null)) {
                while (cur != null && cur.moveToNext()) {
                    total++;
                    if (cur.getInt(1) != 1) continue;
                    visible++;
                    String account = cur.getString(0);
                    boolean known = false;
                    for (int i = 0; i < accounts.length(); i++) known |= accounts.getString(i).equals(account);
                    if (!known && account != null) accounts.put(account);
                }
            }
            o.put("calendars", visible);
            o.put("hidden", total - visible);
            o.put("accounts", accounts);
            if (lastError != null) o.put("error", lastError);
        } catch (RuntimeException | JSONException e) {
            try { o.put("error", e.getClass().getSimpleName() + ": " + e.getMessage()); } catch (JSONException ignored) { }
        }
        return o.toString();
    }
}
