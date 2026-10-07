'use strict';

/* ================= Persistence ================= */
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('cw.' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('cw.' + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

const state = {
  brightness: store.get('brightness', 35),     // %, used when the schedule below is off
  // Brightness by time of day: nightLevel from `night`, dayLevel from `day`
  dimSchedule: Object.assign({ on: true, night: '22:30', nightLevel: 20, day: '07:00', dayLevel: 100 }, store.get('dimSchedule', {})),
  clockStyle: store.get('clockStyle', 'analog'), // 'analog' | 'digital'
  color: store.get('color', '#a0a0a0'),          // text color
  secondHand: store.get('secondHand', true),     // red second hand on the analog dial
  showAgenda: store.get('showAgenda', true),     // Android app: next events under the weather
  colorIcons: store.get('colorIcons', true),     // weather symbol in natural colors
  onlyCharging: store.get('onlyCharging', true),  // release the screen when unplugged
  alarms: store.get('alarms', []),             // [{id, time:'07:00', days:[1..5], enabled, label}]
  location: store.get('location', null),       // {lat, lon, name, auto}
  weather: store.get('weather', null),         // {data, fetchedAt}
};

const $ = (sel) => document.querySelector(sel);

// Bridge to the Android app (APK); null when running in a browser.
const NATIVE = window.HorlogeAndroid || null;
const pad = (n) => String(n).padStart(2, '0');
const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']; // index = Date#getDay()
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];                 // displayed Monday first

/* ================= Brightness ================= */
// Text color + darker shades of it for secondary text and lines.
function applyColor() {
  const n = parseInt(state.color.slice(1), 16);
  const shade = (k) => `rgb(${Math.round(((n >> 16) & 255) * k)}, ${Math.round(((n >> 8) & 255) * k)}, ${Math.round((n & 255) * k)})`;
  const root = document.documentElement.style;
  root.setProperty('--fg', state.color);
  root.setProperty('--fg-soft', shade(0.66));
  root.setProperty('--fg-faint', shade(0.36));
  root.setProperty('--line', shade(0.14));
}

function renderColorChoice() {
  let preset = false;
  document.querySelectorAll('.swatch').forEach((b) => {
    b.style.setProperty('--c', b.dataset.color);
    const on = b.dataset.color === state.color;
    b.classList.toggle('on', on);
    preset = preset || on;
  });
  $('#custom-color').value = state.color;
  $('#custom-color').classList.toggle('on', !preset);
}

function setColor(color) {
  state.color = color;
  store.set('color', color);
  applyColor();
  renderColorChoice();
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function isNightTime(now) {
  const s = state.dimSchedule;
  const m = now.getHours() * 60 + now.getMinutes();
  const night = toMinutes(s.night), day = toMinutes(s.day);
  if (night === day) return false;
  return night > day ? (m >= night || m < day) : (m >= night && m < day); // e.g. 22:30 -> 07:00
}

function currentBrightness(now) {
  const s = state.dimSchedule;
  if (!s.on) return state.brightness;
  return isNightTime(now) ? s.nightLevel : s.dayLevel;
}

function setDim(level) {
  document.documentElement.style.setProperty('--dim', (level / 100).toFixed(2));
}

function applyBrightness() {
  setDim(currentBrightness(new Date()));
}

// While a level slider moves, show that level for a moment, then go back to the current one.
let previewTimer = null;
function previewBrightness(level) {
  setDim(level);
  clearTimeout(previewTimer);
  previewTimer = setTimeout(applyBrightness, 2500);
}

/* ================= Clock ================= */
const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function buildDial() {
  let s = '';
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const a = (i * Math.PI) / 30;
    const r1 = major ? 80 : 88, r2 = 92;
    if (!major) {
      s += `<circle class="tick" cx="${(100 + Math.sin(a) * 90).toFixed(1)}" cy="${(100 - Math.cos(a) * 90).toFixed(1)}" r="0.6"/>`;
      continue;
    }
    s += `<line class="tick major" x1="${(100 + Math.sin(a) * r1).toFixed(1)}" y1="${(100 - Math.cos(a) * r1).toFixed(1)}" x2="${(100 + Math.sin(a) * r2).toFixed(1)}" y2="${(100 - Math.cos(a) * r2).toFixed(1)}"/>`;
  }
  $('#ticks').innerHTML = s;
}

let shownMinute = '';

// Sweeping second hand: a 60 s CSS rotation (smooth and cheap), re-synchronised with the
// real clock every minute and whenever the app comes back to the foreground.
function syncSecondHand() {
  $('#analog').classList.toggle('no-second', !state.secondHand);
  const hand = $('#hand-s');
  const now = new Date();
  hand.style.animation = 'none';
  void hand.getBoundingClientRect(); // restart the animation
  hand.style.animation = '';
  hand.style.animationDelay = `-${now.getSeconds() + now.getMilliseconds() / 1000}s`;
}

function renderClock(now, force) {
  const key = `${now.getHours()}:${now.getMinutes()}`;
  if (key === shownMinute && !force) return;
  shownMinute = key;
  syncSecondHand();
  applyBrightness(); // brightness schedule (night / day)
  renderAgenda(now);
  $('.clock').classList.toggle('analog', state.clockStyle === 'analog');
  $('.clock').classList.toggle('digital', state.clockStyle !== 'analog');
  $('#hhmm').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const h = now.getHours() % 12, m = now.getMinutes();
  $('#hand-h').setAttribute('transform', `rotate(${h * 30 + m * 0.5} 100 100)`);
  $('#hand-m').setAttribute('transform', `rotate(${m * 6} 100 100)`);
  $('#date').textContent = dateFmt.format(now);
  renderNextAlarm(now);
}

function tick() {
  const now = new Date();
  renderClock(now);
  checkAlarms(now);
}

function scheduleTick() {
  tick();
  setTimeout(scheduleTick, 1000 - (Date.now() % 1000) + 5);
}

/* ================= Screen wake lock & fullscreen ================= */
let wakeLock = null;
let wakeLockPending = false;

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock || wakeLockPending) return;
  wakeLockPending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
    wakeLock = lock;
    if (!screenShouldStayOn()) updateWakeLock(); // unplugged while the request was pending
  } catch { /* refused (battery saver, etc.) */ }
  wakeLockPending = false;
}

