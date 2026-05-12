import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { MATCHES, TEAMS } from "@/lib/data";
import { effectiveUtc, randomResult, type SimConfig } from "@/lib/sim";
import { applyOverride } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/* =====================================================================
 * Simulation tick worker — when simulation is ON, scans for matches whose
 * EFFECTIVE kickoff has ended (start + 115 sim-minutes ago) and creates a
 * random result, then writes an activity event.
 *
 * Designed to be called every minute by Vercel Cron. Idempotent.
 * ===================================================================*/

const SECRET = process.env.CRON_SECRET || "";

export async function GET(req: Request) {
  if (SECRET) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.endsWith(SECRET)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { db } = getAdmin();

  /* Read sim config */
  const cfgDoc = await db.collection("sim_config").doc("global").get();
  if (!cfgDoc.exists) return NextResponse.json({ enabled: false });
  const cfg = cfgDoc.data() as SimConfig;
  if (!cfg.enabled || !cfg.resultsAuto) return NextResponse.json({ enabled: false });

  /* Apply overrides */
  const ov = await db.collection("broadcast_overrides").get();
  const overrides: Record<string, any> = {};
  ov.forEach(d => { overrides[d.id] = d.data(); });

  const now = Date.now();
  const SIM_MINS_PER_MATCH = 115; // FIFA-ish
  const finishedThreshold = SIM_MINS_PER_MATCH * 60 * 1000 / cfg.speedMultiplier;

  /* Find matches that finished in simulation but don't yet have a result */
  let inserted = 0;
  const insertedIds: string[] = [];
  for (const base of MATCHES) {
    if (base.homeIsPlaceholder || base.awayIsPlaceholder) continue;
    const m = applyOverride(base, overrides[base.id]);
    const simStart = new Date(effectiveUtc(m.utc, cfg)).getTime();
    if (simStart + finishedThreshold > now) continue; // not over yet

    const existing = await db.collection("match_results").doc(base.id).get();
    if (existing.exists) continue;

    const { home, away } = randomResult();
    await db.collection("match_results").doc(base.id).set({
      matchId: base.id,
      home, away,
      finishedAt: now,
      sim: true,
      simRunId: cfg.startedAt,
    });
    inserted++;
    insertedIds.push(base.id);

    /* Activity event */
    const homeName = TEAMS[m.home]?.name || m.home;
    const awayName = TEAMS[m.away]?.name || m.away;
    await db.collection("activity").add({
      kind: "match.result",
      uid: "system",
      displayName: "מערכת",
      avatarId: "messi",
      matchId: base.id,
      payload: { home, away, homeName, awayName, sim: true },
      ts: now,
    });
  }

  return NextResponse.json({ enabled: true, inserted, ids: insertedIds });
}
