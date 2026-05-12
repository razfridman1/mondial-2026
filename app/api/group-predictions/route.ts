import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import { effectiveUtc, type SimConfig } from "@/lib/sim";
import { applyOverride } from "@/lib/utils";

export const runtime = "nodejs";

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

  /* 1. UIDs in scope */
  let uids: string[];
  if (groupId) {
    const mem = await db.collection("group_memberships").where("groupId", "==", groupId).get();
    uids = mem.docs.map(d => d.data().uid as string);
  } else {
    const profs = await db.collection("profiles").get();
    uids = profs.docs.map(d => d.id);
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
    snap.forEach(d => allPreds.push(d.data()));
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

  /* 5. Build rows for matches that have at least 1 prediction */
  const now = Date.now();
  const callerUid = decoded.uid;

  const rows = matchEff
    .filter(mt => allPreds.some(p => p.matchId === mt.id))
    .map(mt => {
      const visible = now >= new Date(mt.effUtc).getTime() - VISIBILITY_THRESHOLD_MS;
      const preds = allPreds
        .filter(p => p.matchId === mt.id)
        .map(p => {
          const isSelf = p.uid === callerUid;
          const reveal = visible || isSelf;
          return {
            uid: p.uid,
            displayName: profByUid[p.uid]?.displayName || "משתמש",
            avatarId: profByUid[p.uid]?.avatarId || "messi",
            homeScore: reveal ? p.homeScore : null,
            awayScore: reveal ? p.awayScore : null,
            joker: reveal ? !!p.joker : false,
            auto: reveal ? !!p.auto : false,
            hidden: !reveal,
            isSelf,
          };
        })
        // Caller's own prediction first, then by name
        .sort((a, b) => (b.isSelf ? 1 : 0) - (a.isSelf ? 1 : 0)
                     || a.displayName.localeCompare(b.displayName, "he"));
      return {
        matchId: mt.id,
        home: mt.home,
        away: mt.away,
        utc: mt.effUtc,
        stage: mt.stage,
        group: mt.group,
        visible,
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