// Nightstand mode: keep the screen on while charging (or while an alarm rings).
let charging = null; // null = unknown (Battery API not available, e.g. iPhone)

function screenShouldStayOn() {
  return !!ringing || !state.onlyCharging || charging !== false;
}

function updateWakeLock() {
  if (NATIVE) { NATIVE.keepScreenOn(screenShouldStayOn()); return; }
  if (screenShouldStayOn()) requestWakeLock();
  else if (wakeLock) { wakeLock.release(); wakeLock = null; }
}

// Battery symbol under the weather: level, yellow bolt while charging, red when low.
function renderBattery(battery) {
  const el = $('#battery');
  if (typeof battery.level !== 'number' || Number.isNaN(battery.level)) { el.hidden = true; return; }
  const pct = Math.round(battery.level * 100);
  const w = Math.max(1, 18 * battery.level).toFixed(1);
  el.innerHTML = '<svg class="cell" viewBox="0 0 28 14" aria-hidden="true">'
    + '<rect x="1" y="1" width="22" height="12" rx="2.5"/><rect class="nub" x="24" y="4.5" width="2.5" height="5" rx="1"/>'
    + `<rect class="level" x="3" y="3" width="${w}" height="8" rx="1"/></svg>`
    + (battery.charging ? '<svg class="bolt" viewBox="0 0 12 16" aria-hidden="true"><path d="M7 0L1 9h4l-1 7 7-10H7z"/></svg>' : '');
  el.append(`${pct} %`);
  el.classList.toggle('low', !battery.charging && pct <= 15);
  el.setAttribute('aria-label', `Batterie ${pct} %${battery.charging ? ', en charge' : ''}`);
  el.hidden = false;
}

async function watchBattery() {
  if (NATIVE) {
    window.onNativeBattery = (level, isCharging) => {
      charging = isCharging;
      updateWakeLock();
      renderBattery({ level, charging: isCharging });
    };
    NATIVE.requestBattery();
    return;
  }
  if (!navigator.getBattery) return;
  try {
    const battery = await navigator.getBattery();
    const update = () => { charging = battery.charging; updateWakeLock(); renderBattery(battery); };
    battery.addEventListener('chargingchange', update);
    battery.addEventListener('levelchange', () => renderBattery(battery));
    update();
  } catch { /* not available */ }
}

function enterFullscreen() {
  if (NATIVE) return; // the Android app is always fullscreen
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req && !document.fullscreenElement) {
    try { const p = req.call(el, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch { /* not supported */ }
  }
}

/* ================= Sound ================= */
let audioCtx = null;

function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx && AC) audioCtx = new AC();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
}

function beep(at, freq, dur, volume) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

// A pattern of three soft notes, repeated every 1.5 s with a volume that rises slowly.
function playPattern(volume) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime + 0.05;
  beep(t, 660, 0.18, volume);
  beep(t + 0.25, 880, 0.18, volume);
  beep(t + 0.5, 990, 0.3, volume);
}

/* ================= Radio ================= */
const STATIONS = [
  ['franceinter', 'France Inter', 'https://icecast.radiofrance.fr/franceinter-midfi.mp3'],
  ['franceinfo', 'franceinfo', 'https://icecast.radiofrance.fr/franceinfo-midfi.mp3'],
  ['franceculture', 'France Culture', 'https://icecast.radiofrance.fr/franceculture-midfi.mp3'],
  ['francemusique', 'France Musique', 'https://icecast.radiofrance.fr/francemusique-midfi.mp3'],
  ['fip', 'FIP', 'https://icecast.radiofrance.fr/fip-midfi.mp3'],
  ['mouv', 'Mouv\'', 'https://icecast.radiofrance.fr/mouv-midfi.mp3'],
  ['rtl', 'RTL', 'https://icecast.rtl.fr/rtl-1-44-128'],
  ['europe1', 'Europe 1', 'https://europe1.lmn.fm/europe1.mp3'],
  ['rmc', 'RMC', 'https://audio.bfmtv.com/rmcradio_128.mp3'],
  ['radioclassique', 'Radio Classique', 'https://radioclassique.ice.infomaniak.ch/radioclassique-high.mp3'],
  ['tsfjazz', 'TSF Jazz', 'https://tsfjazz.ice.infomaniak.ch/tsfjazz-high.mp3'],
  ['nrj', 'NRJ', 'https://scdn.nrjaudio.fm/adwz2/fr/30001/mp3_128.mp3'],
  ['rfm', 'RFM', 'https://stream.rfm.fr/rfm.mp3'],
  ['skyrock', 'Skyrock', 'https://icecast.skyrock.net/s/natio_mp3_128k'],
  ['fg', 'Radio FG', 'https://radiofg.impek.com/fg'],
].map(([id, name, url]) => ({ id, name, url }));

