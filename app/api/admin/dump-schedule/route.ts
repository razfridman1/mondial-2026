import { NextResponse } from "next/server";
import { VENUES } from "@/lib/data";
import { teamCodeFromApiName } from "@/lib/team-name-mapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * GET /api/admin/dump-schedule
 *
 * Returns every match football-data.org has for the World Cup, sorted
 * by stage and date. Used as a one-off introspection tool: we copy this
 * back into lib/data.ts so the knockout schedule reflects FIFA reality
 * (dates, venues, kick-off times, and — when populated — real teams).
 *
 * For stages where teams are still TBD (not yet decided), `homeCode`
 * and `awayCode` are null. The app should hide / lock those stages in
 * the UI until the codes are populated.
 *
 * Auth: same as cron — if CRON_SECRET is set, Authorization header
 * must end with it.
 * ===================================================================*/
const SECRET = process.env.CRON_SECRET || "";

interface ApiMatch {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  group?: string | null;
  matchday?: number | null;
  homeTeam: { id?: number; name?: string | null; shortName?: string | null; tla?: string | null };
  awayTeam: { id?: number; name?: string | null; shortName?: string | null; tla?: string | null };
  venue?: string | null;
  score?: any;
}

function venueCodeFromName(name: string | undefined | null): string | null {
  if (!name) return null;
  const n = name.toLowerCase();
  for (const code of Object.keys(VENUES)) {
    const v = VENUES[code];
    const vName = v.name.toLowerCase();
    const vCity = (v.city || "").toLowerCase();
    if (vName === n) return code;
    if (vName.includes(n) || n.includes(vName)) return code;
    if (vCity && (n.includes(vCity) || vCity.includes(n))) return code;
  }
  return null;
}

export async function GET(req: Request) {
  if (SECRET) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.endsWith(SECRET)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FOOTBALL_API_KEY not configured" }, { status: 400 });
  }

  const baseUrl = process.env.FOOTBALL_API_URL || "https://api.football-data.org/v4";

  try {
    const r = await fetch(`${baseUrl}/competitions/WC/matches?season=2026`, {
      headers: { "X-Auth-Token": apiKey },
    });
    if (!r.ok) {
      const txt = await r.text();
      return NextResponse.json({ error: "api_failed", status: r.status, body: txt.slice(0, 400) }, { status: 502 });
    }
    const data = await r.json();
    const matches: ApiMatch[] = data.matches || [];

    /* Group by stage */
    const byStage: Record<string, any[]> = {};
    for (const m of matches) {
      const stageRaw = m.stage || "UNKNOWN";
      if (!byStage[stageRaw]) byStage[stageRaw] = [];
      const dt = new Date(m.utcDate);
      byStage[stageRaw].push({
        extId: m.id,
        status: m.status,
        utc: m.utcDate,
        isoDate: dt.toISOString().slice(0, 10),
        isoTime: dt.toISOString().slice(11, 16),
        group: (m.group || "").replace("GROUP_", "") || null,
        matchday: m.matchday || null,
        homeRaw: m.homeTeam?.name || null,
        awayRaw: m.awayTeam?.name || null,
        homeCode: teamCodeFromApiName(m.homeTeam?.name) || teamCodeFromApiName(m.homeTeam?.shortName) || null,
        awayCode: teamCodeFromApiName(m.awayTeam?.name) || teamCodeFromApiName(m.awayTeam?.shortName) || null,
        venueRaw: m.venue || null,
        venueCode: venueCodeFromName(m.venue) || null,
        teamsAssigned: !!(m.homeTeam?.name && m.awayTeam?.name),
      });
    }

    /* Sort within each stage by date */
    for (const stage of Object.keys(byStage)) {
      byStage[stage].sort((a, b) => a.utc.localeCompare(b.utc));
    }

    /* Per-stage summary */
    const summary: Record<string, { count: number; teamsAssigned: number; venuesAssigned: number }> = {};
    for (const [stage, arr] of Object.entries(byStage)) {
      summary[stage] = {
        count: arr.length,
        teamsAssigned: arr.filter((x: any) => x.teamsAssigned).length,
        venuesAssigned: arr.filter((x: any) => x.venueCode).length,
      };
    }

    return NextResponse.json({
      ok: true,
      totalMatches: matches.length,
      summary,
      stages: byStage,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "dump_failed", message: e?.message || String(e) }, { status: 500 });
  }
}
