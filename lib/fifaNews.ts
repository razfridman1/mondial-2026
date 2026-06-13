/* =====================================================================
 * FIFA news ticker content:
 *
 * 1. Special date-triggered items (opening day / final day) — as before.
 * 2. TODAY'S and TOMORROW'S real matches, generated live from the actual
 *    schedule (MATCHES). Since the matches themselves differ from day to
 *    day, this content is automatically fresh and unique every day.
 * 3. A "fact" — picked RANDOMLY (via pickRandomFact) from a pool of 40
 *    curated World Cup 2026 facts + one-per-venue spotlights, by the
 *    ticker component on every page load, so refreshing the page shows a
 *    different message (the component avoids repeating the immediately
 *    previous fact via localStorage).
 * ===================================================================*/
import { todayKey, tomorrowKey, israelDateKey, formatIsraelTime } from "./utils";
import { MATCHES, TEAMS, STAGES, VENUES } from "./data";
import type { Match } from "./types";

export type FifaNewsItem = {
  id: string;
  text: string;
};

/* Opening match (M001): MEX vs RSA, Estadio Azteca, Mexico City */
const OPENING_DATE = "2026-06-11";
/* Final: MetLife Stadium, NY/NJ */
const FINAL_DATE = "2026-07-19";

/* Render a single real match line — only for matches whose teams are
 * already known (skips unresolved knockout placeholders like "1A"/"2B"). */
function matchLine(m: Match): string | null {
  const home = TEAMS[m.home];
  const away = TEAMS[m.away];
  if (!home || !away) return null;
  const stage = STAGES[m.stage];
  const groupTxt = m.group ? ` · בית ${m.group}` : "";
  return `${formatIsraelTime(m.utc)} ${home.flag} ${home.name} – ${away.name} ${away.flag} (${stage?.name || m.stage}${groupTxt})`;
}

/* ----- general curated facts (25) ----- */
const FACTS: string[] = [
  "🌍 מונדיאל 2026 הוא הראשון בהיסטוריה שמתקיים בשלוש מדינות: ארה״ב, קנדה ומקסיקו",
  "👥 48 נבחרות משתתפות במונדיאל הנוכחי — עלייה מ-32 נבחרות במונדיאלים הקודמים",
  "⚽ 104 משחקים בסך הכל, פרוסים על פני 39 ימי תחרות",
  "🏆 12 בתים (A-L) של 4 נבחרות כל אחד; שתי הנבחרות המובילות מכל בית וכן 8 הנבחרות השלישיות הטובות עולות לשלב 32",
  "🆕 שלב 32 הוא שלב חדש שמתווסף לטורניר לראשונה במונדיאל 2026, כחלק מהפורמט המורחב",
  "🇲🇽 מקסיקו היא המדינה הראשונה בהיסטוריה שמארחת מונדיאל בפעם שלישית (1970, 1986, 2026)",
  "🇨🇦 זהו המונדיאל הראשון בהיסטוריה שמתקיים על אדמת קנדה",
  "🇺🇸 ארה״ב מארחת מונדיאל בפעם השנייה (הקודם היה ב-1994), הפעם כחלק משלישיית מדינות מארחות",
  "🏟️ אצטדיון אסטדיו אצטקה במקסיקו סיטי הוא האצטדיון הראשון בעולם שמארח משחקי מונדיאל בשלוש מהדורות שונות (1970, 1986, 2026)",
  "👕 לכל נבחרת מורשה סגל של עד 26 שחקנים, כמו במונדיאל הקודם בקטאר",
  "🤖 גם במונדיאל 2026 ממשיכה להיות בשימוש טכנולוגיית VAR ואופסייד חצי-אוטומטי",
  "🕒 בשל פערי השעות בין ארה״ב/קנדה/מקסיקו לישראל, חלק ניכר מהמשחקים משודרים בלילה ובשעות הקטנות של הבוקר בישראל",
  "📺 כל משחקי המונדיאל משודרים בישראל בערוצי כאן וספורט, וזמני המשחק באפליקציה מוצגים אוטומטית לפי שעון ישראל",
  "🥅 שלב הנוקאאוט כולל: שלב 32, שלב 16, רבע גמר, חצי גמר, משחק על המקום השלישי וגמר",
  "🏁 משחק הגמר יתקיים ב-19 ביולי 2026 באצטדיון MetLife שבאזור ניו יורק/ניו ג׳רזי",
  "🎟️ זהו המונדיאל הגדול ביותר בהיסטוריה — גם במספר הנבחרות וגם במספר המשחקים",
  "🌎 16 אצטדיונים בשלוש מדינות מארחים את משחקי המונדיאל",
  "⏱️ שלב הבתים נמשך כשבועיים, ולאחריו מתחיל שלב הנוקאאוט בפורמט של משחק אחד והחוצה",
  "🔮 אל תשכחו להזין ניחושים לפני נעילת המשחק — 3 דקות לפני שריקת הפתיחה",
  "🃏 ניחוש עם ג׳וקר מכפיל את הניקוד למשחק שבחרתם — השתמשו בו בחוכמה",
  "📅 משחקי שלב הבתים מתקיימים בכל שלוש המדינות המארחות במקביל בימים הראשונים של הטורניר",
  "🌟 הטורניר כולל נבחרות מכל יבשת — אירופה, אמריקה הדרומית, אפריקה, אסיה ואוקיאניה",
  "🧮 חלק מ-48 הנבחרות משתתפות במונדיאל בפעם הראשונה בתולדותיהן",
  "📈 דירוג החברים באפליקציה מתעדכן אוטומטית אחרי כל תוצאה — בדקו איפה אתם עומדים",
  "🏆 עקבו אחרי לוח התוצאות, הטבלאות ושלב הנוקאאוט בלשוניות האפליקציה כדי לא לפספס כלום",
];

/* ----- one spotlight fact per host venue (15, excluding the TBD marker) ----- */
const VENUE_FACTS: string[] = Object.entries(VENUES)
  .filter(([id]) => id !== "TBD")
  .map(([, v]) => `🏟️ ${v.flag} ${v.name}, ${v.city} (${v.country}) — קיבולת כ-${v.capacity.toLocaleString("he-IL")} צופים, אחד מ-16 אצטדיוני המונדיאל`);

export const FACT_POOL: string[] = [...FACTS, ...VENUE_FACTS];

/* Pick a random fact from the pool, avoiding `excludeIndex` (the fact
 * shown on the previous load) when the pool has more than one item — so
 * every page refresh shows a different fact than last time. */
export function pickRandomFact(excludeIndex?: number): FifaNewsItem {
  const n = FACT_POOL.length;
  let idx = Math.floor(Math.random() * n);
  if (n > 1 && idx === excludeIndex) {
    idx = (idx + 1) % n;
  }
  return { id: `fact-${idx}`, text: FACT_POOL[idx] };
}

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

  /* Today's & tomorrow's real matches — different content every day. */
  for (const m of MATCHES) {
    if (israelDateKey(m.utc) !== tk) continue;
    const line = matchLine(m);
    if (line) items.push({ id: `today-${m.id}`, text: `⚽ היום: ${line}` });
  }
  for (const m of MATCHES) {
    if (israelDateKey(m.utc) !== tmk) continue;
    const line = matchLine(m);
    if (line) items.push({ id: `tomorrow-${m.id}`, text: `📅 מחר: ${line}` });
  }

  return items;
}