const RADIO_START_TIMEOUT_MS = 12000;   // no stream after this: fall back to the beeps
let radio = null;                       // <audio> currently playing (alarm or preview)
let previewing = null;                  // alarm being previewed in the settings

function stationUrl(alarm) {
  if (alarm.sound === 'custom') return alarm.customUrl || null;
  const s = STATIONS.find((x) => x.id === alarm.sound);
  return s ? s.url : null;
}

// Starts a stream; resolves to true once sound actually plays, false on failure/timeout.
function playRadio(url, volume) {
  stopRadio();
  const a = new Audio();
  a.src = url;
  a.volume = volume;
  radio = a;
  return new Promise((resolve) => {
    const done = (ok) => { clearTimeout(timer); resolve(ok); };
    const timer = setTimeout(() => done(false), RADIO_START_TIMEOUT_MS);
    a.addEventListener('playing', () => done(true), { once: true });
    a.addEventListener('error', () => done(false), { once: true });
    a.play().catch(() => done(false));
  });
}

function stopRadio() {
  if (!radio) return;
  radio.pause();
  radio.removeAttribute('src');
  radio.load();
  radio = null;
}

/* ================= Alarms ================= */
const RING_MAX_MS = 10 * 60 * 1000;   // stops by itself after 10 min
const SNOOZE_MS = 9 * 60 * 1000;
const lastFired = {};                  // alarm id -> 'YYYY-M-D HH:MM'
let ringing = null;                    // {alarm, startedAt, timer}
let snooze = restoreSnooze();          // {until, alarm}, kept across restarts

function restoreSnooze() {
  const s = store.get('snooze', null);
  if (!s || Date.now() - s.until > RING_MAX_MS) return null;
  return { until: s.until, alarm: state.alarms.find((a) => a.id === s.alarmId) || { label: 'Réveil', sound: 'beep' } };
}

function setSnooze(value) {
  snooze = value;
  store.set('snooze', value ? { until: value.until, alarmId: value.alarm.id } : null);
}

function saveAlarms() { store.set('alarms', state.alarms); renderNextAlarm(new Date()); }

function minuteKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fireAlarm(alarm, key) {
  lastFired[alarm.id] = key;
  if (alarm.days.length === 0) {    // single alarm: switched off once it has rung
    alarm.enabled = false;
    saveAlarms();
    renderAlarmList();
  }
  startRinging(alarm);
}

function alarmMatches(alarm, now) {
  if (!alarm.enabled) return false;
  if (alarm.time !== `${pad(now.getHours())}:${pad(now.getMinutes())}`) return false;
  return alarm.days.length === 0 || alarm.days.includes(now.getDay());
}

function checkAlarms(now) {
  if (ringing) {
    if (Date.now() - ringing.startedAt > RING_MAX_MS) stopRinging();
    return;
  }
  if (snooze && now.getTime() >= snooze.until) {
    const a = snooze.alarm;
    setSnooze(null);
    startRinging(a);
    return;
  }
  const key = minuteKey(now);
  for (const alarm of state.alarms) {
    if (lastFired[alarm.id] === key || !alarmMatches(alarm, now)) continue;
    fireAlarm(alarm, key);
    return;
  }
}

// Android app: the system alarm woke the app up (possibly closed or locked) -> ring now,
// even if the minute has passed while it was starting.
function checkNativeRing() {
  if (!NATIVE) return;
  const at = Number(NATIVE.consumePendingRing()); // scheduled time of that alarm, 0 if none
  if (!at || ringing || Date.now() - at > RING_MAX_MS) return;
  if (snooze && Math.abs(snooze.until - at) < 60000) {
    const a = snooze.alarm;
    setSnooze(null);
    startRinging(a);
    return;
  }
  const when = new Date(at);
  const key = minuteKey(when);
  const alarm = state.alarms.find((a) => alarmMatches(a, when));
  if (alarm) {
    if (lastFired[alarm.id] !== key) fireAlarm(alarm, key);
  } else if (!state.alarms.some((a) => lastFired[a.id] === key)) {
    startRinging({ label: 'Réveil', sound: 'beep', days: [] });
  }
}

