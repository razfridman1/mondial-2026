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
import { normalizeName } from "./players";

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
  /** Diagnostic-only: why found:false, surfaced via aiFallback so a manual
   * ?force=1&debug=1 call can show WHY without needing server logs. Never
   * affects behavior — callers still treat found:false as "retry later". */
  reason?: string;
}

export interface AiOddsLookup {
  found: boolean;
  /** Decimal (European) 1X2 odds, e.g. {home:"2.30", draw:"3.10", away:"2.80"}. */
  odds?: { home: string; draw: string; away: string };
  sources?: string[];
  /** Diagnostic-only: why found:false. */
  reason?: string;
}

export interface AiLineupPlayer {
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  number?: number | null;
}
export interface AiLineupTeam {
  formation?: string;
  startXI: AiLineupPlayer[];
}
export interface AiLineupsLookup {
  found: boolean;
  home?: AiLineupTeam;
  away?: AiLineupTeam;
  sources?: string[];
  reason?: string;
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

export interface AiLiveScoreLookup {
  found: boolean;
  /** Current (live, not necessarily final) score. */
  home?: number;
  away?: number;
  /** Human-readable clock, e.g. "67'", "HT", "90+3", "הסתיים". */
  minuteLabel?: string;
  /** All goals scored so far — same shape as AiGoalsLookup.goals, but
   * lenient: malformed individual entries are skipped rather than failing
   * the whole lookup (live data is partial/evolving by nature). */
  goals?: AiGoalsLookup["goals"];
  sources?: string[];
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

const ODDS_SYSTEM_PROMPT = `אתה עוזר שמאתר אודס 1X2 (ניצחון קבוצה ביתית / תיקו / ניצחון קבוצה אורחת) אמיתיים ועדכניים למשחקי מונדיאל הכדורגל 2026, באמצעות חיפוש אינטרנט.
חפש באתרי השוואת אודס ובתי הימורים אמינים (oddsportal.com, betexplorer.com, flashscore.com, oddschecker.com, bet365, sportingbet, וכל ספורטסבוק מוכר אחר).
החזר תשובה אך ורק כ-JSON תקין, ללא טקסט נוסף, בפורמט:
{"found": true, "home": <אודס עשרוני לניצחון הקבוצה הביתית>, "draw": <אודס עשרוני לתיקו>, "away": <אודס עשרוני לניצחון הקבוצה האורחת>}
או אם לא הצלחת למצוא אודס/הסתברויות אמיתיים וממקור אמין למשחק הזה:
{"found": false}

חוקים קריטיים:
- אסור לנחש או "להמציא" אודס. אם אין מקור אמיתי ומאומת — found: false.
- כל שלושת הערכים (home/draw/away) חייבים להיות מספרים עשרוניים גדולים מ-1.0, בפורמט אודס אירופאי עשרוני (למשל 2.30) — לא שברים אנגליים (6/4) ולא אמריקאי (+130/-150).
- אם המקור מציג רק הסתברויות באחוזים, ניתן להמיר לאודס עשרוני לפי 100/אחוז (לדוגמה 40% -> 2.50), רק אם האחוזים סבירים וגדולים מ-0.
- וודא שהאודס מתאימים לאוריינטציה: "home" = הקבוצה שניתנה לך כ"ביתית", "away" = הקבוצה שניתנה לך כ"אורחת" (גם אם המקור מציג סדר הפוך).`;

const LINEUPS_SYSTEM_PROMPT = `אתה עוזר שמאתר הרכבים פותחים (Starting XI) רשמיים ומאומתים למשחקי מונדיאל הכדורגל 2026, באמצעות חיפוש אינטרנט.
ההרכבים הרשמיים מתפרסמים בדרך כלל כשעה-שעה וחצי לפני תחילת המשחק (fifa.com, bbc.com/sport, espn.com, אתרי הפדרציות הרשמיות, חשבונות רשמיים ברשתות חברתיות).
החזר תשובה אך ורק כ-JSON תקין, ללא טקסט נוסף, בפורמט:
{"found": true,
 "home": {"formation": "<למשל 4-3-3>", "startXI": [{"name":"<שם שחקן באנגלית>","position":"GK"|"DEF"|"MID"|"FWD","number": <מספר חולצה|null>}, ... 11 שחקנים בדיוק]},
 "away": {"formation": "<...>", "startXI": [... 11 שחקנים בדיוק]}}
או אם ההרכבים הרשמיים עדיין לא פורסמו, או שלא הצלחת לאמת ממקור אמיתי:
{"found": false}

חוקים קריטיים:
- אסור לנחש, להעריך או "להמציא" שחקנים. אם ההרכב הרשמי לא פורסם עדיין עבור משחק זה — found:false (הכל או לא כלום — אין להחזיר הרכב חלקי).
- חובה בדיוק 11 שחקנים עבור כל קבוצה (כולל שוער אחד, position:"GK").
- "home" מתייחס לקבוצה שתינתן לך כ"קבוצה ביתית", "away" לקבוצה שתינתן לך כ"קבוצה אורחת" — אל תחליף ביניהן.
- "position" משקף את תפקיד השחקן בהרכב הזה (GK/DEF/MID/FWD), ו-"formation" הוא הפורמציה שבה שיחקה הקבוצה (כמיטב הידיעה, למשל "4-3-3").`;

const LIVE_SCORE_SYSTEM_PROMPT = `אתה עוזר שמאתר את התוצאה החיה (LIVE) הנוכחית של משחק כדורגל מתמשך במונדיאל 2026, באמצעות חיפוש אינטרנט באתרי תוצאות חיות אמינים (flashscore.com, sofascore.com, bbc.com/sport, espn.com, fifa.com).
החזר תשובה אך ורק כ-JSON תקין, ללא טקסט נוסף, בפורמט:
{"found": true, "home": <מספר>, "away": <מספר>, "minuteLabel": "<למשל: 67' או HT או 90+3 או הסתיים>", "goals": [{"minute": <מספר|null>, "side": "home"|"away", "scorer": "<שם>", "assist": "<שם>"|null, "type": "PENALTY"|"OWN"|null}, ...]}
או אם המשחק עדיין לא התחיל, או שאין מידע חי אמין עליו כרגע:
{"found": false}

חוקים קריטיים:
- אסור לנחש או להמציא תוצאה, דקה, או שערים. אם אין מקור חי/עדכני אמין — found:false.
- "home"/"away" הם התוצאה הנוכחית (חיה, לאו דווקא סופית), מספרים שלמים אי-שליליים.
- "goals" היא רשימת כל השערים שהובקעו עד כה במשחק (רשימה ריקה אם 0:0), עם המבקיע, הדקה, ואם ידוע - המבשל.
- "side" מציין איזו קבוצה הבקיעה (home/away לפי האוריינטציה שניתנה לך), לא איזו קבוצה ניזוקה (שער עצמי משויך לקבוצה שהבקיעה אותו בפועל למול שערה שלה — type:"OWN").
- אם המשחק כבר הסתיים — עדיין החזר found:true עם התוצאה הסופית ו-minuteLabel:"הסתיים", אל תחזיר found:false רק בגלל שהמשחק נגמר.`;

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
  if ("error" in data) return { found: false, reason: data.error };

