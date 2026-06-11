/* =====================================================================
 * Curated FIFA breaking-news / milestone notifications, scoped strictly
 * to the 2026 World Cup itself (not club football, not other FIFA news).
 * This is a static, manually-curated list of real, verified facts about
 * the tournament — there is no live FIFA news feed wired up. Update this
 * list as new official FIFA announcements are published.
 *
 * Items that reference "today"/"tomorrow" are computed dynamically from
 * the real calendar (Israel-local date) so they never show stale wording
 * (e.g. saying "tomorrow" for a date that has already arrived or passed).
 * Once a dated item's date is in the past it is dropped from the list.
 * ===================================================================*/
import { todayKey, tomorrowKey } from "./utils";

export type FifaNewsItem = {
  id: string;
  text: string;
};

/* Opening match (M001): MEX vs RSA, Estadio Azteca, Mexico City */
const OPENING_DATE = "2026-06-11";
/* Final: MetLife Stadium, NY/NJ */
const FINAL_DATE = "2026-07-19";

export function getFifaNews(): FifaNewsItem[] {
  const tk = todayKey();
  const tmk = tomorrowKey();
  const items: FifaNewsItem[] = [];

  if (tk === OPENING_DATE) {
    items.push({
      id: "opening-match",
      text: "🏆 היום נפתח המונדיאל! משחק הפתיחה: מקסיקו נגד דרום אפריקה, 22:00 (שעון ישראל), אצטדיון אסטדיו אצטקה, מקסיקו סיטי",
    });
    items.push({
      id: "opening-ceremony",
      text: "🎉 טקס הפתיחה הרשמי של פיפא יתקיים היום בשעה 20:00 (שעון ישראל), לפני משחק הפתיחה",
    });
  } else if (tmk === OPENING_DATE) {
    items.push({
      id: "opening-match",
      text: "🏆 מחר נפתח המונדיאל! משחק הפתיחה: מקסיקו נגד דרום אפריקה, 22:00 (שעון ישראל), אצטדיון אסטדיו אצטקה, מקסיקו סיטי",
    });
    items.push({
      id: "opening-ceremony",
      text: "🎉 טקס הפתיחה הרשמי של פיפא יתקיים מחר בשעה 20:00 (שעון ישראל), לפני משחק הפתיחה",
    });
  }
  /* if OPENING_DATE is already in the past, both items are simply omitted */

  items.push({
    id: "format",
    text: "🌎 לראשונה בהיסטוריה: 48 נבחרות, 104 משחקים ו-39 ימי תחרות, בשלוש מדינות מארחות — ארה״ב, קנדה ומקסיקו",
  });

  if (tk === FINAL_DATE) {
    items.push({
      id: "final",
      text: "🏟️ היום הגמר הגדול! באצטדיון MetLife שבאזור ניו יורק/ניו ג׳רזי",
    });
  } else if (tk < FINAL_DATE) {
    items.push({
      id: "final",
      text: "🏟️ הגמר הגדול ייערך ב-19.7.2026 באצטדיון MetLife שבאזור ניו יורק/ניו ג׳רזי",
    });
  }
  /* if FINAL_DATE is already in the past, this item is omitted too */

  return items;
}