function startRinging(alarm) {
  unlockAudio();
  stopPreview();
  const url = stationUrl(alarm);
  const ring = { alarm, startedAt: Date.now(), mode: url ? 'radio' : 'beep', timer: null };
  const loop = () => {
    const elapsed = (Date.now() - ring.startedAt) / 1000;
    if (ring.mode === 'radio') {
      if (radio) radio.volume = Math.min(1, 0.1 + elapsed / 60);   // ~1 min to reach full volume
    } else {
      playPattern(Math.min(0.9, 0.05 + elapsed / 60));
    }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  };
  ringing = ring;
  updateWakeLock();
  if (NATIVE) NATIVE.ringStarted(); // makes sure the media volume is audible
  if (url) {
    // Radio unavailable (no network, stream down, cut off): the beeps take over.
    const fallback = () => { if (ringing === ring && ring.mode === 'radio') { stopRadio(); ring.mode = 'beep'; } };
    playRadio(url, 0.1).then((ok) => {
      if (!ok) return fallback();
      if (radio) { radio.addEventListener('error', fallback); radio.addEventListener('ended', fallback); }
    });
  }
  loop();
  ring.timer = setInterval(loop, 1500);
  const now = new Date();
  $('#ring-time').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  $('#ring-label').textContent = alarm.label || 'Réveil';
  $('#settings').hidden = true;
  $('#ring').hidden = false;
}

function stopRinging() {
  if (!ringing) return;
  clearInterval(ringing.timer);
  stopRadio();
  if (navigator.vibrate) navigator.vibrate(0);
  ringing = null;
  if (NATIVE) NATIVE.ringStopped();
  $('#ring').hidden = true;
  renderNextAlarm(new Date());
  updateWakeLock();
}

function snoozeRinging() {
  if (!ringing) return;
  const alarm = ringing.alarm;
  stopRinging();
  setSnooze({ until: Date.now() + SNOOZE_MS, alarm });
  renderNextAlarm(new Date());
}

// Next ring time (Date) among active alarms, or null.
function nextAlarmDate(now) {
  let best = snooze ? new Date(snooze.until) : null;
  for (const a of state.alarms) {
    if (!a.enabled) continue;
    const [h, m] = a.time.split(':').map(Number);
    for (let d = 0; d <= 7; d++) {
      const c = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, h, m, 0, 0);
      if (c <= now) continue;
      if (a.days.length && !a.days.includes(c.getDay())) continue;
      if (!best || c < best) best = c;
      break;
    }
  }
  return best;
}

const BELL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';

// Android app: the next ring time is handed to the system alarm clock, which wakes the
// phone and opens the app even when it is closed or locked.
let nativeNext = null;
function scheduleNativeAlarm(next) {
  if (!NATIVE) return;
  const t = next ? next.getTime() : 0;
  if (t !== nativeNext) { nativeNext = t; NATIVE.setNextAlarm(String(t)); }
}

function renderNextAlarm(now) {
  const el = $('#next-alarm');
  const next = nextAlarmDate(now);
  scheduleNativeAlarm(next);
  if (!next) { el.hidden = true; return; }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((new Date(next.getFullYear(), next.getMonth(), next.getDate()) - today) / 86400000);
  let when = '';
  if (diffDays === 1) when = ' demain';
  else if (diffDays > 1) when = ' ' + new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(next);
  el.innerHTML = BELL_SVG;
  el.append(`${pad(next.getHours())}:${pad(next.getMinutes())}${when}${snooze ? ' (répétition)' : ''}`);
  el.hidden = false;
}

function renderAlarmList() {
  const list = $('#alarm-list');
  list.replaceChildren();
  if (!state.alarms.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Aucun réveil.';
    list.append(p);
    return;
  }
  for (const alarm of state.alarms) {
    const box = document.createElement('div');
    box.className = 'alarm' + (alarm.enabled ? '' : ' disabled');

    const top = document.createElement('div');
    top.className = 'alarm-top';
    const time = document.createElement('input');
    time.type = 'time';
    time.value = alarm.time;
    time.addEventListener('change', () => { if (time.value) { alarm.time = time.value; alarm.enabled = true; saveAlarms(); renderAlarmList(); } });
    const on = document.createElement('input');
    on.type = 'checkbox';
    on.checked = alarm.enabled;
    on.setAttribute('aria-label', 'Activer');
    on.addEventListener('change', () => { alarm.enabled = on.checked; saveAlarms(); renderAlarmList(); });
    const del = document.createElement('button');
    del.className = 'alarm-del';
    del.textContent = '×';
    del.setAttribute('aria-label', 'Supprimer');
    del.addEventListener('click', () => {
      state.alarms = state.alarms.filter((a) => a !== alarm);
      saveAlarms();
      renderAlarmList();
    });
    top.append(time, on, del);

    const days = document.createElement('div');
    days.className = 'days';
    for (const d of DAY_ORDER) {
      const b = document.createElement('button');
      b.className = 'day' + (alarm.days.includes(d) ? ' on' : '');
      b.textContent = DAY_LETTERS[d];
      b.addEventListener('click', () => {
        alarm.days = alarm.days.includes(d) ? alarm.days.filter((x) => x !== d) : [...alarm.days, d];
        saveAlarms();
        renderAlarmList();
      });
      days.append(b);
    }

    const label = document.createElement('input');
    label.className = 'alarm-label';
    label.placeholder = alarm.days.length ? 'Nom (optionnel)' : 'Nom (optionnel) — sans jour : sonne une seule fois';
    label.value = alarm.label || '';
    label.addEventListener('change', () => { alarm.label = label.value.trim(); saveAlarms(); });

    const soundRow = document.createElement('div');
    soundRow.className = 'alarm-sound';
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Son du réveil');
    const opts = [['beep', 'Bips'], ...STATIONS.map((s) => [s.id, `Radio : ${s.name}`]), ['custom', 'Autre radio (adresse du flux)']];
    for (const [value, text] of opts) sel.append(new Option(text, value));
    sel.value = alarm.sound || 'beep';
    sel.addEventListener('change', () => { stopPreview(); alarm.sound = sel.value; saveAlarms(); renderAlarmList(); });
    const listen = document.createElement('button');
    listen.type = 'button';
    listen.className = 'text-btn listen';
    listen.textContent = previewing === alarm ? 'Arrêter' : 'Écouter';
    listen.addEventListener('click', () => togglePreview(alarm));
    soundRow.append(sel, listen);

    box.append(top, days, label, soundRow);

    if (alarm.sound === 'custom') {
      const custom = document.createElement('input');
      custom.className = 'alarm-label';
      custom.type = 'url';
      custom.placeholder = 'https://… (flux MP3 ou AAC)';
      custom.value = alarm.customUrl || '';
      custom.addEventListener('change', () => { stopPreview(); alarm.customUrl = custom.value.trim(); saveAlarms(); renderAlarmList(); });
      box.append(custom);
      if (alarm.customUrl && !alarm.customUrl.startsWith('https://')) {
        const warn = document.createElement('p');
        warn.className = 'hint';
        warn.textContent = 'L\'adresse doit commencer par https:// (les flux http:// sont bloqués par le navigateur).';
        box.append(warn);
      }
    }
    list.append(box);
  }
}

