/* =====================================================================
 * Utilities: Timezone formatting (Asia/Jerusalem with DST), countdown,
 * Hebrew day names, broadcast-override storage, favorites & reminders.
 * ===================================================================*/

const TZ = "Asia/Jerusalem";

const HEB_DAYS  = ["יום ראשון","יום שני","יום שלישי","יום רביעי","יום חמישי","יום שישי","שבת"];
const HEB_DAYS_S= ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
const HEB_MONTHS= ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

/* Get parts of a date in Israel timezone via Intl */
function israelParts(utcIso) {
  const d = new Date(utcIso);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", weekday:"short", hour12:false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  return {
    year:  +parts.year,
    month: +parts.month,
    day:   +parts.day,
    hour:  +parts.hour,
    minute:+parts.minute,
    weekday: parts.weekday, // e.g. Sun, Mon
    date:  d,
  };
}

function israelDateKey(utcIso) {
  const p = israelParts(utcIso);
  return `${p.year}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}`;
}

function todayKey() {
  return israelDateKey(new Date().toISOString());
}

function tomorrowKey() {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + 1);
  return israelDateKey(t.toISOString());
}

function formatIsraelDate(utcIso, opts = {}) {
  const p = israelParts(utcIso);
  const weekdayIdx = new Date(`${p.year}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}T12:00:00`).getDay();
  const dayName = opts.short ? HEB_DAYS_S[weekdayIdx] : HEB_DAYS[weekdayIdx];
  return `${dayName}, ${p.day} ${HEB_MONTHS[p.month-1]} ${p.year}`;
}

function formatIsraelTime(utcIso) {
  const p = israelParts(utcIso);
  return `${String(p.hour).padStart(2,"0")}:${String(p.minute).padStart(2,"0")}`;
}

/* DST badge — Israel is UTC+3 from last Friday of March to last Sunday of October */
function israelOffsetHours(utcIso) {
  const d = new Date(utcIso);
  const localStr = d.toLocaleString("en-US", { timeZone: TZ, hour12:false });
  const utcStr   = d.toLocaleString("en-US", { timeZone: "UTC",  hour12:false });
  const local = new Date(localStr);
  const utc   = new Date(utcStr);
  return Math.round((local - utc) / 3600000);
}

/* Relative descriptors: היום / מחר / השבוע / עוד X שעות */
function relativeLabel(utcIso) {
  const now = new Date();
  const target = new Date(utcIso);
  const diffMs = target - now;
  const diffMin = Math.round(diffMs / 60000);
  const diffH = Math.round(diffMin / 60);
  const diffD = Math.round(diffH / 24);
  const tk = todayKey();
  const tmk = tomorrowKey();
  const mk = israelDateKey(utcIso);
  if (diffMs < 0 && diffMs > -2.5 * 3600 * 1000) return "LIVE";
  if (mk === tk) {
    if (diffMin > 0 && diffMin < 60) return `עוד ${diffMin} דקות`;
    if (diffH > 0 && diffH < 24) return `היום · עוד ${diffH} שעות`;
    return "היום";
  }
  if (mk === tmk) return "מחר";
  if (diffD < 7 && diffD > 0) return `בעוד ${diffD} ימים`;
  if (diffD < 0) return "הסתיים";
  return null;
}

/* Countdown string DD:HH:MM:SS */
function countdownString(utcIso) {
  const now = new Date();
  const target = new Date(utcIso);
  let diff = Math.max(0, target - now);
  const d = Math.floor(diff / (1000 * 60 * 60 * 24)); diff -= d * 86400000;
  const h = Math.floor(diff / (1000 * 60 * 60));     diff -= h * 3600000;
  const m = Math.floor(diff / (1000 * 60));          diff -= m * 60000;
  const s = Math.floor(diff / 1000);
  return { d, h, m, s };
}

/* Live status: between kickoff and kickoff+2h */
function matchLiveStatus(match) {
  const now = Date.now();
  const start = new Date(match.utc).getTime();
  const end = start + 115 * 60 * 1000;
  if (now < start - 30 * 60 * 1000) return "upcoming";
  if (now >= start - 30 * 60 * 1000 && now < start) return "pregame";
  if (now >= start && now <= end) return "live";
  return "finished";
}

