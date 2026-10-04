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
  brightness: store.get('brightness', 35),     // %
  clockStyle: store.get('clockStyle', 'analog'), // 'analog' | 'digital'
  onlyCharging: store.get('onlyCharging', true),  // release the screen when unplugged
  alarms: store.get('alarms', []),             // [{id, time:'07:00', days:[1..5], enabled, label}]
  location: store.get('location', null),       // {lat, lon, name, auto}
  weather: store.get('weather', null),         // {data, fetchedAt}
};

const $ = (sel) => document.querySelector(sel);
const pad = (n) => String(n).padStart(2, '0');
const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']; // index = Date#getDay()
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];                 // displayed Monday first

/* ================= Brightness ================= */
function applyBrightness() {
  document.documentElement.style.setProperty('--dim', (state.brightness / 100).toFixed(2));
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

function renderClock(now, force) {
  const key = `${now.getHours()}:${now.getMinutes()}`;
  if (key === shownMinute && !force) return;
  shownMinute = key;
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
  if (screenShouldStayOn()) requestWakeLock();
  else if (wakeLock) { wakeLock.release(); wakeLock = null; }
}

async function watchBattery() {
  if (!navigator.getBattery) return;
  try {
    const battery = await navigator.getBattery();
    const update = () => { charging = battery.charging; updateWakeLock(); };
    battery.addEventListener('chargingchange', update);
    update();
  } catch { /* not available */ }
}

function enterFullscreen() {
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
  if (!audioCtx && AC) {
    audioCtx = new AC();
    audioCtx.addEventListener('statechange', renderSoundHint);
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().then(renderSoundHint, () => {});
  renderSoundHint();
}

// Browsers only allow sound after a first touch: remind it if an alarm is set.
function renderSoundHint() {
  const locked = !audioCtx || audioCtx.state !== 'running';
  $('#sound-hint').hidden = !(locked && state.alarms.some((a) => a.enabled));
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

/* ================= Alarms ================= */
const RING_MAX_MS = 10 * 60 * 1000;   // stops by itself after 10 min
const SNOOZE_MS = 9 * 60 * 1000;
const lastFired = {};                  // alarm id -> 'YYYY-M-D HH:MM'
let ringing = null;                    // {alarm, startedAt, timer}
let snooze = null;                     // {until, alarm}

function saveAlarms() { store.set('alarms', state.alarms); renderNextAlarm(new Date()); renderSoundHint(); }

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
    snooze = null;
    startRinging(a);
    return;
  }
  const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  for (const alarm of state.alarms) {
    if (lastFired[alarm.id] === key || !alarmMatches(alarm, now)) continue;
    lastFired[alarm.id] = key;
    if (alarm.days.length === 0) {    // single alarm: switched off once it has rung
      alarm.enabled = false;
      saveAlarms();
      renderAlarmList();
    }
    startRinging(alarm);
    return;
  }
}

function startRinging(alarm) {
  unlockAudio();
  requestWakeLock();
  const startedAt = Date.now();
  const loop = () => {
    const elapsed = (Date.now() - startedAt) / 1000;
    playPattern(Math.min(0.9, 0.05 + elapsed / 60));   // ~1 min to reach full volume
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  };
  loop();
  ringing = { alarm, startedAt, timer: setInterval(loop, 1500) };
  const now = new Date();
  $('#ring-time').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  $('#ring-label').textContent = alarm.label || 'Réveil';
  $('#settings').hidden = true;
  $('#ring').hidden = false;
}

function stopRinging() {
  if (!ringing) return;
  clearInterval(ringing.timer);
  if (navigator.vibrate) navigator.vibrate(0);
  ringing = null;
  $('#ring').hidden = true;
  renderNextAlarm(new Date());
  updateWakeLock();
}

function snoozeRinging() {
  if (!ringing) return;
  const alarm = ringing.alarm;
  stopRinging();
  snooze = { until: Date.now() + SNOOZE_MS, alarm };
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

function renderNextAlarm(now) {
  const el = $('#next-alarm');
  const next = nextAlarmDate(now);
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

    box.append(top, days, label);
    list.append(box);
  }
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

const CLOUD = '<path class="mask" d="M18 46H46A10 10 0 0 0 46 26A14 14 0 0 0 19 24A11 11 0 0 0 18 46Z"/>';
const sun = (cx, cy, r) => {
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x1 = cx + Math.cos(a) * (r + 4), y1 = cy + Math.sin(a) * (r + 4);
    const x2 = cx + Math.cos(a) * (r + 9), y2 = cy + Math.sin(a) * (r + 9);
    rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}"/>${rays}`;
};
const moon = (s = 1, tx = 0, ty = 0) =>
  `<path transform="translate(${tx} ${ty}) scale(${s})" d="M40 12A20 20 0 1 0 52 44A16 16 0 0 1 40 12Z"/>`;
const up = (inner) => `<g transform="translate(0 -8)">${inner}</g>`;

function weatherIcon(kind, isDay) {
  let body;
  switch (kind) {
    case 'clear': body = isDay ? sun(32, 32, 11) : moon(); break;
    case 'partly': body = (isDay ? sun(24, 22, 8) : moon(0.6, 6, 2)) + CLOUD; break;
    case 'cloudy': body = CLOUD; break;
    case 'fog': body = up(CLOUD) + '<line x1="14" y1="48" x2="50" y2="48"/><line x1="18" y1="55" x2="46" y2="55"/>'; break;
    case 'drizzle': body = up(CLOUD) + '<line x1="24" y1="46" x2="22" y2="50"/><line x1="34" y1="46" x2="32" y2="50"/><line x1="44" y1="46" x2="42" y2="50"/>'; break;
    case 'rain': body = up(CLOUD) + '<line x1="24" y1="45" x2="20" y2="56"/><line x1="34" y1="45" x2="30" y2="56"/><line x1="44" y1="45" x2="40" y2="56"/>'; break;
    case 'snow': body = up(CLOUD) + '<circle cx="22" cy="50" r="1.4"/><circle cx="32" cy="54" r="1.4"/><circle cx="42" cy="50" r="1.4"/><circle cx="27" cy="58" r="1.4"/><circle cx="37" cy="58" r="1.4"/>'; break;
    case 'storm': body = up(CLOUD) + '<path d="M34 42L27 52H35L30 61"/>'; break;
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
  const { current, hourly, daily } = w.data;
  const [label, kind] = describe(current.weather_code);
  $('#w-icon').innerHTML = weatherIcon(kind, current.is_day);
  $('#w-temp').textContent = `${Math.round(current.temperature_2m)}°`;
  $('#w-desc').textContent = label;

  const details = [];
  if (daily) {
    details.push(`${Math.round(daily.temperature_2m_min[0])}° / ${Math.round(daily.temperature_2m_max[0])}°`);
  }
  details.push(`ressenti ${Math.round(current.apparent_temperature)}°`);
  details.push(`vent ${Math.round(current.wind_speed_10m)} km/h`);
  details.push(`humidité ${Math.round(current.relative_humidity_2m)} %`);
  if (daily && daily.sunrise) {
    details.push(`lever ${daily.sunrise[0].slice(11)} · coucher ${daily.sunset[0].slice(11)}`);
  }
  const det = $('#w-details');
  det.replaceChildren(...details.map((t) => { const s = document.createElement('span'); s.textContent = t; return s; }));

  // Next hours
  const hours = $('#w-hours');
  hours.replaceChildren();
  if (hourly) {
    const start = hourly.time.findIndex((t) => t > current.time);
    for (let i = start; i >= 0 && i < start + 6 && i < hourly.time.length; i++) {
      const h = document.createElement('div');
      h.className = 'hour';
      const hh = document.createElement('div');
      hh.textContent = `${Number(hourly.time[i].slice(11, 13))}h`;
      const ic = document.createElement('div');
      ic.innerHTML = weatherIcon(describe(hourly.weather_code[i])[1], hourly.is_day[i]);
      const tt = document.createElement('div');
      tt.textContent = `${Math.round(hourly.temperature_2m[i])}°`;
      const pp = document.createElement('div');
      pp.className = 'p';
      const prob = hourly.precipitation_probability ? hourly.precipitation_probability[i] : null;
      pp.textContent = prob != null && prob >= 20 ? `${prob} %` : '';
      h.append(hh, ic.firstChild, tt, pp);
      hours.append(h);
    }
  }

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
    + '&hourly=temperature_2m,weather_code,precipitation_probability,is_day'
    + '&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset'
    + '&timezone=auto&forecast_days=2';
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
  $('#only-charging').checked = state.onlyCharging;
  renderStyleButtons();
  renderAlarmList();
  renderLocation();
  $('#settings').hidden = false;
}

function closeSettings() {
  $('#settings').hidden = true;
  renderNextAlarm(new Date());
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
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    state.clockStyle = b.dataset.style;
    store.set('clockStyle', state.clockStyle);
    renderStyleButtons();
    renderClock(new Date(), true);
  }));
  $('#only-charging').addEventListener('change', (e) => {
    state.onlyCharging = e.target.checked;
    store.set('onlyCharging', state.onlyCharging);
    updateWakeLock();
  });
  $('#fullscreen').addEventListener('click', enterFullscreen);

  $('#add-alarm').addEventListener('click', () => {
    state.alarms.push({ id: Date.now().toString(36), time: '07:00', days: [1, 2, 3, 4, 5], enabled: true, label: '' });
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
    if (document.visibilityState === 'visible') {
      updateWakeLock();
      tick();
      renderNextAlarm(new Date());
      maybeRefreshWeather();
    }
  });
  window.addEventListener('online', maybeRefreshWeather);
}

/* ================= Startup ================= */
function init() {
  applyBrightness();
  buildDial();
  wireUi();
  scheduleTick();
  renderWeather();
  unlockAudio();      // works without a touch when the browser allows it
  watchBattery();
  updateWakeLock();

  if (state.location) maybeRefreshWeather();
  if (!state.location || state.location.auto) locateWithGps();
  setInterval(maybeRefreshWeather, 60 * 1000);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