// Preview of an alarm's sound from the settings.
function togglePreview(alarm) {
  unlockAudio();
  if (previewing === alarm) { stopPreview(); return; }
  stopPreview();
  const url = stationUrl(alarm);
  if (!url) { playPattern(0.5); return; }
  previewing = alarm;
  renderAlarmList();
  playRadio(url, 0.6).then((ok) => {
    if (!ok && previewing === alarm) {
      stopPreview();
      alert('Impossible de lire cette radio (réseau ou adresse du flux). Le réveil sonnera avec les bips.');
    }
  });
}

function stopPreview() {
  if (!previewing) return;
  previewing = null;
  if (!ringing) stopRadio();
  if (!$('#settings').hidden) renderAlarmList();
}

/* ================= Agenda (Android app) ================= */
// Next events of today and tomorrow, read from the calendars synced on the phone (Google Agenda).
const AGENDA_MAX = 3;
const DAY_MS = 86400000;

function agendaAvailable() {
  return !!(NATIVE && NATIVE.getEvents && state.showAgenda && NATIVE.hasCalendarPermission());
}

// Local midnight of a time; all-day events are stored at UTC midnight.
function dayOf(ms, allDay) {
  const d = new Date(ms);
  return allDay ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function upcomingEvents(now) {
  const today = dayOf(now.getTime(), false);
  const after = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2); // end of tomorrow
  let events = [];
  try {
    events = JSON.parse(NATIVE.getEvents(String(today.getTime() - DAY_MS), String(after.getTime() + DAY_MS)));
  } catch { return []; }
  return events.map((e) => {
    if (e.allDay) {
      const start = dayOf(e.begin, true), end = dayOf(e.end, true);
      if (end <= today || start >= after) return null;
      const day = start < today ? today : start;
      return { ...e, day, sort: day.getTime() - 1 };
    }
    if (e.end <= now.getTime() || e.begin >= after.getTime()) return null;
    const start = dayOf(e.begin, false);
    return { ...e, day: start < today ? today : start, sort: Math.max(e.begin, today.getTime()) };
  }).filter(Boolean).sort((a, b) => a.sort - b.sort).slice(0, AGENDA_MAX);
}

function renderAgenda(now = new Date()) {
  const el = $('#agenda');
  if (!agendaAvailable()) { el.hidden = true; return; }
  const today = dayOf(now.getTime(), false).getTime();
  const rows = upcomingEvents(now).map((e) => {
    const tomorrow = e.day.getTime() > today;
    const row = document.createElement('div');
    row.className = 'event';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = e.color || 'var(--fg-soft)';
    const when = document.createElement('span');
    when.className = 'when';
    if (e.allDay) {
      when.textContent = tomorrow ? 'demain' : 'aujourd\'hui';
    } else {
      const t = new Date(e.begin);
      const time = e.begin <= now.getTime() ? 'en cours' : `${pad(t.getHours())}:${pad(t.getMinutes())}`;
      when.textContent = tomorrow ? `demain ${time}` : time;
    }
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = e.title || '(sans titre)';
    row.append(dot, when, title);
    return row;
  });
  el.replaceChildren(...rows);
  el.hidden = rows.length === 0;
}

/* ================= Weather ================= */
const WEATHER_REFRESH_MS = 15 * 60 * 1000;

