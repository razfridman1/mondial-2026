import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";

async function verifyAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.split(" ")[1];
  if (!token) return false;
  try {
    const decoded = await verifyIdToken(token);
    return isAdminEmail(decoded.email);
  } catch { return false; }
}

const ESPN_CORE = "https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world";
const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

/* Build teamId → abbreviation lookup from ESPN teams endpoint */
async function buildTeamMap(): Promise<Record<string, string>> {
  const res = await fetch(`${ESPN_CORE}/seasons/2026/teams?limit=100&lang=en`);
  if (!res.ok) return {};
  const data = await res.json();
  const map: Record<string, string> = {};
  const refs: string[] = (data.items || []).map((i: any) => i.$ref);
  const results = await Promise.allSettled(
    refs.map((url: string) => fetch(url.replace("http://", "https://")).then(r => r.json()))
  );
  for (const r of results) {
    if (r.status === "fulfilled") {
      const t = r.value;
      if (t.id && t.abbreviation) map[t.id] = t.abbreviation;
    }
  }
  return map;
}

/* Fetch all 12 group standings with resolved team names */
async function fetchStandings() {
  const teamMap = await buildTeamMap();
  const groups = [];

  for (let g = 1; g <= 12; g++) {
    const url = `${ESPN_CORE}/seasons/2026/types/1/groups/${g}/standings/0?lang=en`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = await res.json();

    const groupRes = await fetch(`${ESPN_CORE}/seasons/2026/types/1/groups/${g}?lang=en`);
    const groupData = groupRes.ok ? await groupRes.json() : {};
    const groupName = groupData.abbreviation || groupData.name || `Group ${g}`;

    const rows = (data.standings || []).map((s: any) => {
      const teamUrl: string = s.team?.$ref || "";
      const teamId = teamUrl.match(/teams\/(\d+)/)?.[1] || "?";
      const abbr = teamMap[teamId] || teamId;
      const rec = s.records?.[0];
      const stat = (name: string) =>
        rec?.stats?.find((x: any) => x.name === name)?.displayValue ?? "-";
      return {
        team: abbr,
        rank: stat("rank"),
        gp: stat("gamesPlayed"),
        w: stat("wins"),
        d: stat("ties"),
        l: stat("losses"),
        gf: stat("pointsFor"),
        ga: stat("pointsAgainst"),
        gd: stat("pointDifferential"),
        pts: stat("points"),
        note: s.note?.description || "",
      };
    }).sort((a: any, b: any) => Number(a.rank) - Number(b.rank));

    groups.push({ group: groupName, rows });
  }
  return groups;
}

/* Fixtures for a date range */
async function fetchFixtures(fromDate?: string, toDate?: string) {
  const now = new Date();
  const from = fromDate || now.toISOString().slice(0, 10).replace(/-/g, "");
  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + 7);
  const to = toDate || futureDate.toISOString().slice(0, 10).replace(/-/g, "");

  const url = `${ESPN_SITE}/scoreboard?dates=${from}-${to}&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN scoreboard HTTP ${res.status}`);
  const data = await res.json();

  return (data.events || []).map((e: any) => {
    const comp = e.competitions?.[0];
    const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
    const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
    const status = comp?.status?.type;
    return {
      id: e.id,
      name: e.name,
      date: e.date,
      stage: e.season?.slug || "",
      status: status?.description || "",
      completed: status?.completed || false,
      homeTeam: home?.team?.abbreviation || home?.team?.shortDisplayName,
      homeScore: status?.completed || status?.state === "in" ? home?.score : undefined,
      awayTeam: away?.team?.abbreviation || away?.team?.shortDisplayName,
      awayScore: status?.completed || status?.state === "in" ? away?.score : undefined,
      venue: comp?.venue?.displayName,
    };
  });
}