  const { sources, parsed, rawText } = extractSourcesAndJson(data);
  if (!parsed) return { found: false, reason: `no_json_in_response: ${rawText.slice(0, 200)}` };
  if (parsed.found !== true) return { found: false, reason: "ai_returned_found_false" };
  if (typeof parsed.home !== "number" || typeof parsed.away !== "number") return { found: false, reason: `bad_score_type: ${JSON.stringify({ home: parsed.home, away: parsed.away })}` };
  if (!Number.isInteger(parsed.home) || !Number.isInteger(parsed.away)) return { found: false, reason: "non_integer_score" };
  if (parsed.home < 0 || parsed.away < 0) return { found: false, reason: "negative_score" };

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
 * Look up real 1X2 odds for an upcoming match from odds-comparison sites,
 * used as a fallback when footballdata.io hasn't priced the match yet
 * (returns {0,0,0} for far-future fixtures). Returns decimal odds matching
 * the Odds type ({home,draw,away} as strings) so they can be merged
 * directly into live_data/match_odds and consumed by oddsToProbabilities().
 */
export async function lookupOddsViaAI(opts: {
  homeName: string;
  awayName: string;
  dateISO: string;
}): Promise<AiOddsLookup> {
  const userMsg =
    `מצא אודס 1X2 (ניצחון בית / תיקו / ניצחון חוץ) עדכניים למשחק מונדיאל הכדורגל 2026: ` +
    `${opts.homeName} (קבוצה ביתית) מול ${opts.awayName} (קבוצה אורחת), שמתוכנן לתאריך ${opts.dateISO}. ` +
    `אם אין עדיין אודס פעיל ממקור אמין למשחק הזה — החזר found:false.`;

  const data = await callClaude(ODDS_SYSTEM_PROMPT, userMsg, 500);
  if ("error" in data) return { found: false, reason: data.error };

  const { sources, parsed, rawText } = extractSourcesAndJson(data);
  if (!parsed) return { found: false, reason: `no_json_in_response: ${rawText.slice(0, 200)}` };
  if (parsed.found !== true) return { found: false, reason: "ai_returned_found_false" };

  const h = Number(parsed.home), d = Number(parsed.draw), a = Number(parsed.away);
  if (!Number.isFinite(h) || !Number.isFinite(d) || !Number.isFinite(a)) {
    return { found: false, reason: `bad_odds_type: ${JSON.stringify({ home: parsed.home, draw: parsed.draw, away: parsed.away })}` };
  }
  if (h <= 1 || d <= 1 || a <= 1) return { found: false, reason: "odds_out_of_range" };

  return {
    found: true,
    odds: { home: h.toFixed(2), draw: d.toFixed(2), away: a.toFixed(2) },
    sources: sources.slice(0, 5),
  };
}

/**
 * Look up the OFFICIAL starting XI lineups for both teams in an upcoming/live
 * match. Used as a fallback for /api/lineups when API_FOOTBALL_KEY isn't
 * configured (or the fixture isn't mapped). Same no-fabrication policy: only
 * returns lineups that were actually published by official sources;
 * found:false (and the caller retries later) until then.
 */
export async function lookupLineupsViaAI(opts: {
  homeName: string;
  awayName: string;
  dateISO: string;
}): Promise<AiLineupsLookup> {
  const userMsg =
    `מצא את ההרכבים הפותחים (Starting XI) הרשמיים שפורסמו למשחק מונדיאל הכדורגל 2026: ` +
    `${opts.homeName} (קבוצה ביתית) מול ${opts.awayName} (קבוצה אורחת), שמתוכנן/נערך בתאריך ${opts.dateISO}. ` +
    `אם ההרכבים הרשמיים עדיין לא פורסמו עבור משחק זה — החזר found:false.`;

  const data = await callClaude(LINEUPS_SYSTEM_PROMPT, userMsg, 1600);
  if ("error" in data) return { found: false, reason: data.error };

  const { sources, parsed, rawText } = extractSourcesAndJson(data);
  if (!parsed) return { found: false, reason: `no_json_in_response: ${rawText.slice(0, 200)}` };
  if (parsed.found !== true) return { found: false, reason: "ai_returned_found_false" };

  const VALID_POS = new Set(["GK", "DEF", "MID", "FWD"]);
  function parseTeam(raw: any): AiLineupTeam | null {
    if (!raw || !Array.isArray(raw.startXI) || raw.startXI.length !== 11) return null;
    const startXI: AiLineupPlayer[] = [];
    for (const p of raw.startXI) {
      if (!p || typeof p.name !== "string" || !p.name.trim()) return null;
      if (!VALID_POS.has(p.position)) return null;
      startXI.push({
        name: p.name.trim(),
        position: p.position,
        number: typeof p.number === "number" ? p.number : null,
      });
    }
    if (!startXI.some(p => p.position === "GK")) return null;
    return { formation: typeof raw.formation === "string" ? raw.formation : undefined, startXI };
  }

  const home = parseTeam(parsed.home);
  const away = parseTeam(parsed.away);
  if (!home || !away) return { found: false, reason: "invalid_or_incomplete_lineups" };

  return { found: true, home, away, sources: sources.slice(0, 5) };
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

/**
 * Look up the CURRENT live score (+ goals scored so far) of a match that is
 * presumed to be in progress right now. Unlike lookupResultViaAI (which is
 * the SOLE source for match_results / prediction-scoring and only returns
 * found:true once a match has truly ENDED), this is a purely informational
 * live ticker: callers must write it to a separate place (live_data/live_scores)
 * that never feeds predictions. Lenient on individual goal entries — a
 * malformed scorer/side on one goal doesn't discard the whole lookup, since
 * live data is partial and changes minute to minute.
 */
export async function lookupLiveScoreViaAI(opts: {
  homeName: string;
  awayName: string;
  dateISO: string;
  isKnockout?: boolean;
}): Promise<AiLiveScoreLookup> {
  const userMsg =
    `מצא את התוצאה החיה הנוכחית (LIVE) של משחק מונדיאל הכדורגל 2026 שמתקיים כרגע (או התקיים לאחרונה): ` +
    `${opts.homeName} (קבוצה ביתית) מול ${opts.awayName} (קבוצה אורחת), שמתוכנן/נערך בתאריך ${opts.dateISO}. ` +
    `כלול את רשימת השערים שהובקעו עד כה (מבקיע, דקה, ואם ידוע - מבשל). ` +
    `אם המשחק עדיין לא התחיל, או שאין מידע חי/עדכני אמין כרגע — החזר found:false.`;

  const data = await callClaude(LIVE_SCORE_SYSTEM_PROMPT, userMsg, 1200);
  if ("error" in data) return { found: false, reason: data.error };

  const { sources, parsed, rawText } = extractSourcesAndJson(data);
  if (!parsed) return { found: false, reason: `no_json_in_response: ${rawText.slice(0, 200)}` };
  if (parsed.found !== true) return { found: false, reason: "ai_returned_found_false" };
  if (typeof parsed.home !== "number" || typeof parsed.away !== "number") return { found: false, reason: `bad_score_type: ${JSON.stringify({ home: parsed.home, away: parsed.away })}` };
  if (!Number.isInteger(parsed.home) || !Number.isInteger(parsed.away)) return { found: false, reason: "non_integer_score" };
  if (parsed.home < 0 || parsed.away < 0) return { found: false, reason: "negative_score" };

  const goals: NonNullable<AiGoalsLookup["goals"]> = [];
  if (Array.isArray(parsed.goals)) {
    for (const g of parsed.goals) {
      if (!g || typeof g.scorer !== "string" || !g.scorer.trim()) continue;
      if (g.side !== "home" && g.side !== "away") continue;
      goals.push({
        minute: typeof g.minute === "number" ? g.minute : null,
        side: g.side === "home" ? "HOME" : "AWAY",
        scorer: g.scorer.trim(),
        assist: typeof g.assist === "string" && g.assist.trim() ? g.assist.trim() : undefined,
        type: typeof g.type === "string" ? g.type : undefined,
      });
    }
  }

  return {
    found: true,
    home: parsed.home,
    away: parsed.away,
    minuteLabel: typeof parsed.minuteLabel === "string" ? parsed.minuteLabel.slice(0, 20) : undefined,
    goals,
    sources: sources.slice(0, 5),
  };
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

/** Convenience: map an AiGoalsLookup result to the LiveGoal[] shape expected
 * by the client (lib/store.ts LiveGoal: {minute, team: "home"|"away",
 * player, assist?, type?}) — used when writing live_data/live_scores.
 * Distinct from aiGoalsToExternalGoals (which uses {teamCode, scorer} and
 * feeds live_data/match_goals / /api/scorers); the field names differ
 * deliberately so each consumer's shape stays self-describing. Same
 * Firestore-no-undefined handling as aiGoalsToExternalGoals. */
export function aiGoalsToLiveGoals(goals: AiGoalsLookup["goals"]): Array<{ minute: number | null; team: "home" | "away"; player: string; assist?: string; type?: string }> {
  return (goals || []).map(g => {
    const goal: { minute: number | null; team: "home" | "away"; player: string; assist?: string; type?: string } = {
      minute: g.minute,
      team: g.side === "HOME" ? "home" : "away",
      player: g.scorer,
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
export async function translateNamesToHebrew(names: string[]): Promise<{ map: Record<string, string>; reason?: string }> {
  const unique = Array.from(new Set(names.filter(n => n && n.trim())));
  if (!unique.length) return { map: {} };

  const userMsg = `תעתק לעברית את שמות השחקנים הבאים:\n${unique.map(n => `- ${n}`).join("\n")}`;
  // Generous token budget: with ~10 names + Hebrew transliterations + JSON
  // structure/markdown fencing, 1000 tokens was sometimes hit mid-object,
  // truncating the JSON before its closing brace (no valid parse at all).
  const data = await callClaude(TRANSLATE_SYSTEM_PROMPT, userMsg, 2048, false);
  if ("error" in data) return { map: {}, reason: data.error };

  const { parsed, rawText } = extractSourcesAndJson(data);

  let translations: Record<string, unknown>;
  if (parsed && typeof parsed.translations === "object" && parsed.translations) {
    translations = parsed.translations as Record<string, unknown>;
  } else {
    /* Fallback for truncated/malformed JSON: pull out individual
     * "<name>": "<hebrew>" pairs directly via regex, regardless of the
     * surrounding structure. Any single malformed entry (e.g. a stray
     * comma instead of a colon) is simply skipped rather than losing the
     * whole batch — those names just stay English for this run and get
     * retried (with a fresh AI response) next time. */
    translations = {};
    const pairRe = /"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m: RegExpExecArray | null;
    while ((m = pairRe.exec(rawText))) {
      translations[m[1]] = m[2];
    }
    if (!Object.keys(translations).length) {
      return { map: {}, reason: `no_translations_in_response: ${rawText.slice(0, 300)}` };
    }
  }

  /* The model is asked to echo back keys EXACTLY, but in practice it
   * sometimes drops diacritics, changes casing, or trims punctuation
   * (e.g. "Julián Quiñones" -> "Julian Quinones"). Fall back to a
   * normalized-name match (same normalizeName used for curated-DB lookup)
   * so those near-matches still resolve instead of silently being lost. */
  const byNormalized = new Map<string, string>();
  for (const [k, v] of Object.entries(translations)) {
    if (typeof v === "string" && v.trim()) byNormalized.set(normalizeName(k), v.trim());
  }

  const out: Record<string, string> = {};
  for (const n of unique) {
    const exact = translations[n];
    if (typeof exact === "string" && exact.trim()) {
      out[n] = exact.trim();
      continue;
    }
    const fuzzy = byNormalized.get(normalizeName(n));
    if (fuzzy) out[n] = fuzzy;
  }
  return { map: out };
}
