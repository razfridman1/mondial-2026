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
 * POST /api/admin/sim/random-fill { groupId, stage?, includePlaceholders? }
 *
 *   groupId             — required, fills for every member of this group
 *   stage               — "ALL" | "GROUP" | "R32" | "R16" | "QF" | "SF"
 *                         | "THIRD" | "FINAL" | "KNOCKOUT". default "ALL".
 *   includePlaceholders — if true, also fill matches whose teams aren't
 *                         determined yet (TBD). default false.
 *
 * Overwrites any existing prediction. Marks predictions as `auto: true`.
 * ===================================================================*/
export async function POST(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json().catch(() => ({}));
  const { groupId, stage, includePlaceholders } = body;
  if (!groupId) return NextResponse.json({ error: "missing groupId" }, { status: 400 });

  const { db } = getAdmin();

  /* Resolve group members */
  const memSnap = await db.collection("group_memberships").where("groupId", "==", groupId).get();
  const uids = memSnap.docs.map(d => (d.data() as any).uid as string);
  if (!uids.length) return NextResponse.json({ ok: true, filled: 0, reason: "no members in group" });

  /* Filter matches by stage */
  let matches = MATCHES.slice();
  if (!includePlaceholders) {
    matches = matches.filter(m => !m.homeIsPlaceholder && !m.awayIsPlaceholder);
  }
  if (stage && stage !== "ALL") {
    if (stage === "KNOCKOUT") {
      matches = matches.filter(m => m.stage !== "GROUP");
    } else if (ALL_STAGES.includes(stage as StageId)) {
      matches = matches.filter(m => m.stage === stage);
    } else {
      return NextResponse.json({ error: "invalid stage" }, { status: 400 });
    }
  }

  if (!matches.length) {
    return NextResponse.json({ ok: true, filled: 0, reason: "no matches match the filter" });
  }

  /* Bulk-fill — random 0-3 scores. Use batched writes for speed. */
  const now = Date.now();
  let filled = 0;
  let batch = db.batch();
  let opsInBatch = 0;
  for (const uid of uids) {
    for (const m of matches) {
      const h = Math.floor(Math.random() * 4);
      const a = Math.floor(Math.random() * 4);
      const ref = db.collection("predictions").doc(`${uid}_${m.id}`);
      batch.set(ref, {
        uid,
        matchId: m.id,
        homeScore: h,
        awayScore: a,
        joker: false,
        updatedAt: now,
        auto: true,
      }, { merge: true });
      opsInBatch++;
      filled++;
      /* Firestore batch limit is 500 ops — commit and start a new one */
      if (opsInBatch >= 450) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    }
  }
  if (opsInBatch > 0) await batch.commit();

  return NextResponse.json({
    ok: true,
    filled,
    users: uids.length,
    matches: matches.length,
    groupId,
    stage: stage || "ALL",
  });
}

/* =====================================================================
 * DELETE /api/admin/sim/random-fill { groupId?, alsoResults? }
 *
 *   groupId      — if provided, deletes predictions only for members of
 *                  that group. If omitted, deletes ALL predictions in the
 *                  entire database (use with care).
 *   alsoResults  — if true, also wipes match_results collection. default false.
 * ===================================================================*/
export async function DELETE(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json().catch(() => ({}));
  const { groupId, alsoResults } = body;
  const { db } = getAdmin();

  let deletedPredictions = 0;

  if (groupId) {
    const memSnap = await db.collection("group_memberships").where("groupId", "==", groupId).get();
    const uids = memSnap.docs.map(d => (d.data() as any).uid as string);
    if (!uids.length) {
      return NextResponse.json({ ok: true, deletedPredictions: 0, reason: "no members" });
    }
    /* Delete in chunks (Firestore "in" supports up to 30 values) */
    for (let i = 0; i < uids.length; i += 30) {
      const chunk = uids.slice(i, i + 30);
      const snap = await db.collection("predictions").where("uid", "in", chunk).get();
      let batch = db.batch();
      let n = 0;
      for (const d of snap.docs) {
        batch.delete(d.ref);
        n++;
        deletedPredictions++;
        if (n >= 450) { await batch.commit(); batch = db.batch(); n = 0; }
      }
      if (n > 0) await batch.commit();
    }
  } else {
    /* Wipe everything */
    const snap = await db.collection("predictions").get();
    let batch = db.batch();
    let n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      n++;
      deletedPredictions++;
      if (n >= 450) { await batch.commit(); batch = db.batch(); n = 0; }
    }
    if (n > 0) await batch.commit();
  }

  let deletedResults = 0;
  if (alsoResults) {
    const rSnap = await db.collection("match_results").get();
    let batch = db.batch();
    let n = 0;
    for (const d of rSnap.docs) {
      batch.delete(d.ref);
      n++;
      deletedResults++;
      if (n >= 450) { await batch.commit(); batch = db.batch(); n = 0; }
    }
    if (n > 0) await batch.commit();
  }

  return NextResponse.json({ ok: true, deletedPredictions, deletedResults, scope: groupId ? "group" : "all" });
}