const WMO = {
  0: ['Ciel dégagé', 'clear'], 1: ['Plutôt dégagé', 'partly'], 2: ['Partiellement nuageux', 'partly'], 3: ['Couvert', 'cloudy'],
  45: ['Brouillard', 'fog'], 48: ['Brouillard givrant', 'fog'],
  51: ['Bruine légère', 'drizzle'], 53: ['Bruine', 'drizzle'], 55: ['Bruine dense', 'drizzle'],
  56: ['Bruine verglaçante', 'drizzle'], 57: ['Bruine verglaçante', 'drizzle'],
  61: ['Pluie faible', 'rain'], 63: ['Pluie', 'rain'], 65: ['Pluie forte', 'rain'],
  66: ['Pluie verglaçante', 'rain'], 67: ['Pluie verglaçante', 'rain'],
  71: ['Neige faible', 'snow'], 73: ['Neige', 'snow'], 75: ['Neige forte', 'snow'], 77: ['Grains de neige', 'snow'],
  80: ['Averses faibles', 'rain'], 81: ['Averses', 'rain'], 82: ['Averses violentes', 'rain'],
  85: ['Averses de neige', 'snow'], 86: ['Fortes averses de neige', 'snow'],
  95: ['Orage', 'storm'], 96: ['Orage avec grêle', 'storm'], 99: ['Orage avec grêle', 'storm'],
};

const CLOUD = '<path class="mask cloud" d="M18 46H46A10 10 0 0 0 46 26A14 14 0 0 0 19 24A11 11 0 0 0 18 46Z"/>';
const sun = (cx, cy, r) => {
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x1 = cx + Math.cos(a) * (r + 4), y1 = cy + Math.sin(a) * (r + 4);
    const x2 = cx + Math.cos(a) * (r + 9), y2 = cy + Math.sin(a) * (r + 9);
    rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return `<g class="sun"><circle cx="${cx}" cy="${cy}" r="${r}"/>${rays}</g>`;
};
const moon = (s = 1, tx = 0, ty = 0) =>
  `<path class="moon" transform="translate(${tx} ${ty}) scale(${s})" d="M40 12A20 20 0 1 0 52 44A16 16 0 0 1 40 12Z"/>`;
const up = (inner) => `<g transform="translate(0 -8)">${inner}</g>`;

function weatherIcon(kind, isDay) {
  let body;
  switch (kind) {
    case 'clear': body = isDay ? sun(32, 32, 11) : moon(); break;
    case 'partly': body = (isDay ? sun(24, 22, 8) : moon(0.6, 6, 2)) + CLOUD; break;
    case 'cloudy': body = CLOUD; break;
    case 'fog': body = up(CLOUD) + '<g class="fog"><line x1="14" y1="48" x2="50" y2="48"/><line x1="18" y1="55" x2="46" y2="55"/></g>'; break;
    case 'drizzle': body = up(CLOUD) + '<g class="rain"><line x1="24" y1="46" x2="22" y2="50"/><line x1="34" y1="46" x2="32" y2="50"/><line x1="44" y1="46" x2="42" y2="50"/></g>'; break;
    case 'rain': body = up(CLOUD) + '<g class="rain"><line x1="24" y1="45" x2="20" y2="56"/><line x1="34" y1="45" x2="30" y2="56"/><line x1="44" y1="45" x2="40" y2="56"/></g>'; break;
    case 'snow': body = up(CLOUD) + '<g class="snow"><circle cx="22" cy="50" r="1.4"/><circle cx="32" cy="54" r="1.4"/><circle cx="42" cy="50" r="1.4"/><circle cx="27" cy="58" r="1.4"/><circle cx="37" cy="58" r="1.4"/></g>'; break;
    case 'storm': body = up(CLOUD) + '<path class="bolt" d="M34 42L27 52H35L30 61"/>'; break;
    default: body = CLOUD;
  }
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
}

function describe(code) { return WMO[code] || ['—', 'cloudy']; }

function renderWeather() {
  const loc = state.location;
  $('#w-place').textContent = loc ? loc.name : 'Météo';
  const w = state.weather;
  if (!w || !w.data || !w.data.current) {
    $('#w-desc').textContent = loc ? 'Chargement…' : 'Choisissez un lieu dans les réglages';
    return;
  }
  const { current } = w.data;
  const [label, kind] = describe(current.weather_code);
  $('#w-icon').innerHTML = weatherIcon(kind, current.is_day);
  $('#w-icon').classList.toggle('colored', state.colorIcons);
  $('#w-temp').textContent = `${Math.round(current.temperature_2m)}°`;
  $('#w-desc').textContent = label;

  const details = [
    `ressenti ${Math.round(current.apparent_temperature)}°`,
    `vent ${Math.round(current.wind_speed_10m)} km/h`,
    `humidité ${Math.round(current.relative_humidity_2m)} %`,
  ];
  $('#w-details').replaceChildren(...details.map((t) => { const el = document.createElement('span'); el.textContent = t; return el; }));

  const age = Date.now() - w.fetchedAt;
  const t = new Date(w.fetchedAt);
  $('#w-updated').textContent = age > 2 * WEATHER_REFRESH_MS
    ? `données du ${t.toLocaleDateString('fr-FR')} ${pad(t.getHours())}:${pad(t.getMinutes())}`
    : `mis à jour à ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

let weatherLoading = false;

async function fetchWeather() {
  const loc = state.location;
  if (!loc || weatherLoading) return;
  weatherLoading = true;
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${loc.lat}&longitude=${loc.lon}`
    + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day'
    + '&timezone=auto';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    state.weather = { data, fetchedAt: Date.now() };
    store.set('weather', state.weather);
  } catch {
    if (!state.weather) $('#w-desc').textContent = 'Météo indisponible (réseau ?)';
  } finally {
    weatherLoading = false;
    renderWeather();
  }
}

