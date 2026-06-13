/* =====================================================================
 * AI web-search fallback — used by lib/sync-results-core.ts ONLY when
 * football-data.org / footballdata.io haven't (yet) reported something we
 * need: a final score, the two teams in an unresolved knockout bracket
 * slot, or the goalscorer/assist breakdown for a finished match.
 *
 * Every function here asks Claude (with the web_search tool) to find the
 * REAL, citable answer and is instructed to return found:false rather than
 * guess. Callers must treat found:false as "do nothing, retry later" — per
 * the app's no-fake-data policy, NOTHING is ever fabricated.
 * ===================================================================*/
import type { ExternalGoal } from "./football-data-api";

export interface AiResultLookup {
  found: boolean;
  home?: number;
  away?: number;
  /** English team names — always returned when found, so the caller can
   *  map them to internal codes via teamCodeFromApiName (used when the
   *  caller didn't already know which teams were playing). */
  homeTeamName?: string;
  awayTeamName?: string;
  winnerSide?: "HOME" | "AWAY" | "DRAW";
  sources?: string[];
}

export interface AiGoalsLookup {
  found: boolean;
  /** Side relative to the home/away orientation the caller supplied. */
  goals?: { minute: number | null; side: "HOME" | "AWAY"; scorer: string; assist?: string; type?: string }[];
  sources?: string[];
  /** Diagnostic-only: why found:false, surfaced via aiGoalsFallback so a
   * manual ?force=1 call can show WHY without needing server logs. Never
   * affects behavior — callers still treat found:false as "retry later". */
  reason?: string;
}

const RESULT_SYSTEM_PROMPT = `אתה עוזר שמאתר תוצאות סופיות אמיתיות של משחקי מונדיאל הכדורגל 2026 באמצעות חיפוש אינטרנט.
חפש מידע באתרים אמינים בלבד (fifa.com, bbc.com/sport, espn.com, uefa.com, reuters, sky sports, אתרי הפדרציות הרשמיות).
החזר תשובה אך ורק כ-JSON תקין, ללא טקסט נוסף, בפורמט:
{"found": true, "home": <מספר>, "away": <מספר>, "homeTeamName": "<שם הקבוצה הביתית באנגלית>", "awayTeamName": "<שם הקבוצה האורחת באנגלית>", "winnerSide": "HOME"|"AWAY"|"DRAW"|null}
או אם לא הצלחת לאמת ממקור אמיתי, או שהמשחק עדיין לא הסתיים, או שלא הצלחת לזהות איזה משחק זה:
{"found": false}

חוקים קריטיים:
- אסור לנחש, להעריך או "להמציא" שום נתון. אם אין מקור אמיתי ומאומת — found: false.
- "home"/"away" הם מספרי שערים סופיים (כולל הארכה/פנדלים אם רלוונטי), מספרים שלמים אי-שליליים בלבד.
- "homeTeamName"/"awayTeamName" — שמות הקבוצות באנגלית, תמיד בהתאם לאוריינטציה home/away שביקשת.
- winnerSide רלוונטי רק למשחקי נוקאאוט שהוכרע בהם מנצח (כולל אחרי פנדלים) — אחרת null.`;

const GOALS_SYSTEM_PROMPT = `אתה עוזר שמאתר את רשימת מבקיעי השערים והמבשלים האמיתית של משחק כדורגל מסוים, באמצעות חיפוש אינטרנט באתרים אמינים (fifa.com, bbc.com/sport, espn.com, uefa.com, אתרי הפדרציות).
קיבלת את שתי הקבוצות, התאריך, והתוצאה הסופית שכבר אומתה.
החזר תשובה אך ורק כ-JSON תקין:
{"found": true, "goals": [{"minute": <מספר|null>, "side": "home"|"away", "scorer": "<שם השחקן>", "assist": "<שם השחקן>"|null, "type": "PENALTY"|"OWN"|null}, ...]}
או אם לא מצאת פירוט מלא ומאומת:
{"found": false}

חוקים קריטיים:
- אסור להמציא שמות שחקנים, דקות, או בישולים. אם אינך מוצא מקור אמיתי עם פירוט מלא — found: false.
- מספר האובייקטים ברשימת goals חייב להיות שווה בדיוק לסכום השערים (home+away) שניתן לך. אם אינך בטוח בחלק מהשערים — found: false (הכל או לא כלום, אין למלא נתונים חלקיים).
- "side" מציין איזו קבוצה הבקיעה (home/away לפי האוריינטציה שניתנה), לא איזו קבוצה ניזוקה (שער עצמי משויך לקבוצה שהבקיעה אותו בפועל למול שערה שלה — type:"OWN").`;

/* Returns either the parsed Anthropic API response, or { error } with a
 * short diagnostic string — surfaced (for goals lookups) via
 * AiGoalsLookup.reason so a manual ?force=1 call can show WHY a lookup
 * failed (missing key, HTTP error, etc.) without needing server logs. */
