import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import type { ExternalGoal } from "@/lib/football-data-api";
import { SQUADS, normalizeName } from "@/lib/players";
import { translateNamesToHebrew } from "@/lib/ai-result-fallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* The Hebrew-translation fallback below can make a live Claude API call on
 * a cache miss — without this, Vercel's default function timeout (10s on
 * many plans) could cut the request short before that call returns. */
export const maxDuration = 60;

/* =====================================================================
 * GET /api/scorers
 *
 * Aggregates the structured goal/assist data persisted by
 * /api/cron/sync-results (Firestore live_data/match_goals — written per
 * finished match as { goals: ExternalGoal[], homeCode, awayCode }) into
 * tournament-wide "top scorer" and "top assists" leaderboards, used by the
 * "מלך השערים והבישולים" tab.
 *
 * Ranking: descending by count; ties broken alphabetically by player name.
 * Own goals (type === "OWN") are excluded from both leaderboards.
 *
 * Player names ("name" field below) are returned in HEBREW where possible:
 *  1. Players with curated Hebrew bios (lib/players.ts SQUADS) use that name.
 *  2. Otherwise, a Hebrew transliteration is looked up from the
 *     live_data/player_name_he cache (built up over time by
 *     translateNamesToHebrew — see lib/ai-result-fallback.ts).
 *  3. Any name still untranslated falls back to the original (English)
 *     name from the source data — never fabricated, just not yet cached.
 * ===================================================================*/
export interface ScorerEntry {
  name: string;
  teamCode: string | null;
  count: number;
}

/* English (normalized) -> Hebrew name, built once per request from the
 * curated star-player database (covers the most commonly-scoring teams). */
const CURATED_HE_BY_EN: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const list of Object.values(SQUADS)) {
    for (const p of list) {
      if (p.nameEn && p.name) out[normalizeName(p.nameEn)] = p.name;
    }
  }
  return out;
})();

export async function GET(req: Request) {
  try {
    const debug = new URL(req.url).searchParams.get("debug") === "1";
    const { db } = getAdmin();
    const snap = await db.collection("live_data").doc("match_goals").get();
    const data: Record<string, { goals?: ExternalGoal[]; homeCode?: string; awayCode?: string }> =
      snap.exists ? (snap.data() || {}) : {};

    const scorers = new Map<string, ScorerEntry>();
    const assists = new Map<string, ScorerEntry>();

    for (const match of Object.values(data)) {
      for (const g of match.goals || []) {
        if (!g || g.type === "OWN") continue; // own goals don't count toward either leaderboard

        if (g.scorer) {
          const key = `${g.teamCode || ""}|${g.scorer}`;
          const cur = scorers.get(key) || { name: g.scorer, teamCode: g.teamCode || null, count: 0 };
          cur.count++;
          scorers.set(key, cur);
        }
        if (g.assist) {
          const key = `${g.teamCode || ""}|${g.assist}`;
          const cur = assists.get(key) || { name: g.assist, teamCode: g.teamCode || null, count: 0 };
          cur.count++;
          assists.set(key, cur);
        }
      }
    }

    /* ----- Hebrew names: curated DB first, then a Firestore-cached AI
     * transliteration for everyone else. ------------------------------- */
    const allEntries = [...scorers.values(), ...assists.values()];
    const heByEn = new Map<string, string>();
    const stillNeeded: string[] = [];

    for (const entry of allEntries) {
      const curated = CURATED_HE_BY_EN[normalizeName(entry.name)];
      if (curated) heByEn.set(entry.name, curated);
    }

    const namesNeedingCache = allEntries
      .map(e => e.name)
      .filter(n => !heByEn.has(n));

    let cache: Record<string, string> = {};
    if (namesNeedingCache.length) {
      try {
        const cacheSnap = await db.collection("live_data").doc("player_name_he").get();
        cache = cacheSnap.exists ? (cacheSnap.data()?.map || {}) : {};
      } catch {
        cache = {};
      }
      for (const n of namesNeedingCache) {
        if (cache[n]) heByEn.set(n, cache[n]);
        else stillNeeded.push(n);
      }
    }

    if (stillNeeded.length) {
      try {
        const translated = await translateNamesToHebrew(stillNeeded);
        if (Object.keys(translated).length) {
          for (const [en, he] of Object.entries(translated)) heByEn.set(en, he);
          await db.collection("live_data").doc("player_name_he").set(
            { map: { ...cache, ...translated } },
            { merge: true }
          );
        }
      } catch {
        // best-effort only — entries simply keep their English name for now
      }
    }

    /* Snapshot original (English) names for the debug name-resolution
     * report BEFORE mutating entry.name to Hebrew below. */
    const originalNames = allEntries.map(e => e.name);

    for (const entry of allEntries) {
      const he = heByEn.get(entry.name);
      if (he) entry.name = he;
    }

    const byRank = (a: ScorerEntry, b: ScorerEntry) =>
      b.count - a.count || a.name.localeCompare(b.name, "he");

    const out: any = {
      topScorers: Array.from(scorers.values()).sort(byRank),
      topAssists: Array.from(assists.values()).sort(byRank),
    };

    /* ?debug=1 — diagnostic snapshot of the raw per-match goal data and the
     * Hebrew-name resolution state, without requiring admin auth (no PII —
     * this is the same player/score data already shown on the public tab). */
    if (debug) {
      out._debug = {
        matchGoals: Object.fromEntries(
          Object.entries(data).map(([matchId, m]) => [
            matchId,
            {
              homeCode: m.homeCode,
              awayCode: m.awayCode,
              goalCount: (m.goals || []).length,
              goals: (m.goals || []).map(g => ({
                side: g.teamCode, scorer: g.scorer, assist: g.assist, type: g.type, minute: g.minute,
              })),
            },
          ])
        ),
        nameResolution: allEntries.map((e, i) => {
          const original = originalNames[i];
          return {
            originalName: original,
            displayedName: e.name,
            resolvedFrom: CURATED_HE_BY_EN[normalizeName(original)]
              ? "curated"
              : cache[original]
                ? "cache"
                : heByEn.has(original) ? "ai-just-now" : "english-fallback",
          };
        }),
      };
    }

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