function maybeRefreshWeather() {
  if (!state.weather || Date.now() - state.weather.fetchedAt > WEATHER_REFRESH_MS) fetchWeather();
}

/* ================= Location ================= */
function setLocation(loc) {
  const prev = state.location;
  const moved = !prev || Math.abs(prev.lat - loc.lat) > 0.05 || Math.abs(prev.lon - loc.lon) > 0.05;
  state.location = loc;
  store.set('location', loc);
  if (moved) {
    state.weather = null;
    store.set('weather', null);
  }
  renderLocation();
  renderWeather();
  if (moved) fetchWeather(); else maybeRefreshWeather();
}

function renderLocation() {
  const loc = state.location;
  $('#loc-current').textContent = loc
    ? `Actuel : ${loc.name}${loc.auto ? ' (position du téléphone)' : ''}`
    : 'Aucun lieu choisi.';
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=fr`);
    const j = await res.json();
    return j.city || j.locality || j.principalSubdivision || null;
  } catch { return null; }
}

function locateWithGps() {
  if (!navigator.geolocation) { $('#loc-current').textContent = 'Géolocalisation non disponible.'; return; }
  $('#loc-current').textContent = 'Localisation en cours…';
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = +pos.coords.latitude.toFixed(3);
    const lon = +pos.coords.longitude.toFixed(3);
    const name = (await reverseGeocode(lat, lon)) || `${lat}, ${lon}`;
    setLocation({ lat, lon, name, auto: true });
  }, () => {
    $('#loc-current').textContent = 'Position refusée : recherchez une ville ci-dessous.';
    if (!state.location) $('#w-desc').textContent = 'Choisissez un lieu dans les réglages';
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 3600000 });
}

async function searchCity(query) {
  const out = $('#city-results');
  out.replaceChildren();
  if (!query) return;
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=fr&format=json`);
    const j = await res.json();
    const results = j.results || [];
    if (!results.length) { out.textContent = 'Aucun résultat.'; return; }
    for (const r of results) {
      const b = document.createElement('button');
      b.className = 'city-result';
      b.type = 'button';
      b.textContent = r.name + ' ';
      const small = document.createElement('small');
      small.textContent = [r.admin1, r.country].filter(Boolean).join(', ');
      b.append(small);
      b.addEventListener('click', () => {
        setLocation({ lat: r.latitude, lon: r.longitude, name: r.name, auto: false });
        out.replaceChildren();
        $('#city-input').value = '';
      });
      out.append(b);
    }
  } catch {
    out.textContent = 'Recherche impossible (réseau ?).';
  }
}

/* ================= Settings ================= */
function openSettings() {
  $('#brightness').value = state.brightness;
  renderDimSettings();
  $('#only-charging').checked = state.onlyCharging;
  $('#second-hand').checked = state.secondHand;
  $('#color-icons').checked = state.colorIcons;
  renderStyleButtons();
  renderColorChoice();
  renderAlarmList();
  renderLocation();
  renderAndroidSettings();
  $('#settings').hidden = false;
}

function renderAndroidSettings() {
  if (!NATIVE) return;
  $('#android-section').hidden = false;
  $('#fullscreen').hidden = true;
  $('#alarm-hint').textContent = 'Le réveil sonne même si l\'application est fermée ou le téléphone verrouillé (vérifiez que le volume « média » n\'est pas coupé).';
  $('#auto-start').checked = NATIVE.getAutoStart();
  const overlay = NATIVE.canDrawOverlays();
  $('#overlay-btn').hidden = overlay;
  $('#overlay-status').textContent = overlay
    ? 'Ouverture automatique autorisée.'
    : 'Pour s\'ouvrir toute seule, l\'application a besoin de l\'autorisation « Superposition sur d\'autres applis ».';
  $('#show-agenda').checked = state.showAgenda;
  const calendar = NATIVE.hasCalendarPermission();
  $('#agenda-status').textContent = state.showAgenda && !calendar
    ? 'Accès à l\'agenda non autorisé : Paramètres → Applis → Horloge Météo → Autorisations → Agenda.'
    : '';
  const fsi = NATIVE.canRingWhenLocked();
  $('#fsi-btn').hidden = fsi;
  $('#fsi-status').textContent = fsi ? '' : 'Pour sonner téléphone verrouillé, autorisez les « notifications plein écran ».';
}

function closeSettings() {
  $('#settings').hidden = true;
  stopPreview();
  renderNextAlarm(new Date());
}

function renderDimSettings() {
  const s = state.dimSchedule;
  $('#dim-on').checked = s.on;
  $('#dim-settings').hidden = !s.on;
  $('#brightness-row').hidden = s.on; // the manual slider only applies without the schedule
  $('#dim-night').value = s.night;
  $('#dim-day').value = s.day;
  $('#dim-night-level').value = s.nightLevel;
  $('#dim-day-level').value = s.dayLevel;
  $('#dim-night-val').textContent = `${s.nightLevel} %`;
  $('#dim-day-val').textContent = `${s.dayLevel} %`;
}

