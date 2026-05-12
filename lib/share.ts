/* =====================================================================
 * Sharing helpers — WhatsApp deep links + native Web Share API fallback.
 * Everything in Hebrew, with emoji and the AppUrl.
 * ===================================================================*/
import { TEAMS, CHANNELS, STAGES, VENUES } from "./data";
import { formatIsraelDate, formatIsraelTime } from "./utils";
import type { Match } from "./types";

function appUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL || "https://mondial-2026.vercel.app";
}

export function matchShareText(m: Match): string {
  const home = TEAMS[m.home]?.name || m.home;
  const away = TEAMS[m.away]?.name || m.away;
  const homeFlag = TEAMS[m.home]?.flag || "";
  const awayFlag = TEAMS[m.away]?.flag || "";
  const stage = STAGES[m.stage]?.name || "";
  const channels = (m.channels || []).map(c => CHANNELS[c]?.name).filter(Boolean).join(" · ");
  const venue = VENUES[m.venue];
  return [
    `⚽ מונדיאל 2026`,
    `${homeFlag} *${home}* נגד *${away}* ${awayFlag}`,
    `🏆 ${stage}${m.group ? ` · בית ${m.group}` : ""}`,
    `📅 ${formatIsraelDate(m.utc)} · 🕒 ${formatIsraelTime(m.utc)} (שעון ישראל)`,
    `🏟️ ${venue?.name || ""}${venue ? ` · ${venue.city} ${venue.flag}` : ""}`,
    channels ? `📺 שידור בישראל: ${channels}` : "",
    `🔗 ${appUrl()}?match=${m.id}`,
  ].filter(Boolean).join("\n");
}

export function predictionShareText(m: Match, home: number, away: number): string {
  const homeTeam = TEAMS[m.home]?.name || m.home;
  const awayTeam = TEAMS[m.away]?.name || m.away;
  return [
    `🔮 הניחוש שלי למשחק מונדיאל 2026:`,
    `${TEAMS[m.home]?.flag || ""} ${homeTeam} *${home} : ${away}* ${awayTeam} ${TEAMS[m.away]?.flag || ""}`,
    `📅 ${formatIsraelDate(m.utc)} · 🕒 ${formatIsraelTime(m.utc)}`,
    `🔗 ${appUrl()}?match=${m.id}`,
    ``,
    `מה הניחוש שלך? בוא נראה מי יצדק 😎`,
  ].join("\n");
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function nativeShare(title: string, text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && (navigator as any).share) {
    try { await (navigator as any).share({ title, text }); return true; }
    catch { return false; }
  }
  return false;
}

export async function shareToWhatsApp(text: string): Promise<void> {
  // Try native share first (mobile shows WhatsApp in share sheet)
  const native = await nativeShare("מונדיאל 2026", text);
  if (native) return;
  // Otherwise open WhatsApp Web/App directly
  window.open(whatsappUrl(text), "_blank", "noopener");
}
