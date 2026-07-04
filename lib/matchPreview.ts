/* =====================================================================
 * Match Preview — gathers REAL, structured data about an upcoming match
 * (FIFA ranking, odds-derived win probabilities, recent World Cup form —
 * all looked up directly by team code), then asks Claude (Haiku) to
 * write a short Hebrew preview from that data.
 *
 * Deliberately does NOT use ESPN's free-text "news" articles as an input
 * anymore: that supplement repeatedly leaked in facts about players/teams
 * NOT in the match being previewed (e.g. a "Ronaldo could face Messi in
 * a World Cup final" storyline showing up in a Portugal vs Spain preview,
 * even though Messi's Argentina has nothing to do with that fixture).
 * Every fact fed to the model now comes from data keyed directly by
 * match.home/match.away, so there is no free-text content that could
 * smuggle in an irrelevant team or player.
 *
 * No fabrication: every fact fed to the model came from a real source
 * (lib/fifaRanking.ts, oddsToProbabilities, match_results). If a data
 * point is missing it's simply omitted. If there isn't enough real data
 * to say anything meaningful, returns null.
 * ===================================================================*/
import { TEAMS, MATCHES } from "./data";
import type { Match } from "./types";
import type { MatchResult } from "./standings";
import { oddsToProbabilities } from "./utils";
import { fifaRankingFor, FIFA_RANKING_AS_OF } from "./fifaRanking";

export interface TeamFormEntry {
  opponent: string;
  score: string;
  result: "W" | "D" | "L";
  isHome: boolean;
}

export interface MatchPreviewContext {
  matchId: string;
  home: { code: string; name: string; rank: number | null; form: TeamFormEntry[] };
  away: { code: string; name: string; rank: number | null; form: TeamFormEntry[] };
  probabilities: { home: number; draw: number; away: number } | null;
  rankingAsOf: string;
}

/** Up to `limit` most-recent FINISHED World Cup results for `teamCode`,
 * strictly before `beforeUtc`, derived from match_results + MATCHES. */
function recentWcForm(teamCode: string, results: Record<string, MatchResult>, beforeUtc: string, limit = 3): TeamFormEntry[] {
  const before = new Date(beforeUtc).getTime();
  const finished = MATCHES
    .filter(m => (m.home === teamCode || m.away === teamCode) && results[m.id] && new Date(m.utc).getTime() < before)
    .sort((a, b) => new Date(b.utc).getTime() - new Date(a.utc).getTime())
    .slice(0, limit);

  return finished.map(m => {
    const r = results[m.id];
    const isHome = m.home === teamCode;
    const own = isHome ? r.home : r.away;
    const opp = isHome ? r.away : r.home;
    const oppCode = isHome ? m.away : m.home;
    let result: TeamFormEntry["result"] = "D";
    if (own > opp) result = "W";
    else if (own < opp) result = "L";
    return {
      opponent: TEAMS[oppCode]?.name || oppCode,
      score: `${r.home}:${r.away}`,
      result,
      isHome,
    };
  });
}

/** Gather all real data available for a match preview. Returns null if
 * the teams aren't known yet (knockout placeholder not yet resolved). */
export async function gatherMatchPreviewContext(match: Match, results: Record<string, MatchResult>): Promise<MatchPreviewContext | null> {
  if (match.homeIsPlaceholder || match.awayIsPlaceholder) return null;
  const home = TEAMS[match.home];
  const away = TEAMS[match.away];
  if (!home || !away) return null;

  const homeRank = fifaRankingFor(match.home);
  const awayRank = fifaRankingFor(match.away);
  const probabilities = oddsToProbabilities(match.odds);

  return {
    matchId: match.id,
    home: { code: match.home, name: home.name, rank: homeRank?.rank ?? null, form: recentWcForm(match.home, results, match.utc) },
    away: { code: match.away, name: away.name, rank: awayRank?.rank ?? null, form: recentWcForm(match.away, results, match.utc) },
    probabilities,
    rankingAsOf: FIFA_RANKING_AS_OF,
  };
}

