import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import type { StageId } from "@/lib/types";

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

const ALL_STAGES: StageId[] = ["GROUP", "R32", "R16", "QF", "SF", "THIRD", "FINAL"];

/* =====================================================================
 * POST /api/admin/sim/instant-results { stage?, includePlaceholders?, overwrite? }
 *
 * Generates random match_results for all matches in the given stage —
 * INSTANTLY (without waiting for time-based simulation).
 *
 *   stage               — "ALL" | "GROUP" | "R32" | "R16" | "QF" | "SF" |
 *                         "THIRD" | "FINAL" | "KNOCKOUT". default "ALL".
 *   includePlaceholders — if true, also generate for knockout matches
 *                         whose teams aren't determined yet. default true
 *                         (most useful for step-by-step testing).
 *   overwrite           — if true, replace existing results in the stage.
 *                         if false (default), skip matches that already have a result.
 * ===================================================================*/
export async function POST(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json().catch(() => ({}));
  const stage: string = body.stage || "ALL";
  const includePlaceholders: boolean = body.includePlaceholders !== false;
  const overwrite: boolean = !!body.overwrite;

  let matches = MATCHES.slice();
  if (!includePlaceholders) {
    matches = matches.filter(m => !m.homeIsPlaceholder && !m.awayIsPlaceholder);
  }
  if (stage !== "ALL") {
    if (stage === "KNOCKOUT") {
      matches = matches.filter(m => m.stage !== "GROUP");
    } else if (ALL_STAGES.includes(stage as StageId)) {
      matches = matches.filter(m => m.stage === stage);
    } else {
      return NextResponse.json({ error: "invalid stage" }, { status: 400 });
    }
  }

  if (!matches.length) {
    return NextResponse.json({ ok: true, inserted: 0, reason: "no matches" });
  }

  const { db } = getAdmin();
  const now = Date.now();
  let inserted = 0, skipped = 0;
  let batch = db.batch();
  let ops = 0;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const ref = db.collection("match_results").doc(m.id);

    if (!overwrite) {
      const snap = await ref.get();
      if (snap.exists) { skipped++; continue; }
    }

    /* Random 0-3 each side, with a small chance of higher scores for variety */
    const roll = () => Math.random() < 0.85 ? Math.floor(Math.random() * 4) : 4 + Math.floor(Math.random() * 3);
    const home = roll();
    const away = roll();

    /* Stagger finishedAt so the streak/order computation makes sense */
    const finishedAt = now - (matches.length - i) * 1000;

    batch.set(ref, {
      matchId: m.id,
      home, away,
      finishedAt,
      sim: true,
    });
    ops++;
    inserted++;

    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  return NextResponse.json({ ok: true, inserted, skipped, stage });
}

/* =====================================================================
 * DELETE /api/admin/sim/instant-results { stage? }
 * Wipes match_results for the given stage (or all stages).
 * ===================================================================*/
export async function DELETE(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json().catch(() => ({}));
  const stage: string = body.stage || "ALL";

  const { db } = getAdmin();
  let matchIds: string[] | null = null;
  if (stage !== "ALL") {
    let ms = MATCHES.slice();
    if (stage === "KNOCKOUT") ms = ms.filter(m => m.stage !== "GROUP");
    else if (ALL_STAGES.includes(stage as StageId)) ms = ms.filter(m => m.stage === stage);
    else return NextResponse.json({ error: "invalid stage" }, { status: 400 });
    matchIds = ms.map(m => m.id);
  }

  let deleted = 0;
  if (matchIds) {
    for (const id of matchIds) {
      await db.collection("match_results").doc(id).delete().catch(() => {});
      deleted++;
    }
  } else {
    const snap = await db.collection("match_results").get();
    let batch = db.batch();
    let ops = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      ops++; deleted++;
      if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();
  }

  return NextResponse.json({ ok: true, deleted, stage });
}
