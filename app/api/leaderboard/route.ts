import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { userTotals } from "@/lib/scoring";
import { MATCHES } from "@/lib/data";
import type { LeaderRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/leaderboard?groupId=...
 *
 * Returns the leaderboard scoped to a single group. There is no
 * "global" view: the leaderboard is ALWAYS limited to members of one
 * group, so a regular user can only ever see the other people in the
 * group they currently belong to.
 *
 * Defense-in-depth rules:
 *   1. `groupId` is REQUIRED for regular users. If omitted we return
 *      an empty array rather than leaking a cross-group leaderboard.
 *   2. When `groupId` IS provided, the caller must either be an admin
 *      (`ADMIN_EMAILS`) OR an active member of that group. Otherwise
 *      we return 403, so a user cannot fish leaderboards of groups
 *      they don't belong to by guessing/altering the URL.
 *   3. Admin callers (super-admin tooling) may pass any groupId, or
 *      omit it to get the historical cross-group view.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId");

  const { db } = getAdmin();

  /* Resolve the caller. Auth is optional — if no token is sent we
   * treat the caller as a regular non-admin user and apply the
   * strictest rules below. */
  let callerUid: string | null = null;
  let callerIsAdmin = false;
  const authHeader = req.headers.get("authorization") || "";
  const tokMatch = authHeader.match(/^Bearer (.+)$/);
  if (tokMatch) {
    try {
      const decoded = await verifyIdToken(tokMatch[1]);
      callerUid = decoded.uid;
      callerIsAdmin = isAdminEmail(decoded.email);
    } catch { /* fall through as anon */ }
  }

  /* 1. Find user uids in the requested group.
   *    - No groupId + not admin → empty (no global view).
   *    - No groupId +     admin → keep legacy behaviour (all profiles).
   *    - groupId        + not admin → must be an active member of the group.
   */
  let uids: string[];
  if (groupId) {
    /* Membership check: regular users must belong to the group. */
    if (!callerIsAdmin) {
      if (!callerUid) return NextResponse.json([], { status: 200 });
      const myMem = await db
        .collection("group_memberships")
        .doc(`${callerUid}_${groupId}`)
        .get();
      const myMemData = myMem.exists ? (myMem.data() as any) : null;
      if (!myMemData || myMemData.left) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }
    const memSnap = await db.collection("group_memberships").where("groupId", "==", groupId).get();
    /* Exclude soft-left members from the leaderboard. */
    uids = memSnap.docs
      .filter(d => !(d.data() as any).left)
      .map(d => d.data().uid as string);
  } else if (callerIsAdmin) {
    const profSnap = await db.collection("profiles").get();
    uids = profSnap.docs.map(d => d.id);
  } else {
    /* No group scope + no admin rights → never leak a global leaderboard. */
    return NextResponse.json([]);
  }

  if (!uids.length) return NextResponse.json([]);

  /* 2. Load match results — including KO-specific fields (winner, isKnockout) */
  const resSnap = await db.collection("match_results").get();
  const results: Record<string, { home: number; away: number; finishedAt: number; winner?: string; isKnockout?: boolean }> = {};
  /* Build a stage lookup so we can flag knockouts even if the DB doc didn't
   * store isKnockout (older docs). */
  const stageById = new Map<string, string>();
  for (const m of MATCHES) stageById.set(m.id, m.stage);
  resSnap.forEach(d => {
    const data = d.data() as any;
    const stage = stageById.get(d.id);
    const isKO = data.isKnockout || (stage && stage !== "GROUP");
    const entry: any = {
      home: data.home,
      away: data.away,
      finishedAt: data.finishedAt || Date.now(),
    };
    if (data.winner) entry.winner = data.winner;
    if (isKO) entry.isKnockout = true;
    results[d.id] = entry;
  });

  /* 2b. Load bonus awards (manual admin adjustments) and sum per user */
  const bonusSnap = await db.collection("bonus_awards").get();
  const bonusByUid: Record<string, number> = {};
  bonusSnap.forEach(d => {
    const data = d.data() as any;
    if (typeof data.points === "number") {
      bonusByUid[data.uid] = (bonusByUid[data.uid] || 0) + data.points;
    }
  });

  /* 2c. Batch-load Firebase Auth metadata for every uid we'll show.
   * This catches Google sign-ins whose Firestore profile doc was never
   * written, so we can fall back to the Google displayName / email
   * instead of the generic "משתמש". */
  const { auth } = getAdmin();
  const authMetaByUid: Record<string, { displayName?: string; email?: string }> = {};
  for (let i = 0; i < uids.length; i += 100) {
    const chunk = uids.slice(i, i + 100).map(uid => ({ uid }));
    try {
      const res = await auth.getUsers(chunk);
      for (const u of res.users) {
        authMetaByUid[u.uid] = {
          displayName: u.displayName || undefined,
          email: u.email || undefined,
        };
      }
    } catch {
      /* If a batch fails, fall through silently. Leaderboard still shows uids
       * — just with the "משתמש" default for whoever couldn't be resolved. */
    }
  }

  /* 3. Load profiles and predictions for each user */
  const rows: LeaderRow[] = [];
  for (const uid of uids) {
    const prof = await db.collection("profiles").doc(uid).get();
    const profData = prof.data() as any || {};
    const predSnap = await db.collection("predictions").where("uid", "==", uid).get();
    const preds = predSnap.docs.map(d => d.data() as any);
    const t = userTotals(preds, results, bonusByUid[uid] || 0);
    const authMeta = authMetaByUid[uid] || {};
    /* Resolution order: Firestore profile → Firebase Auth (Google name)
     * → email prefix → "משתמש" as a final fallback. */
    const displayName =
      profData.displayName ||
      authMeta.displayName ||
      (authMeta.email ? authMeta.email.split("@")[0] : null) ||
      "משתמש";
    rows.push({
      uid,
      displayName,
      avatarId: profData.avatarId || "messi",
      ...t,
    });
  }

  /* 4. Sort by points desc, then exactCount desc, then streak desc */
  rows.sort((a, b) =>
    b.totalPoints - a.totalPoints ||
    b.exactCount  - a.exactCount  ||
    b.streak      - a.streak);
  rows.forEach((r, i) => r.rank = i + 1);

  return NextResponse.json(rows);
}