const PREVIEW_SYSTEM_PROMPT = `אתה אנליסט ספורט לאפליקציית מונדיאל 2026.
קיבלת נתונים אמיתיים על משחק קרוב בין שתי קבוצות ספציפיות (ששמן ניתן לך במפורש): דירוג עולמי FIFA, הסתברויות ניצחון/תיקו לפי יחסי הימורים, ותוצאות אחרונות של הקבוצות במונדיאל.
כתוב תצוגה מקדימה קצרה וקולחת בעברית (3-5 משפטים) למשחק הזה בלבד, בין שתי הקבוצות הללו בדיוק ולא אף קבוצה אחרת, המבוססת אך ורק על הנתונים שניתנו.
אם נתון מסוים חסר — פשוט דלג עליו, אל תנחש ואל תמלא בעצמך.
אל תזכיר שום שחקן, מאמן, קבוצה שלישית, משחק עתידי (כמו גמר או חצי גמר היפותטי), או עובדה שלא ניתנה לך במפורש בנתונים שלמעלה — גם אם היא נשמעת מעניינת או ידועה לך מכל מקור אחר.
כתוב טקסט רציף בלבד — בלי כותרות, בלי סימני # או כל עיצוב Markdown, בלי רשימות.
טון: ספורטיבי, מעניין, תמציתי. אל תמציא נתונים מעבר למה שניתן לך.`;

/** Build a plain-text bullet list of the real facts available — used both
 * as the AI prompt input and as a graceful no-AI-key fallback. */
function buildFactSheet(ctx: MatchPreviewContext): string[] {
  const lines: string[] = [];
  if (ctx.home.rank != null || ctx.away.rank != null) {
    lines.push(`דירוג FIFA נכון ל-${ctx.rankingAsOf}: ${ctx.home.name} #${ctx.home.rank ?? "—"}, ${ctx.away.name} #${ctx.away.rank ?? "—"}`);
  }
  if (ctx.probabilities) {
    lines.push(`הסתברויות לפי יחסי הימורים: ${ctx.home.name} ${ctx.probabilities.home}%, תיקו ${ctx.probabilities.draw}%, ${ctx.away.name} ${ctx.probabilities.away}%`);
  }
  if (ctx.home.form.length) {
    lines.push(`תוצאות אחרונות של ${ctx.home.name} במונדיאל: ${ctx.home.form.map(f => `${f.result} ${f.score} מול ${f.opponent}`).join(", ")}`);
  }
  if (ctx.away.form.length) {
    lines.push(`תוצאות אחרונות של ${ctx.away.name} במונדיאל: ${ctx.away.form.map(f => `${f.result} ${f.score} מול ${f.opponent}`).join(", ")}`);
  }
  return lines;
}

/** Generate the Hebrew preview narrative. Returns null if there isn't
 * enough real data to say anything meaningful (avoids generic filler). */
export async function generatePreviewNarrative(ctx: MatchPreviewContext): Promise<string | null> {
  const facts = buildFactSheet(ctx);
  if (facts.length === 0) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return `${ctx.home.name} נגד ${ctx.away.name}:\n` + facts.join("\n");
  }

  const userMsg = `המשחק הוא בין ${ctx.home.name} לבין ${ctx.away.name} בלבד — אלו שתי הקבוצות היחידות שרלוונטיות לתצוגה המקדימה הזו.\n\n` + facts.join("\n") + `\n\nכתוב תצוגה מקדימה למשחק בין ${ctx.home.name} ל-${ctx.away.name} בלבד.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: PREVIEW_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!r.ok) return facts.join("\n");
    const data = await r.json();
    const text = (data.content?.[0]?.text || "").trim();
    return text || facts.join("\n");
  } catch {
    return facts.join("\n");
  }
}
