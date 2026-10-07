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
        } catch (SecurityException | JSONException e) {
            return "[]"; // permission withdrawn, or unreadable entry
        }
        return out.toString();
    }
}
