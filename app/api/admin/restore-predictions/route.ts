import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import { markBackupRestored } from "@/lib/predictions-backup";
import type { StageId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =====================================================================
 * POST /api/admin/restore-predictions
 *
 * Restore deleted predictions from `predictions_backup` back into the
 * live `predictions` collection. Scoping (any combination):
 *   { uid?: string,
 *     groupId?: string,      // restore for all members of this group
 *     stage?: StageId,       // restrict to one tournament stage
 *     matchId?: string,      // restrict to one specific match
 *     onlyIfMissing?: true  // default: don't overwrite live preds
 *   }
 *
 * Returns counts of restored, skipped (live exists), and missing-backup.
 * Admin-only.
 * ===================================================================*/

interface Body {
  uid?: string;
  groupId?: string;
  stage?: StageId;
  matchId?: string;
  onlyIfMissing?: boolean;
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  if (!isAdminEmail(decoded.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body: Body = await req.json().catch(() => ({}));
  const onlyIfMissing = body.onlyIfMissing !== false; // default true (safe)
  const { db } = getAdmin();

  /* Resolve uids to restore: explicit uid, or all uids in the group, or
   * "all uids that have backups" if nothing scoping was passed. */
  let uids: string[] | null = null;
  if (body.uid) {
    uids = [body.uid];
  } else if (body.groupId) {
    const memSnap = await db.collection("group_memberships")
      .where("groupId", "==", body.groupId).get();
    uids = memSnap.docs
      .filter(d => !(d.data() as any).left)
      .map(d => (d.data() as any).uid as string);
  }

  /* Resolve match IDs to restore: explicit matchId, or all in a stage, or
   * all matches. */
  let matchIds: string[] | null = null;
  if (body.matchId) {
    matchIds = [body.matchId];
  } else if (body.stage) {
    matchIds = MATCHES.filter(mm => mm.stage === body.stage).map(mm => mm.id);
  }

  /* Build the set of backup docIds we want to consider. */
  let backupDocs: { ref: FirebaseFirestore.DocumentReference; data: any }[] = [];
  if (uids && matchIds) {
    /* Pinpoint lookups. */
    for (const uid of uids) {
      for (const mid of matchIds) {
        const ref = db.collection("predictions_backup").doc(`${uid}_${mid}`);
        const snap = await ref.get();
        if (snap.exists) backupDocs.push({ ref, data: snap.data() });
      }
    }
  } else if (uids) {
    /* All matches for these uids: iterate uids and pull by query. */
    for (const uid of uids) {
      const snap = await db.collection("predictions_backup").where("uid", "==", uid).get();
      for (const d of snap.docs) backupDocs.push({ ref: d.ref, data: d.data() });
    }
  } else if (matchIds) {
    /* All uids for these matches. Firestore "in" is limited to 30 — chunk. */
    for (let i = 0; i < matchIds.length; i += 30) {
      const chunk = matchIds.slice(i, i + 30);
      const snap = await db.collection("predictions_backup").where("matchId", "in", chunk).get();
      for (const d of snap.docs) backupDocs.push({ ref: d.ref, data: d.data() });
    }
  } else {
    /* No scoping at all — restore EVERYTHING in backup. */
    const snap = await db.collection("predictions_backup").get();
    for (const d of snap.docs) backupDocs.push({ ref: d.ref, data: d.data() });
  }

  if (!backupDocs.length) {
    return NextResponse.json({
      ok: true, restored: 0, skippedExisting: 0, notInBackup: 0,
      message: "אין גיבויים תואמים לסינון.",
    });
  }

  let restored = 0, skippedExisting = 0;
  let batch = db.batch();
  let ops = 0;
  const restoredKeys: { uid: string; matchId: string }[] = [];

  for (const { data } of backupDocs) {
    const uid = data.uid as string;
    const matchId = data.matchId as string;
    if (!uid || !matchId) continue;
    const liveRef = db.collection("predictions").doc(`${uid}_${matchId}`);
    if (onlyIfMissing) {
      const liveSnap = await liveRef.get();
      if (liveSnap.exists) { skippedExisting++; continue; }
    }
    /* Build a clean payload — strip backup-only metadata. */
    const payload: any = {
      uid, matchId,
      homeScore: data.homeScore,
      awayScore: data.awayScore,
      updatedAt: data.updatedAt || Date.now(),
    };
    if (data.joker != null) payload.joker = data.joker;
    if (data.predictedWinner) payload.predictedWinner = data.predictedWinner;
    batch.set(liveRef, payload, { merge: false });
    restoredKeys.push({ uid, matchId });
    restored++;
    ops++;
    if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();

  /* Mark backups as restored (clear deletedAt). Best-effort. */
  for (const { uid, matchId } of restoredKeys) {
    try { await markBackupRestored(uid, matchId); } catch {}
  }

  return NextResponse.json({
    ok: true,
    restored,
    skippedExisting,
    notInBackup: 0,
    scope: {
      uid: body.uid || null,
      groupId: body.groupId || null,
      stage: body.stage || null,
      matchId: body.matchId || null,
      onlyIfMissing,
    },
  });
}

/* GET /api/admin/restore-predictions?info=1
 * Returns a high-level summary of what's in the backup collection. */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  if (!isAdminEmail(decoded.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { db } = getAdmin();
  const url = new URL(req.url);
  const stage = url.searchParams.get("stage");
  const groupId = url.searchParams.get("groupId");

  let stageMatchIds: Set<string> | null = null;
  if (stage) {
    stageMatchIds = new Set(MATCHES.filter(mm => mm.stage === stage).map(mm => mm.id));
  }

  let groupUids: Set<string> | null = null;
  if (groupId) {
    const memSnap = await db.collection("group_memberships").where("groupId", "==", groupId).get();
    groupUids = new Set(memSnap.docs.filter(d => !(d.data() as any).left).map(d => (d.data() as any).uid as string));
  }

  const backupSnap = await db.collection("predictions_backup").get();
  let total = 0, restorable = 0, currentlyLive = 0;

  for (const d of backupSnap.docs) {
    const data = d.data() as any;
    if (stageMatchIds && !stageMatchIds.has(data.matchId)) continue;
    if (groupUids && !groupUids.has(data.uid)) continue;
    total++;
    const liveSnap = await db.collection("predictions").doc(d.id).get();
    if (liveSnap.exists) currentlyLive++;
    else restorable++;
  }

  return NextResponse.json({
    ok: true,
    total,
    currentlyLive,       /* exists in both live + backup */
    restorable,          /* in backup, deleted from live */
    filter: { stage: stage || null, groupId: groupId || null },
  });
}
