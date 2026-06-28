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

const ESPN_BASE = "https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world";
const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

/* Fetch all 12 group standings from ESPN */
async function fetchStandings() {
  const groups = [];
  for (let g = 1; g <= 12; g++) {
    const url = `${ESPN_BASE}/seasons/2026/types/1/groups/${g}/standings/0?lang=en`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = await res.json();

    // Resolve team refs (each has a $ref — extract team id from URL)
    const rows = (data.standings || []).map((s: any) => {
      const teamUrl: string = s.team?.$ref || "";
      const teamId = teamUrl.match(/teams\/(\d+)/)?.[1] || "?";
      const rec = s.records?.[0];
      const stat = (name: string) =>
        rec?.stats?.find((x: any) => x.name === name)?.displayValue ?? "-";
      return {
        teamId,
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
    });
    groups.push({ group: g, rows });
  }
  return groups;
}

/* Fetch scoreboard — current day events */
async function fetchFixtures(dateStr?: string) {
  const url = dateStr
    ? `${ESPN_SITE}/scoreboard?dates=${dateStr}`
    : `${ESPN_SITE}/scoreboard`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN scoreboard HTTP ${res.status}`);
  const data = await res.json();

  return (data.events || []).map((e: any) => {
    const comp = e.competitions?.[0];
    const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
    const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
    return {
      id: e.id,
      name: e.name,
      date: e.date,
      status: comp?.status?.type?.description,
      homeTeam: home?.team?.abbreviation,
      homeScore: home?.score,
      awayTeam: away?.team?.abbreviation,
      awayScore: away?.score,
      venue: comp?.venue?.displayName,
    };
  });
}

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") || "fixtures";
  const date = req.nextUrl.searchParams.get("date") || undefined;

  try {
    if (type === "standings") {
      const rows = await fetchStandings();
      return NextResponse.json({ ok: true, type, rows });
    }

    if (type === "fixtures") {
      const rows = await fetchFixtures(date);
      return NextResponse.json({ ok: true, type, rows });
    }

    // scorers / assists — ESPN leaders endpoint
    if (type === "scorers" || type === "assists") {
      const category = type === "scorers" ? "goals" : "goalAssists";
      const url = `${ESPN_BASE}/seasons/2026/leaders?limit=20&lang=en`;
      const res = await fetch(url);
      if (!res.ok) return NextResponse.json({ ok: false, error: `ESPN leaders HTTP ${res.status}` });
      const data = await res.json();
      // Try to find the right category
      const cats = data.categories || [];
      const cat = cats.find((c: any) =>
        c.name?.toLowerCase().includes(category === "goals" ? "goal" : "assist") &&
        !c.name?.toLowerCase().includes("assist") === (category === "goals")
      ) || cats[0];
      const leaders = cat?.leaders?.map((l: any) => ({
        rank: l.rank,
        name: l.athlete?.displayName || l.athlete?.$ref,
        team: l.team?.abbreviation || l.team?.$ref,
        value: l.value,
        displayValue: l.displayValue,
      })) || [];
      return NextResponse.json({ ok: leaders.length > 0, type, rows: leaders,
        error: leaders.length === 0 ? "ESPN leaders endpoint returned no data" : undefined });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
