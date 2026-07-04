import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import { effectiveUtc, type SimConfig } from "@/lib/sim";
import { applyOverride } from "@/lib/utils";
import { resolveAllStages, resolvePlaceholder } from "@/lib/bracket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * GET /api/group-predictions?groupId=...
 *
 * Returns predictions for every match in a group, with strict privacy:
 *   - The caller ALWAYS sees their own prediction.
 *   - Other members' predictions are REDACTED until 2 minutes before
 *     the (effective) match kickoff. The server simply strips scores.
 *
 *   Visibility window honors the simulation config when active.
 * ===================================================================*/

const VISIBILITY_THRESHOLD_MS = 2 * 60 * 1000;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId");
  const { db } = getAdmin();
  const callerIsAdminInit = isAdminEmail(decoded.email);

  /* 1. UIDs in scope.
   *
   * No cross-group view: a regular user MUST pass a groupId, and the
   * caller MUST be an active member of that group. Without a groupId
   * we return an empty payload rather than predictions across all
   * users. Admins keep their legacy view (all groups when no groupId).
   */
  let uids: string[];
  if (groupId) {
    if (!callerIsAdminInit) {
      const myMem = await db
        .collection("group_memberships")
        .doc(`${decoded.uid}_${groupId}`)
        .get();
      const myMemData = myMem.exists ? (myMem.data() as any) : null;
      if (!myMemData || myMemData.left) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }
    const mem = await db.collection("group_memberships").where("groupId", "==", groupId).get();
    /* Exclude soft-left members so they don't appear in the per-group
     * predictions table either. */
    uids = mem.docs
      .filter(d => !(d.data() as any).left)
      .map(d => d.data().uid as string);
  } else if (callerIsAdminInit) {
    const profs = await db.collection("profiles").get();
    uids = profs.docs.map(d => d.id);
  } else {
    return NextResponse.json({ members: [], rows: [] });
  }
  if (!uids.length) return NextResponse.json({ members: [], rows: [] });

  /* 2. Profiles for display */
  const profByUid: Record<string, any> = {};
  await Promise.all(uids.map(async uid => {
    const p = await db.collection("profiles").doc(uid).get();
    profByUid[uid] = p.exists ? p.data() : {};
  }));

  /* 3. Predictions of all members. Firestore 'in' caps at 30; we query per UID
   *    which is simpler and correct for our scale (groups < 50). */
  const allPreds: any[] = [];
  await Promise.all(uids.map(async uid => {
    const snap = await db.collection("predictions").where("uid", "==", uid).get();
    snap.forEach(d => allPreds.push({ ...d.data(), _docId: d.id }));
  }));

  /* 4. Effective match times (overrides + sim) */
  const simSnap = await db.collection("sim_config").doc("global").get();
  const sim = simSnap.exists ? (simSnap.data() as SimConfig) : null;
  const ovSnap = await db.collection("broadcast_overrides").get();
  const overrides: Record<string, any> = {};
  ovSnap.forEach(d => { overrides[d.id] = d.data(); });

  const matchEff = MATCHES.map(mt => {
    const withOv = applyOverride(mt, overrides[mt.id]);
    return { ...withOv, effUtc: effectiveUtc(withOv.utc, sim) };
  });

  /* 4b. Real results (manual entry or live sync) — used to (a) force
   * predictions visible for finished matches and (b) let the client
   * compute each member's points per match. */
  const resultsSnap = await db.collection("match_results").get();
  const results: Record<string, { home: number; away: number; winner?: string; finishedAt: number }> = {};
  resultsSnap.forEach(d => {
    const data = d.data() as any;
    if (data?.home != null && data?.away != null) {
      results[d.id] = { home: data.home, away: data.away, finishedAt: data.finishedAt || 0, ...(data.winner ? { winner: data.winner } : {}) };
    }
  });

  /* Resolve knockout placeholders ("W R32-9" etc.) to the actual teams
   * that qualified, using the live results — otherwise the per-match
   * predictions table shows raw bracket placeholders instead of team
   * names for R16 and later stages. */
  const resolved = resolveAllStages(results);

  /* Predictions made on a knockout match BEFORE its bracket slot resolved
   * were saved with `predictedWinner` set to the raw placeholder string
   * ("W R32-4" etc.) that was on screen at the time — that string is
   * permanently stored as-is in Firestore. It's still a resolvable
   * formula though (independent of when it was saved), so resolve it here
   * at read time using the CURRENT bracket state instead of showing the
   * raw code forever. */
  function resolvePredictedWinner(pw: string | null | undefined): string | null {
    if (!pw) return null;
    return resolvePlaceholder(pw, results, resolved) || pw;
  }

  /* 5. Build rows for matches that have at least 1 prediction.
   *    Super-admins see EVERY prediction regardless of timing (no privacy redaction). */
  const now = Date.now();
  const callerUid = decoded.uid;
  const callerIsAdmin = callerIsAdminInit;

  const rows = matchEff
    .filter(mt => allPreds.some(p => p.matchId === mt.id))
    .map(mt => {
      const result = results[mt.id] || null;
      const r = mt.stage !== "GROUP" ? resolved[mt.id] : null;
      const homeCode = r?.home || mt.home;
      const awayCode = r?.away || mt.away;
      /* Finished matches (real result entered manually or synced from the
       * live feed) always reveal every member's prediction permanently —
       * regardless of the normal 2-minutes-before-kickoff timing rule. */
      const visible = !!result || now >= new Date(mt.effUtc).getTime() - VISIBILITY_THRESHOLD_MS;
      const preds = allPreds
        .filter(p => p.matchId === mt.id)
        .map(p => {
          const isSelf = p.uid === callerUid;
          const reveal = visible || isSelf || callerIsAdmin;
          return {
            uid: p.uid,
            displayName: profByUid[p.uid]?.displayName || "משתמש",
            avatarId: profByUid[p.uid]?.avatarId || "messi",
            homeScore: reveal ? p.homeScore : null,
            awayScore: reveal ? p.awayScore : null,
            predictedWinner: reveal ? resolvePredictedWinner(p.predictedWinner) : null,
            joker: reveal ? !!p.joker : false,
            auto: reveal ? !!p.auto : false,
            hidden: !reveal,
            isSelf,
            ...(callerIsAdmin ? { _docId: p._docId } : {}),
          };
        })
        // Caller's own prediction first, then by name
        .sort((a, b) => (b.isSelf ? 1 : 0) - (a.isSelf ? 1 : 0)
                     || a.displayName.localeCompare(b.displayName, "he"));
      return {
        matchId: mt.id,
        home: homeCode,
        away: awayCode,
        utc: mt.effUtc,
        stage: mt.stage,
        group: mt.group,
        visible,
        result,
        predictions: preds,
      };
    })
    .sort((a, b) => new Date(a.utc).getTime() - new Date(b.utc).getTime());

  return NextResponse.json({
    members: uids.map(uid => ({
      uid,
      displayName: profByUid[uid]?.displayName || "משתמש",
      avatarId: profByUid[uid]?.avatarId || "messi",
    })),
    rows,
  });
}