function renderStyleButtons() {
  document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.style === state.clockStyle));
}

function wireUi() {
  // First touch: sound + fullscreen (both require a user gesture)
  document.addEventListener('pointerdown', () => { updateWakeLock(); enterFullscreen(); }, { once: true });

  $('#open-settings').addEventListener('click', openSettings);
  $('#close-settings').addEventListener('click', closeSettings);

  $('#brightness').addEventListener('input', (e) => {
    state.brightness = Number(e.target.value);
    applyBrightness();
    store.set('brightness', state.brightness);
  });
  const saveDim = () => { store.set('dimSchedule', state.dimSchedule); renderDimSettings(); applyBrightness(); };
  $('#dim-on').addEventListener('change', (e) => { state.dimSchedule.on = e.target.checked; saveDim(); });
  $('#dim-night').addEventListener('change', (e) => { if (e.target.value) { state.dimSchedule.night = e.target.value; saveDim(); } });
  $('#dim-day').addEventListener('change', (e) => { if (e.target.value) { state.dimSchedule.day = e.target.value; saveDim(); } });
  for (const [id, key] of [['#dim-night-level', 'nightLevel'], ['#dim-day-level', 'dayLevel']]) {
    $(id).addEventListener('input', (e) => {
      state.dimSchedule[key] = Number(e.target.value);
      store.set('dimSchedule', state.dimSchedule);
      renderDimSettings();
      previewBrightness(state.dimSchedule[key]);
    });
  }
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    state.clockStyle = b.dataset.style;
    store.set('clockStyle', state.clockStyle);
    renderStyleButtons();
    renderClock(new Date(), true);
  }));
  document.querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => setColor(b.dataset.color)));
  $('#custom-color').addEventListener('input', (e) => setColor(e.target.value));
  $('#second-hand').addEventListener('change', (e) => {
    state.secondHand = e.target.checked;
    store.set('secondHand', state.secondHand);
    syncSecondHand();
  });
  $('#color-icons').addEventListener('change', (e) => {
    state.colorIcons = e.target.checked;
    store.set('colorIcons', state.colorIcons);
    renderWeather();
  });
  $('#only-charging').addEventListener('change', (e) => {
    state.onlyCharging = e.target.checked;
    store.set('onlyCharging', state.onlyCharging);
    updateWakeLock();
  });
  $('#fullscreen').addEventListener('click', enterFullscreen);
  if (NATIVE) {
    $('#auto-start').addEventListener('change', (e) => NATIVE.setAutoStart(e.target.checked));
    $('#show-agenda').addEventListener('change', (e) => {
      state.showAgenda = e.target.checked;
      store.set('showAgenda', state.showAgenda);
      if (state.showAgenda && !NATIVE.hasCalendarPermission()) NATIVE.requestCalendarPermission();
      renderAndroidSettings();
      renderAgenda();
    });
    window.onNativeCalendarPermission = () => {
      if (!$('#settings').hidden) renderAndroidSettings();
      renderAgenda();
    };
    $('#overlay-btn').addEventListener('click', () => NATIVE.openOverlaySettings());
    $('#fsi-btn').addEventListener('click', () => NATIVE.openFullScreenSettings());
  }

  $('#add-alarm').addEventListener('click', () => {
    state.alarms.push({ id: Date.now().toString(36), time: '07:00', days: [1, 2, 3, 4, 5], enabled: true, label: '', sound: 'beep' });
    saveAlarms();
    renderAlarmList();
  });
  $('#test-sound').addEventListener('click', () => { unlockAudio(); playPattern(0.5); });

  $('#use-gps').addEventListener('click', locateWithGps);
  $('#city-form').addEventListener('submit', (e) => { e.preventDefault(); searchCity($('#city-input').value.trim()); });

  $('#stop').addEventListener('click', stopRinging);
  $('#snooze').addEventListener('click', snoozeRinging);

  // Any tap keeps sound unlocked (some browsers suspend it in the background)
  document.addEventListener('pointerdown', unlockAudio, { passive: true });

  // Double-tap on the clock: fullscreen
  $('#clock-panel').addEventListener('dblclick', enterFullscreen);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onAppVisible();
  });
  window.onNativeResume = onAppVisible; // called by the Android app
  // Android Back button: closes the settings first (returns true when handled)
  window.onNativeBack = () => {
    if ($('#settings').hidden) return false;
    closeSettings();
    return true;
  };
  window.addEventListener('online', maybeRefreshWeather);
}

function onAppVisible() {
  updateWakeLock();
  tick();
  checkNativeRing();
  syncSecondHand();
  renderAgenda();
  renderNextAlarm(new Date());
  maybeRefreshWeather();
  if (!$('#settings').hidden) renderAndroidSettings();
}

/* ================= Startup ================= */
function init() {
  applyColor();
  applyBrightness();
  buildDial();
  wireUi();
  scheduleTick();
  renderWeather();
  unlockAudio();      // works without a touch when the browser allows it
  watchBattery();
  updateWakeLock();
  checkNativeRing();

  if (state.location) maybeRefreshWeather();
  if (!state.location || state.location.auto) locateWithGps();
  setInterval(maybeRefreshWeather, 60 * 1000);

  if (!NATIVE && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
