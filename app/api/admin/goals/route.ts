import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { MATCHES, TEAMS } from "@/lib/data";
import { lookupGoalsViaAI, aiGoalsToExternalGoals } from "@/lib/ai-result-fallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

/**
 * GET /api/admin/goals
 * Returns current live_data/match_goals and live_data/live_scores goal state
 * for all matches, including which ARG/high-profile matches are missing goals.
 */
export async function GET(req: Request) {
  try { await authedAdmin(req); } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const { db } = getAdmin();
  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId");

  const [goalsSnap, liveSnap, resultsSnap] = await Promise.all([
    db.collection("live_data").doc("match_goals").get(),
    db.collection("live_data").doc("live_scores").get(),
    db.collection("match_results").listDocuments(),
  ]);

  const goalsData: Record<string, any> = goalsSnap.exists ? (goalsSnap.data() || {}) : {};
  const liveData: Record<string, any> = liveSnap.exists ? (liveSnap.data() || {}) : {};

  // Get all finished match result IDs
  const finishedIds = new Set(resultsSnap.map(d => d.id));

  // Build per-match summary
  const summary = MATCHES
    .filter(m => !matchId || m.id === matchId)
    .filter(m => finishedIds.has(m.id))
    .map(m => {
      const mg = goalsData[m.id];
      const ls = liveData[m.id];
      return {
        matchId: m.id,
        home: m.home,
        away: m.away,
        date: m.utc,
        match_goals: mg ? {
          goalCount: (mg.goals || []).length,
          homeCode: mg.homeCode,
          awayCode: mg.awayCode,
          goals: mg.goals || [],
          source: mg.source || "unknown",
          updatedAt: mg.updatedAt,
        } : null,
        live_scores_goals: ls && (ls.goals || []).length > 0 ? {
          goalCount: (ls.goals || []).length,
          goals: ls.goals || [],
        } : null,
      };
    });

  return NextResponse.json({ summary, totalFinished: finishedIds.size });
}

/**
 * POST /api/admin/goals
 * Body:
 *   { matchId, goals: [{scorer, teamCode, minute?, assist?, type?}] }
 *   — Writes goals manually (admin override).
 *
 *   OR { matchId, forceAI: true }
 *   — Re-triggers the AI goals lookup for this match (ignores incomplete check).
 */
export async function POST(req: Request) {
  try { await authedAdmin(req); } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const { db } = getAdmin();
  const body = await req.json().catch(() => null);
  if (!body?.matchId) return NextResponse.json({ error: "matchId required" }, { status: 400 });

  const match = MATCHES.find(m => m.id === body.matchId);
  if (!match) return NextResponse.json({ error: "match not found" }, { status: 404 });

  const homeCode = match.stage === "GROUP" ? match.home : (body.homeCode || match.home);
  const awayCode = match.stage === "GROUP" ? match.away : (body.awayCode || match.away);

  // -- forceAI: re-run AI lookup regardless of existing data --
  if (body.forceAI) {
    const resultSnap = await db.collection("match_results").doc(body.matchId).get();
    if (!resultSnap.exists) return NextResponse.json({ error: "no result stored for this match yet" }, { status: 400 });
    const result = resultSnap.data()!;
    if (typeof result.home !== "number" || typeof result.away !== "number") {
      return NextResponse.json({ error: "result has no numeric score" }, { status: 400 });
    }

    const homeName = TEAMS[homeCode]?.nameEn || TEAMS[homeCode]?.name || homeCode;
    const awayName = TEAMS[awayCode]?.nameEn || TEAMS[awayCode]?.name || awayCode;
    const glookup = await lookupGoalsViaAI({
      homeName, awayName,
      dateISO: match.utc,
      homeScore: result.home,
      awayScore: result.away,
    });

    if (!glookup.found || !glookup.goals) {
      return NextResponse.json({ ok: false, found: false, reason: glookup.reason });
    }

    const goals = aiGoalsToExternalGoals(glookup.goals, homeCode, awayCode);
    await db.collection("live_data").doc("match_goals").set({
      [body.matchId]: { goals, homeCode, awayCode, updatedAt: Date.now(), source: "admin-force-ai", aiSources: glookup.sources || [] },
    }, { merge: true });

    return NextResponse.json({ ok: true, found: true, goalCount: goals.length, goals, sources: glookup.sources });
  }

  // -- manual write --
  if (!Array.isArray(body.goals)) {
    return NextResponse.json({ error: "goals array required (or pass forceAI: true)" }, { status: 400 });
  }

  const goals = body.goals.map((g: any) => ({
    scorer: String(g.scorer || "").trim(),
    teamCode: String(g.teamCode || "").trim() || null,
    minute: typeof g.minute === "number" ? g.minute : null,
    ...(g.assist ? { assist: String(g.assist).trim() } : {}),
    ...(g.type ? { type: String(g.type).toUpperCase() } : {}),
  })).filter((g: any) => g.scorer);

  await db.collection("live_data").doc("match_goals").set({
    [body.matchId]: { goals, homeCode, awayCode, updatedAt: Date.now(), source: "admin-manual" },
  }, { merge: true });

  return NextResponse.json({ ok: true, goalCount: goals.length, goals });
}