/* Top scorers/assists — aggregate from ESPN match summaries (no API key needed) */
async function fetchScorers(type: "scorers" | "assists") {
  // Get all completed matches for the whole tournament
  const sbRes = await fetch(`${ESPN_SITE}/scoreboard?dates=20260611-20260719&limit=200`);
  if (!sbRes.ok) throw new Error(`ESPN scoreboard HTTP ${sbRes.status}`);
  const sbData = await sbRes.json();

  const completedEvents = (sbData.events || []).filter(
    (e: any) => e.competitions?.[0]?.status?.type?.completed
  );

  if (!completedEvents.length) throw new Error("אין משחקים שהסתיימו עדיין");

  // Fetch summaries in parallel (cap at 48 to avoid rate limits)
  const ids: string[] = completedEvents.slice(0, 48).map((e: any) => e.id);
  const summaries = await Promise.allSettled(
    ids.map(id =>
      fetch(`${ESPN_SITE}/summary?event=${id}`)
        .then(r => r.ok ? r.json() : null)
    )
  );

  // Aggregate goal/assist counts from scoring plays
  const tally: Record<string, { name: string; team: string; g: number; a: number }> = {};

  const add = (name: string, team: string) => {
    if (!tally[name]) tally[name] = { name, team, g: 0, a: 0 };
  };

  for (const result of summaries) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const sum = result.value;

    // ESPN summary has scoring plays under `scoringPlays`
    const plays: any[] = sum.scoringPlays || [];
    for (const play of plays) {
      // Scorer
      const scorerName = play.athlete?.displayName || play.scorer?.displayName;
      const teamAbbr = play.team?.abbreviation || play.team?.shortDisplayName || "?";
      if (scorerName) {
        add(scorerName, teamAbbr);
        tally[scorerName].g += 1;
      }
      // Assists
      for (const ast of (play.assists || [])) {
        const aName = ast.displayName || ast.athlete?.displayName;
        if (aName) {
          add(aName, teamAbbr);
          tally[aName].a += 1;
        }
      }
    }

    // Some ESPN summaries put data under `keyEvents` or `plays`
    const keyEvents: any[] = sum.keyEvents || [];
    for (const ev of keyEvents) {
      if (ev.type?.id !== "goal" && !ev.type?.text?.toLowerCase().includes("goal")) continue;
      const scorerName = ev.athlete?.displayName || ev.scorer?.displayName;
      const teamAbbr = ev.team?.abbreviation || ev.team?.shortDisplayName || "?";
      if (scorerName && !tally[scorerName]?.g) {
        add(scorerName, teamAbbr);
        tally[scorerName].g += 1;
      }
    }
  }

  const list = Object.values(tally);

  if (type === "scorers") {
    const sorted = list.filter(s => s.g > 0)
      .sort((a, b) => b.g - a.g)
      .slice(0, 20);
    if (!sorted.length) throw new Error("לא נמצאו נתוני כובשים ב-ESPN. ייתכן שהמשחקים עדיין לא מתועדים.");
    return sorted.map((s, i) => ({ rank: i + 1, name: s.name, team: s.team, value: s.g, displayValue: `${s.g}` }));
  } else {
    const sorted = list.filter(s => s.a > 0)
      .sort((a, b) => b.a - a.a)
      .slice(0, 20);
    if (!sorted.length) throw new Error("לא נמצאו נתוני בישולים ב-ESPN. ייתכן שהמשחקים עדיין לא מתועדים.");
    return sorted.map((s, i) => ({ rank: i + 1, name: s.name, team: s.team, value: s.a, displayValue: `${s.a}` }));
  }
}

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") || "fixtures";
  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to   = req.nextUrl.searchParams.get("to")   || undefined;

  try {
    if (type === "standings") {
      const rows = await fetchStandings();
      return NextResponse.json({ ok: true, type, rows });
    }
    if (type === "fixtures") {
      const rows = await fetchFixtures(from, to);
      return NextResponse.json({ ok: true, type, rows });
    }
    if (type === "scorers" || type === "assists") {
      const rows = await fetchScorers(type);
      return NextResponse.json({ ok: rows.length > 0, type, rows,
        error: rows.length === 0 ? "אין נתונים" : undefined });
    }
    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
