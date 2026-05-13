/* =====================================================================
 * Achievements catalog + unlock evaluator.
 * ===================================================================*/
import type { AchievementDef } from "./types";

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-pick",     name: "המנחש הראשון",       description: "סימן את הניחוש הראשון",                  icon: "🎯" },
  { id: "five-correct",   name: "חמשת המוסקטרים",    description: "5 ניחושים נכונים",                       icon: "✋" },
  { id: "exact-master",   name: "צלף תוצאות מדויקות", description: "3 ניחושים מדויקים (תוצאה זהה לחלוטין)", icon: "🎯" },
  { id: "streak-3",       name: "סטריק 3",            description: "3 ניחושים נכונים ברצף",                  icon: "🔥" },
  { id: "streak-5",       name: "סטריק 5",            description: "5 ניחושים נכונים ברצף",                  icon: "🔥🔥" },
  { id: "streak-10",      name: "סטריק אגדי",         description: "10 ניחושים נכונים ברצף",                 icon: "👑" },
  { id: "all-stages",     name: "כל השלבים",          description: "ניחוש לפחות במשחק אחד בכל שלב",          icon: "🏆" },
  { id: "social",         name: "מנחש חברתי",         description: "שיתף ניחוש בווטסאפ",                     icon: "💬" },
  { id: "joker-played",   name: "ג׳וקר על השולחן",    description: "השתמש ב-Joker למשחק",                    icon: "🃏" },
  { id: "first-100",      name: "מועדון ה-100",       description: "הגיע ל-100 נקודות",                      icon: "💯" },
  { id: "first-500",      name: "מועדון ה-500",       description: "הגיע ל-500 נקודות",                      icon: "🏅" },
  { id: "perfect-day",    name: "יום מושלם",          description: "כל הניחושים של אותו יום היו נכונים",     icon: "✨" },
  { id: "group-founder",  name: "מקים הקבוצה",        description: "פתח קבוצה חברתית פרטית",                 icon: "👥" },
  { id: "group-winner",   name: "מלך הקבוצה",         description: "הגיע למקום ראשון בלוח התוצאות הקבוצתי",  icon: "🥇" },
];

/* Lightweight evaluator — returns achievement ids to unlock for a user.
 * Pass the precomputed userTotals + extra signals. */
export interface UnlockSignals {
  totalPoints: number;
  exactCount: number;
  resultCount: number;
  streak: number;
  predictionsCount: number;
  sharedToWhatsapp: boolean;
  stagesPredicted: Set<string>;
  jokerUsed: boolean;
  groupOwner: boolean;
  groupWinner: boolean;
  perfectDay: boolean;
}

export function evaluateUnlocks(s: UnlockSignals): string[] {
  const out: string[] = [];
  if (s.predictionsCount >= 1) out.push("first-pick");
  if (s.resultCount >= 5)      out.push("five-correct");
  if (s.exactCount >= 3)       out.push("exact-master");
  if (s.streak >= 3)           out.push("streak-3");
  if (s.streak >= 5)           out.push("streak-5");
  if (s.streak >= 10)          out.push("streak-10");
  if (s.stagesPredicted.size >= 7) out.push("all-stages");
  if (s.sharedToWhatsapp)      out.push("social");
  if (s.jokerUsed)             out.push("joker-played");
  if (s.totalPoints >= 100)    out.push("first-100");
  if (s.totalPoints >= 500)    out.push("first-500");
  if (s.perfectDay)            out.push("perfect-day");
  if (s.groupOwner)            out.push("group-founder");
  if (s.groupWinner)           out.push("group-winner");
  return out;
}
