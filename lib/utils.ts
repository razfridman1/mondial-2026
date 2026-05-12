/* =====================================================================
 * Time / formatting utilities — Asia/Jerusalem with DST awareness.
 * ===================================================================*/
import type { Match, MatchStatus } from "./types";

export const TZ = "Asia/Jerusalem";

export const HEB_DAYS    = ["יום ראשון","יום שני","יום שלישי","יום רביעי","יום חמישי","יום שישי","שבת"];
export const HEB_DAYS_S  = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
export const HEB_MONTHS  = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

interface IsraelParts { year:number; month:number; day:number; hour:number; minute:number; date:Date; }

export function israelParts(utcIso: string): IsraelParts {
  const d = new Date(utcIso);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  return {
    year: +parts.year, month: +parts.month, day: +parts.day,
    hour: +parts.hour, minute: +parts.minute, date: d,
  };
}

export function israelDateKey(utcIso: string): string {
  const p = israelParts(utcIso);
  return `${p.year}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}`;
}

export function todayKey(): string {
  return israelDateKey(new Date().toISOString());
}

export function tomorrowKey(): string {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + 1);
  return israelDateKey(t.toISOString());
}

export function formatIsraelDate(utcIso: string, opts: { short?: boolean } = {}): string {
  const p = israelParts(utcIso);
  const weekdayIdx = new Date(`${p.year}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}T12:00:00`).getDay();
  const dayName = opts.short ? HEB_DAYS_S[weekdayIdx] : HEB_DAYS[weekdayIdx];
  return `${dayName}, ${p.day} ${HEB_MONTHS[p.month-1]} ${p.year}`;
}

export function formatIsraelTime(utcIso: string): string {
  const p = israelParts(utcIso);
  return `${String(p.hour).padStart(2,"0")}:${String(p.minute).padStart(2,"0")}`;
}

export function israelOffsetHours(utcIso: string): number {
  const d = new Date(utcIso);
  const localStr = d.toLocaleString("en-US", { timeZone: TZ, hour12: false });
  const utcStr   = d.toLocaleString("en-US", { timeZone: "UTC", hour12: false });
  return Math.round((new Date(localStr).getTime() - new Date(utcStr).getTime()) / 3600000);
}

export function relativeLabel(utcIso: string): string | null {
  const now = new Date();
  const target = new Date(utcIso);
  const diffMs = target.getTime() - now.getTime();
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

export function countdownString(utcIso: string) {
  const now = new Date();
  const target = new Date(utcIso);
  let diff = Math.max(0, target.getTime() - now.getTime());
  const d = Math.floor(diff / 86400000); diff -= d * 86400000;
  const h = Math.floor(diff / 3600000);  diff -= h * 3600000;
  const m = Math.floor(diff / 60000);    diff -= m * 60000;
  const s = Math.floor(diff / 1000);
  return { d, h, m, s };
}

export function formatCountdown(utcIso: string): string {
  const { d, h, m, s } = countdownString(utcIso);
  if (d + h + m + s === 0) return "🔴 חי / נגמר";
  return `${String(d).padStart(2,"0")}י׳ ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

export function matchLiveStatus(match: Match): MatchStatus {
  const now = Date.now();
  const start = new Date(match.utc).getTime();
  const end = start + 115 * 60 * 1000;
  if (now < start - 30 * 60 * 1000) return "scheduled";
  if (now >= start - 30 * 60 * 1000 && now < start) return "pregame";
  if (now >= start && now <= end) return "live";
  return "finished";
}

/* Apply admin overrides shape to a match (returns a fresh object) */
import type { BroadcastOverrideDoc } from "./types";
export function applyOverride(match: Match, override?: BroadcastOverrideDoc | null): Match {
  if (!override) return match;
  return {
    ...match,
    ...(override.utc       ? { utc: override.utc }                : {}),
    ...(override.channels  ? { channels: override.channels }      : {}),
    ...(override.studioShow !== undefined ? { studioShow: override.studioShow ?? null } : {}),
    ...(override.status    ? { status: override.status }          : {}),
  };
}

/* Convert datetime-local input string ('YYYY-MM-DDTHH:MM') treated as Asia/Jerusalem → UTC ISO */
export function localInputToUtc(local: string): string {
  const [date, time] = local.split("T");
  const [Y,M,D] = date.split("-").map(Number);
  const [h,m] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(Y, M-1, D, h, m));
  const off = israelOffsetHours(guess.toISOString());
  return new Date(Date.UTC(Y, M-1, D, h - off, m)).toISOString();
}

export function utcToLocalInput(utcIso: string): string {
  const p = israelParts(utcIso);
  return `${p.year}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}T${String(p.hour).padStart(2,"0")}:${String(p.minute).padStart(2,"0")}`;
}