async function callClaude(system: string, userMsg: string, maxTokens: number, useWebSearch: boolean = true): Promise<{ content: any[] } | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "no_api_key" };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        system,
        ...(useWebSearch ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] } : {}),
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return { error: `http_${r.status}: ${errText.slice(0, 300)}` };
    }
    return await r.json();
  } catch (e: any) {
    return { error: `fetch_failed: ${e?.message || String(e)}` };
  }
}

function extractSourcesAndJson(data: { content: any[] }): { sources: string[]; parsed: any | null; rawText: string } {
  const content: any[] = data.content || [];
  const sources: string[] = [];
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const item of block.content) {
        if (item?.url) sources.push(item.url);
      }
    }
  }
  const textBlocks = content.filter(b => b.type === "text").map(b => b.text || "");
  const text = textBlocks.join("\n").trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { sources, parsed: null, rawText: text };
  try {
    return { sources, parsed: JSON.parse(jsonMatch[0]), rawText: text };
  } catch {
    return { sources, parsed: null, rawText: text };
  }
}

/**
 * Look up a match's final score.
 *  - If homeName/awayName are known, asks for that specific fixture.
 *  - If they're NOT known (unresolved knockout bracket slot), pass
 *    `stageLabel` instead — the model identifies the two teams from the
 *    date/stage and returns their names too (homeTeamName/awayTeamName),
 *    which the caller can map to internal codes.
 */
export async function lookupResultViaAI(opts: {
  homeName?: string;
  awayName?: string;
  dateISO: string;
  isKnockout?: boolean;
  stageLabel?: string;
}): Promise<AiResultLookup> {
  let userMsg: string;
  if (opts.homeName && opts.awayName) {
    userMsg =
      `מצא את התוצאה הסופית והרשמית של משחק מונדיאל 2026: ${opts.homeName} מול ${opts.awayName}, שמתוכנן/נערך בתאריך ${opts.dateISO}.` +
      (opts.isKnockout
        ? " זהו משחק נוקאאוט — אם הסתיים בשוויון אחרי 90 דקות, ציין את התוצאה הסופית (כולל הארכה/פנדלים אם היו) ואת הקבוצה המנצחת ב-winnerSide. וודא ש-homeTeamName מתאים ל" + opts.homeName + " ו-awayTeamName מתאים ל" + opts.awayName + "."
        : ` וודא ש-homeTeamName מתאים ל${opts.homeName} ו-awayTeamName מתאים ל${opts.awayName}.`) +
      " אם המשחק עדיין לא הסתיים או שאין מקור אמיתי לתוצאה — החזר found:false.";
  } else if (opts.stageLabel) {
    userMsg =
      `איזה משחק התקיים במונדיאל הכדורגל 2026 בשלב "${opts.stageLabel}" בתאריך/שעה (UTC) ${opts.dateISO}? ` +
      `זהה את שתי הקבוצות (homeTeamName/awayTeamName באנגלית) ואת התוצאה הסופית (כולל הארכה/פנדלים אם היו, ואת הקבוצה המנצחת ב-winnerSide). ` +
      `אם אינך מצליח לזהות בוודאות איזה משחק זה, או שלא הסתיים, או שאין מקור אמיתי — החזר found:false.`;
  } else {
    return { found: false };
  }

  const data = await callClaude(RESULT_SYSTEM_PROMPT, userMsg, 700);
  if ("error" in data) return { found: false };

  const { sources, parsed } = extractSourcesAndJson(data);
  if (!parsed || parsed.found !== true) return { found: false };
  if (typeof parsed.home !== "number" || typeof parsed.away !== "number") return { found: false };
  if (!Number.isInteger(parsed.home) || !Number.isInteger(parsed.away)) return { found: false };
  if (parsed.home < 0 || parsed.away < 0) return { found: false };

  const winnerSide: AiResultLookup["winnerSide"] =
    parsed.winnerSide === "HOME" || parsed.winnerSide === "AWAY" || parsed.winnerSide === "DRAW"
      ? parsed.winnerSide
      : undefined;

  return {
    found: true,
    home: parsed.home,
    away: parsed.away,
    homeTeamName: typeof parsed.homeTeamName === "string" ? parsed.homeTeamName : undefined,
    awayTeamName: typeof parsed.awayTeamName === "string" ? parsed.awayTeamName : undefined,
    winnerSide,
    sources: sources.slice(0, 5),
  };
}

/**
 * Look up the goalscorer/assist breakdown for a finished match whose final
 * score is already known and verified. Used as a fallback for /api/scorers
 * ("מלך השערים והבישולים") when football-data.org didn't supply goal
 * detail (e.g. the result itself came via lookupResultViaAI, or
 * fetchExternalMatchDetails failed/wasn't configured).
 */