/* =================== STORAGE: favorites, reminders, overrides =================== */
const LS = {
  FAV_TEAMS:   "mondial26.favTeams",
  REMINDERS:   "mondial26.reminders",
  OVERRIDES:   "mondial26.broadcastOverrides",
  ADMIN_FLAG:  "mondial26.isAdmin",
  PREFS:       "mondial26.prefs",
};

function readLS(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function writeLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getFavTeams() { return new Set(readLS(LS.FAV_TEAMS, [])); }
function toggleFavTeam(code) {
  const s = getFavTeams();
  s.has(code) ? s.delete(code) : s.add(code);
  writeLS(LS.FAV_TEAMS, [...s]);
  return s;
}

function getReminders() { return readLS(LS.REMINDERS, {}); /* {matchId: {h60:bool, m15:bool, betsClose:bool}} */ }
function setReminder(matchId, key, val) {
  const r = getReminders();
  r[matchId] = r[matchId] || {};
  r[matchId][key] = val;
  writeLS(LS.REMINDERS, r);
}

function getOverrides() { return readLS(LS.OVERRIDES, {}); }
function setOverride(matchId, override) {
  const o = getOverrides();
  o[matchId] = { ...(o[matchId] || {}), ...override };
  writeLS(LS.OVERRIDES, o);
}
function clearOverride(matchId) {
  const o = getOverrides();
  delete o[matchId];
  writeLS(LS.OVERRIDES, o);
}

function applyOverride(match) {
  const o = getOverrides()[match.id];
  if (!o) return match;
  return { ...match, ...o };
}

function isAdmin() { return readLS(LS.ADMIN_FLAG, false); }
function setAdmin(v) { writeLS(LS.ADMIN_FLAG, !!v); }

function getPrefs() {
  return readLS(LS.PREFS, {
    view: "card",       // card | calendar | timeline
    showFavOnly: false,
    selectedDay: null,
    selectedGroup: null,
    selectedStage: null,
    selectedChannel: null,
    selectedTeam: null,
    statusFilter: "all", // all | live | upcoming
  });
}
function setPref(key, value) {
  const p = getPrefs();
  p[key] = value;
  writeLS(LS.PREFS, p);
}

/* Browser notifications for reminders */
function ensureNotifPermission() {
  if (!("Notification" in window)) return Promise.resolve("unsupported");
  if (Notification.permission === "granted") return Promise.resolve("granted");
  if (Notification.permission === "denied")  return Promise.resolve("denied");
  return Notification.requestPermission();
}

function sendNotif(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try { new Notification(title, { body, icon: "" }); } catch {}
}

/* Trigger reminders by scanning every 15s */
function startReminderEngine(getMatches) {
  const fired = new Set();
  function tick() {
    const now = Date.now();
    const matches = getMatches();
    const reminders = getReminders();
    Object.entries(reminders).forEach(([mid, flags]) => {
      const m = matches.find(x => x.id === mid);
      if (!m) return;
      const start = new Date(m.utc).getTime();
      const homeName = (window.MONDIAL.TEAMS[m.home]?.name) || m.home;
      const awayName = (window.MONDIAL.TEAMS[m.away]?.name) || m.away;
      const label = `${homeName} נגד ${awayName}`;
      const checks = [
        ["h60",      start - 60*60*1000, `המשחק ${label} מתחיל בעוד שעה`],
        ["m15",      start - 15*60*1000, `המשחק ${label} מתחיל בעוד 15 דקות`],
        ["betsClose",start - 10*60*1000, `ההימורים על ${label} נסגרים בקרוב`],
      ];
      checks.forEach(([k, when, msg]) => {
        if (flags[k] && !fired.has(`${mid}.${k}`) && now >= when && now < when + 60*1000) {
          fired.add(`${mid}.${k}`);
          sendNotif("מונדיאל 2026", msg);
        }
      });
    });
  }
  setInterval(tick, 15000);
  tick();
}

window.UTILS = {
  TZ, HEB_DAYS, HEB_DAYS_S, HEB_MONTHS,
  israelParts, israelDateKey, todayKey, tomorrowKey,
  formatIsraelDate, formatIsraelTime, israelOffsetHours, relativeLabel, countdownString,
  matchLiveStatus,
  getFavTeams, toggleFavTeam,
  getReminders, setReminder,
  getOverrides, setOverride, clearOverride, applyOverride,
  isAdmin, setAdmin,
  getPrefs, setPref,
  ensureNotifPermission, sendNotif, startReminderEngine,
};
