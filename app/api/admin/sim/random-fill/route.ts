import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { MATCHES, TEAMS } from "@/lib/data";
import type { StageId } from "@/lib/types";
import { resolveAllStages } from "@/lib/bracket";
import type { MatchResult } from "@/lib/standings";

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

  /* Resolve ACTIVE group members (skip soft-left) */
  const memSnap = await db.collection("group_memberships").where("groupId", "==", groupId).get();
  const uids = memSnap.docs
    .filter(d => !(d.data() as any).left)
    .map(d => (d.data() as any).uid as string);
  if (!uids.length) return NextResponse.json({ ok: true, filled: 0, reason: "אין חברים פעילים בקבוצה" });

  /* Load current match results to know which knockout matches are "open"
   * (i.e. the previous stage has finished and the teams are known). */
  const resSnap = await db.collection("match_results").get();
  const currentResults: Record<string, MatchResult> = {};
  resSnap.forEach(d => {
    const data = d.data() as any;
    currentResults[d.id] = { home: data.home, away: data.away, finishedAt: data.finishedAt || 0 };
  });
  const resolved = resolveAllStages(currentResults);

  /* Filter matches by stage. For knockouts, include the match if:
   *   - includePlaceholders=true (admin explicitly wants all)
   *   - OR the resolver has determined real team codes for it (previous stage done)
   */
  let matches = MATCHES.slice();
  if (stage && stage !== "ALL") {
    if (stage === "KNOCKOUT") {
      matches = matches.filter(m => m.stage !== "GROUP");
    } else if (ALL_STAGES.includes(stage as StageId)) {
      matches = matches.filter(m => m.stage === stage);
    } else {
      return NextResponse.json({ error: "invalid stage" }, { status: 400 });
    }
  }

  /* Skip knockout matches whose teams aren't yet known — UNLESS user opts in */
  if (!includePlaceholders) {
    matches = matches.filter(m => {
      if (m.stage === "GROUP") return true;
      /* For knockouts: include only if the bracket resolver yielded real team codes. */
      const r = resolved[m.id];
      return !!r && !!TEAMS[r.home] && !!TEAMS[r.away];
    });
  }

  if (!matches.length) {
    return NextResponse.json({
      ok: true,
      filled: 0,
      reason: "no matches match the filter — for knockouts, ensure the previous stage has all results in",
    });
  }

  /* Bulk-fill — random 0-3 scores. Use batched writes for speed.
   * For KO matches, also include a `predictedWinner`. The team CODE
   * stored must be a REAL team code (e.g. "BRA"), NOT the bracket
   * placeholder string ("1A", "W R32-1"). We resolve via the bracket
   * resolver so the winner matches the actualWinner that will be stored
   * when results are simulated. */
  const now = Date.now();
  let filled = 0;
  let batch = db.batch();
  let opsInBatch = 0;
  for (const uid of uids) {
    for (const m of matches) {
      const h = Math.floor(Math.random() * 4);
      const a = Math.floor(Math.random() * 4);
      const isKO = m.stage !== "GROUP";
      const payload: any = {
        uid,
        matchId: m.id,
        homeScore: h,
        awayScore: a,
        joker: false,
        updatedAt: now,
        auto: true,
      };
      if (isKO) {
        /* Use resolved (real) team codes when the bracket has been resolved
         * for this match; fall back to placeholders only if unresolvable. */
        const r = resolved[m.id];
        const homeCode = (r && TEAMS[r.home]) ? r.home : m.home;
        const awayCode = (r && TEAMS[r.away]) ? r.away : m.away;
        if (h > a)      payload.predictedWinner = homeCode;
        else if (a > h) payload.predictedWinner = awayCode;
        else            payload.predictedWinner = Math.random() < 0.5 ? homeCode : awayCode;
      }
      const ref = db.collection("predictions").doc(`${uid}_${m.id}`);
      batch.set(ref, payload, { merge: true });
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