export async function lookupGoalsViaAI(opts: {
  homeName: string;
  awayName: string;
  dateISO: string;
  homeScore: number;
  awayScore: number;
}): Promise<AiGoalsLookup> {
  const userMsg =
    `מצא את רשימת מבקיעי השערים (ואת המבשלים, אם ידועים) במשחק מונדיאל 2026: ${opts.homeName} ${opts.homeScore}:${opts.awayScore} ${opts.awayName}, שנערך בתאריך ${opts.dateISO}. ` +
    `סך הכל יש ${opts.homeScore + opts.awayScore} שערים במשחק זה. אם אינך מוצא פירוט מלא ומאומת לכל השערים — החזר found:false.`;

  const data = await callClaude(GOALS_SYSTEM_PROMPT, userMsg, 1200);
  if ("error" in data) return { found: false, reason: data.error };

  const { sources, parsed, rawText } = extractSourcesAndJson(data);
  if (!parsed) return { found: false, reason: `no_json_in_response: ${rawText.slice(0, 200)}` };
  if (parsed.found !== true) return { found: false, reason: "ai_returned_found_false" };
  if (!Array.isArray(parsed.goals)) return { found: false, reason: "missing_goals_array" };

  const expectedTotal = opts.homeScore + opts.awayScore;
  if (parsed.goals.length !== expectedTotal) {
    return { found: false, reason: `count_mismatch: got ${parsed.goals.length}, expected ${expectedTotal}` };
  }

  const goals: AiGoalsLookup["goals"] = [];
  for (const g of parsed.goals) {
    if (!g || typeof g.scorer !== "string" || !g.scorer.trim()) return { found: false, reason: "invalid_goal_entry: missing scorer" };
    if (g.side !== "home" && g.side !== "away") return { found: false, reason: "invalid_goal_entry: bad side" };
    goals.push({
      minute: typeof g.minute === "number" ? g.minute : null,
      side: g.side === "home" ? "HOME" : "AWAY",
      scorer: g.scorer.trim(),
      assist: typeof g.assist === "string" && g.assist.trim() ? g.assist.trim() : undefined,
      type: typeof g.type === "string" ? g.type : undefined,
    });
  }

  return { found: true, goals, sources: sources.slice(0, 5) };
}

/** Convenience: map an AiGoalsLookup result to ExternalGoal[] given the
 * caller's home/away team codes.
 *
 * IMPORTANT: `assist`/`type` are omitted entirely when absent rather than
 * set to `undefined` — Firestore rejects `undefined` values in documents
 * ("Cannot use \"undefined\" as a Firestore value"), which previously made
 * the whole sync write fail whenever a goal had no assist. */
export function aiGoalsToExternalGoals(goals: AiGoalsLookup["goals"], homeCode: string, awayCode: string): ExternalGoal[] {
  return (goals || []).map(g => {
    const goal: ExternalGoal = {
      minute: g.minute,
      teamCode: g.side === "HOME" ? homeCode : awayCode,
      scorer: g.scorer,
    };
    if (g.assist) goal.assist = g.assist;
    if (g.type) goal.type = g.type;
    return goal;
  });
}

const TRANSLATE_SYSTEM_PROMPT = `אתה מומחה לתעתיק שמות שחקני כדורגל מאנגלית לעברית, בדיוק כפי שמקובל בתקשורת הספורט הישראלית (כמו ONE, ספורט 5, ynet ספורט, מאקו ספורט).
קיבלת רשימת שמות שחקנים באנגלית. עבור כל שם, החזר את התעתיק העברי הטבעי והמדויק ביותר (כפי שהיה נכתב בכתבה ישראלית), ולא תרגום מילולי.
החזר תשובה אך ורק כ-JSON תקין, ללא טקסט נוסף, בפורמט:
{"translations": {"<השם המקורי באנגלית 1>": "<תעתיק בעברית 1>", "<השם המקורי באנגלית 2>": "<תעתיק בעברית 2>"}}
חוקים קריטיים:
- המפתחות ב-JSON חייבים להיות זהים בדיוק (אות-לאות) לשמות שניתנו לך, כולל אותיות גדולות/קטנות וסימנים מיוחדים.
- תעתיק לעברית בלבד, ללא ניקוד.
- אם יש לשחקן שם מוכר בעברית (שחקן ידוע) — השתמש בו. אחרת — תעתיק פונטי טבעי.`;

/** Best-effort Hebrew transliteration for a batch of player names (e.g.
 * goalscorers/assisters from /api/scorers whose English names aren't in the
 * curated lib/players.ts database). No web search needed — this is a pure
 * transliteration task, so it's cheap and fast. Returns {} (never throws) on
 * any failure — callers should fall back to the original English name for
 * any name missing from the returned map. */
export async function translateNamesToHebrew(names: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(names.filter(n => n && n.trim())));
  if (!unique.length) return {};

  const userMsg = `תעתק לעברית את שמות השחקנים הבאים:\n${unique.map(n => `- ${n}`).join("\n")}`;
  const data = await callClaude(TRANSLATE_SYSTEM_PROMPT, userMsg, 1000, false);
  if ("error" in data) return {};

  const { parsed } = extractSourcesAndJson(data);
  if (!parsed || typeof parsed.translations !== "object" || !parsed.translations) return {};

  const out: Record<string, string> = {};
  for (const n of unique) {
    const v = (parsed.translations as Record<string, unknown>)[n];
    if (typeof v === "string" && v.trim()) out[n] = v.trim();
  }
  return out;
}
