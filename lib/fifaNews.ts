/* =====================================================================
 * Curated FIFA breaking-news / milestone notifications, scoped strictly
 * to the 2026 World Cup itself (not club football, not other FIFA news).
 * This is a static, manually-curated list of real, verified facts about
 * the tournament — there is no live FIFA news feed wired up. Update this
 * list as new official FIFA announcements are published.
 * ===================================================================*/

export type FifaNewsItem = {
  id: string;
  text: string;
};

export const FIFA_NEWS_2026: FifaNewsItem[] = [
  {
    id: "opening-match",
    text: "🏆 מחר נפתח המונדיאל! משחק הפתיחה: מקסיקו נגד דרום אפריקה, 22:00 (שעון ישראל), אצטדיון אסטדיו אצטקה, מקסיקו סיטי",
  },
  {
    id: "opening-ceremony",
    text: "🎉 טקס הפתיחה הרשמי של פיפא יתקיים מחר בשעה 20:00 (שעון ישראל), לפני משחק הפתיחה",
  },
  {
    id: "format",
    text: "🌎 לראשונה בהיסטוריה: 48 נבחרות, 104 משחקים ו-39 ימי תחרות, בשלוש מדינות מארחות — ארה״ב, קנדה ומקסיקו",
  },
  {
    id: "final",
    text: "🏟️ הגמר הגדול ייערך ב-19.7.2026 באצטדיון MetLife שבאזור ניו יורק/ניו ג׳רזי",
  },
];
