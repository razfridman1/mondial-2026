import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =====================================================================
 * POST /api/admin/sim/full-reset
 * Returns everything to a pre-simulation pristine state:
 *   - deletes ALL predictions
 *   - deletes ALL match_results
 *   - deletes ALL broadcast_overrides
 *   - disables sim_config (sim turned off)
 *   - deletes activity feed entries
 * Profile / user / group data are preserved.
 * ===================================================================*/
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  if (!isAdminEmail(decoded.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { db } = getAdmin();
  const counts = { predictions: 0, results: 0, overrides: 0, activity: 0, skippedRealResults: 0 };

  async function wipeAll(coll: string, ctrKey: "predictions" | "overrides" | "activity") {
    const snap = await db.collection(coll).get();
    let batch = db.batch();
    let ops = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      ops++;
      counts[ctrKey]++;
      if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();
  }

  await wipeAll("predictions", "predictions");
  await wipeAll("broadcast_overrides", "overrides");
  await wipeAll("activity", "activity");

  /* SAFETY: only delete sim-generated match_results. Real results entered
   * manually by admin (during the actual World Cup) survive. */
  const simRes = await db.collection("match_results").where("sim", "==", true).get();
  let rBatch = db.batch();
  let rOps = 0;
  for (const d of simRes.docs) {
    rBatch.delete(d.ref);
    rOps++; counts.results++;
    if (rOps >= 450) { await rBatch.commit(); rBatch = db.batch(); rOps = 0; }
  }
  if (rOps > 0) await rBatch.commit();
  /* Count real results that were preserved */
  const realRes = await db.collection("match_results").get();
  counts.skippedRealResults = realRes.size;

  /* Disable simulation */
  await db.collection("sim_config").doc("global").set({
    enabled: false,
    updatedAt: Date.now(),
    updatedBy: decoded.email,
    resetReason: "full-reset",
  }, { merge: true });

  return NextResponse.json({ ok: true, counts });
}
