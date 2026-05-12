import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import { buildSimConfig, SIM_PRESETS } from "@/lib/sim";

export const runtime = "nodejs";

/* =====================================================================
 *  GET    /api/admin/simulation       → current sim config
 *  POST   /api/admin/simulation       → start { presetId? speedMultiplier? minutesUntilFirstMatch? anchorMatchId? resultsAuto? label? }
 *  DELETE /api/admin/simulation       → stop simulation, revert to real schedule
 * ===================================================================*/

async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

export async function GET() {
  const { db } = getAdmin();
  const snap = await db.collection("sim_config").doc("global").get();
  return NextResponse.json(snap.exists ? snap.data() : { enabled: false });
}

export async function POST(req: Request) {
  let admin;
  try { admin = await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json().catch(() => ({}));
  const preset = body.presetId ? SIM_PRESETS.find(p => p.id === body.presetId) : undefined;

  const anchorMatch = body.anchorMatchId
    ? MATCHES.find(m => m.id === body.anchorMatchId)
    : MATCHES[0];
  if (!anchorMatch) return NextResponse.json({ error: "anchor match not found" }, { status: 400 });

  const cfg = buildSimConfig({
    preset,
    speedMultiplier: body.speedMultiplier,
    minutesUntilFirstMatch: body.minutesUntilFirstMatch,
    anchorRealUtc: new Date(anchorMatch.utc).getTime(),
    resultsAuto: body.resultsAuto !== false,
    label: body.label,
    updatedBy: admin.email,
  });

  const { db } = getAdmin();
  await db.collection("sim_config").doc("global").set(cfg);

  /* If switching modes, wipe stale simulated results so the new schedule
   * starts fresh. We tag results with `sim: true` so we know what to clear. */
  if (body.clearResults !== false) {
    const old = await db.collection("match_results").where("sim", "==", true).get();
    await Promise.all(old.docs.map(d => d.ref.delete()));
  }

  return NextResponse.json({ ok: true, cfg });
}

export async function DELETE(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const { db } = getAdmin();
  await db.collection("sim_config").doc("global").set({
    enabled: false,
    startedAt: 0,
    anchorRealUtc: 0,
    speedMultiplier: 1,
    resultsAuto: false,
    updatedAt: Date.now(),
  });

  /* Cascade: clear simulated results, simulated predictions, simulated activity */
  const simResults = await db.collection("match_results").where("sim", "==", true).get();
  await Promise.all(simResults.docs.map(d => d.ref.delete()));

  /* Optional: also wipe simulated predictions so users start fresh after sim ends.
   * Comment out if you want to preserve them. */
  // const simPreds = await db.collection("predictions").where("sim", "==", true).get();
  // await Promise.all(simPreds.docs.map(d => d.ref.delete()));

  return NextResponse.json({ ok: true });
}
