/* =====================================================================
 * ESPN hidden site API — best-effort helpers, used ONLY to supplement
 * AI-generated match previews/summaries with real, recently-published
 * editorial content (match preview/review articles) about the two
 * teams playing.
 *
 * Per product decision: ESPN is NOT used for stats, rankings, odds, or
 * results — those all come from FIFA ranking (lib/fifaRanking.ts), odds
 * (oddsToProbabilities) and football-data.org (match_results), as
 * before. ESPN is a fallback/supplement ONLY for narrative "preview" /
 * "review" style content, used when available.
 *
 * No official API — this is ESPN's public, unauthenticated JSON
 * endpoint used by espn.com/soccer itself. Every call is wrapped in
 * try/catch with a short timeout and returns a safe empty value on any
 * failure, so the app never depends on ESPN being reachable.
 * ===================================================================*/
import { teamCodeFromApiName } from "./team-name-mapper";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

export interface EspnNewsItem {
  headline: string;
  description: string;
}

function ymd(utcIso: string): string {
  const d = new Date(utcIso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function withTimeout(ms: number): AbortSignal {
  // AbortSignal.timeout isn't available in all runtimes; build manually for safety.
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

/** Find the ESPN scoreboard event id for a match between homeCode/awayCode
 * on the given UTC date (±1 day, to absorb timezone edge cases). Returns
 * null on any failure or if the match isn't found on ESPN. */
export async function findEspnEventId(homeCode: string, awayCode: string, utcIso: string): Promise<string | null> {
  const dates = new Set<string>();
  const d = new Date(utcIso);
  for (const offset of [0, -1, 1]) {
    const dd = new Date(d);
    dd.setUTCDate(dd.getUTCDate() + offset);
    dates.add(ymd(dd.toISOString()));
  }

  for (const date of dates) {
    try {
      const r = await fetch(`${ESPN_BASE}/scoreboard?dates=${date}`, { signal: withTimeout(8000) });
      if (!r.ok) continue;
      const data = await r.json();
      const events: any[] = data.events || [];
      for (const ev of events) {
        const comp = ev.competitions?.[0];
        const codes: (string | null)[] = (comp?.competitors || []).map((c: any) =>
          teamCodeFromApiName(c.team?.displayName) ||
          teamCodeFromApiName(c.team?.shortDisplayName) ||
          teamCodeFromApiName(c.team?.name) ||
          teamCodeFromApiName(c.team?.abbreviation)
        );
        if (codes.includes(homeCode) && codes.includes(awayCode)) return String(ev.id);
      }
    } catch {
      // try next date
    }
  }
  return null;
}

/** Fetch up to `limit` recent editorial news items that are actually ABOUT
 * this specific fixture — from ESPN's match-summary endpoint
 * (`news.articles`). Returns [] on any failure or if nothing relevant is
 * found.
 *
 * Requires BOTH team names to appear in the article's own headline/
 * description text (not just a loose ESPN category tag match on ONE of
 * the teams). A category tag matching e.g. "Portugal" is not enough on
 * its own — ESPN tags plenty of single-team editorial content (player
 * profiles, cross-tournament "GOAT debate" pieces, etc.) under a team's
 * category even though the piece has nothing to do with this particular
 * match. Requiring both names in the text keeps only content that's
 * genuinely about this head-to-head, so the AI preview can't pick up a
 * player/team from an unrelated storyline (e.g. a different team's star
 * player) and present it as relevant to this match. */
export async function fetchEspnMatchNews(
  eventId: string,
  homeNameEn: string,
  awayNameEn: string,
  limit = 3,
): Promise<EspnNewsItem[]> {
  try {
    const r = await fetch(`${ESPN_BASE}/summary?event=${eventId}`, { signal: withTimeout(8000) });
    if (!r.ok) return [];
    const data = await r.json();
    const articles: any[] = data?.news?.articles || [];
    const homeName = homeNameEn.toLowerCase();
    const awayName = awayNameEn.toLowerCase();

    const out: EspnNewsItem[] = [];
    for (const a of articles) {
      const headline = String(a.headline || "").trim();
      if (!headline) continue;
      const description = String(a.description || "").trim();
      const text = `${headline} ${description}`.toLowerCase();
      const mentionsBothTeams = text.includes(homeName) && text.includes(awayName);
      if (!mentionsBothTeams) continue;
      out.push({ headline, description });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}
