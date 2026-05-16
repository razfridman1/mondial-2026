import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import type { StageId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORDER: StageId[] = ["GROUP", "R32", "R16", "QF", "SF", "THIRD", "FINAL"];

/* GET /api/admin/sim/status?groupId=XXX
 *
 * Returns the simulation progress per stage:
 *   - predictions filled (count of saved predictions × group members × stage matches)
 *   - results filled (how many of the stage's matches have a result doc)
 *   - totals (expected counts)
 *
 * Used by the new stage-by-stage simulation panel to gate buttons. */
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

  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId");

  const { db } = getAdmin();

  /* Resolve member UIDs of the selected group (active only — no left). */
  let memberUids: string[] = [];
  if (groupId) {
    const memSnap = await db.collection("group_memberships").where("groupId", "==", groupId).get();
    memberUids = memSnap.docs
      .filter(d => !(d.data() as any).left)
      .map(d => (d.data() as any).uid as string);
  }

  /* Match IDs per stage. */
  const stageMatchIds: Record<StageId, string[]> = {} as any;
  for (const s of ORDER) {
    stageMatchIds[s] = MATCHES.filter(m => m.stage === s).map(m => m.id);
  }

  /* Load existing match_results. */
  const resSnap = await db.collection("match_results").get();
  const resultIds = new Set(resSnap.docs.map(d => d.id));

  /* Load predictions only for the chosen group's members. We bucket
   * twice — once by stage (for the existing summary) and once by
   * (uid, stage) so the panel can show which user filled which stage. */
  const predIdsByStage: Record<StageId, Set<string>> = {} as any;
  for (const s of ORDER) predIdsByStage[s] = new Set<string>();

  /* perUserStage[uid][stage] = Set of matchIds the user has predicted. */
  const perUserStage: Record<string, Record<StageId, Set<string>>> = {};
  /* Most recent updatedAt per user, so we can show "last activity". */
  const lastUpdatedByUid: Record<string, number> = {};

  function ensureUserBuckets(uid: string) {
    if (!perUserStage[uid]) {
      perUserStage[uid] = {} as any;
      for (const s of ORDER) perUserStage[uid][s] = new Set<string>();
    }
  }

  if (memberUids.length) {
    /* Pre-seed buckets for every member so users with 0 predictions
     * still appear in the breakdown (just with all-zero counts). */
    for (const uid of memberUids) ensureUserBuckets(uid);

    /* Firestore `in` supports up to 30 values — chunk if needed. */
    for (let i = 0; i < memberUids.length; i += 30) {
      const chunk = memberUids.slice(i, i + 30);
      const snap = await db.collection("predictions").where("uid", "in", chunk).get();
      for (const d of snap.docs) {
        const data = d.data() as any;
        const stage = MATCHES.find(m => m.id === data.matchId)?.stage as StageId | undefined;
        if (!stage) continue;
        predIdsByStage[stage].add(d.id); // doc id = uid_matchId, unique
        ensureUserBuckets(data.uid);
        perUserStage[data.uid][stage].add(data.matchId);
        const upd = Number(data.updatedAt) || 0;
        if (upd > (lastUpdatedByUid[data.uid] || 0)) {
          lastUpdatedByUid[data.uid] = upd;
        }
      }
    }
  }

  /* Load profile docs + Firebase Auth metadata for the members so we
   * can show real names / avatars in the per-user breakdown. Mirrors
   * the resolution order used by the /api/leaderboard route. */
  const profByUid: Record<string, any> = {};
  await Promise.all(memberUids.map(async uid => {
    try {
      const p = await db.collection("profiles").doc(uid).get();
      profByUid[uid] = p.exists ? p.data() : {};
    } catch { profByUid[uid] = {}; }
  }));

  /* Renamed from `auth` to `adminAuth` to avoid shadowing the
   * `auth` variable used at the top of the handler for the request's
   * Authorization header. */
  const { auth: adminAuth } = getAdmin();
  const authMetaByUid: Record<string, { displayName?: string; email?: string }> = {};
  for (let i = 0; i < memberUids.length; i += 100) {
    const chunk = memberUids.slice(i, i + 100).map(uid => ({ uid }));
    try {
      const res = await adminAuth.getUsers(chunk);
      for (const u of res.users) {
        authMetaByUid[u.uid] = {
          displayName: u.displayName || undefined,
          email: u.email || undefined,
        };
      }
    } catch { /* ignore — falls back to placeholder name */ }
  }

  const memberCount = memberUids.length;
  const stages = ORDER.map(s => {
    const matchIds = stageMatchIds[s];
    const resultsFilled = matchIds.filter(id => resultIds.has(id)).length;
    const predictionsFilled = predIdsByStage[s].size;
    const predictionsTotal = memberCount * matchIds.length;
    return {
      stage: s,
      matchesTotal: matchIds.length,
      resultsFilled,
      predictionsFilled,
      predictionsTotal,
    };
  });

  /* Per-user breakdown — one row per active group member. */
  const members = memberUids.map(uid => {
    const profData = profByUid[uid] || {};
    const authMeta = authMetaByUid[uid] || {};
    const displayName =
      profData.displayName ||
      authMeta.displayName ||
      (authMeta.email ? authMeta.email.split("@")[0] : null) ||
      "משתמש";
    const stagesForUser = ORDER.map(s => {
      const total = stageMatchIds[s].length;
      const filled = perUserStage[uid]?.[s]?.size ?? 0;
      return { stage: s, filled, total };
    });
    const totalFilled = stagesForUser.reduce((acc, x) => acc + x.filled, 0);
    const totalMatches = MATCHES.length;
    return {
      uid,
      displayName,
      avatarId: profData.avatarId || "messi",
      lastUpdated: lastUpdatedByUid[uid] || 0,
      totalFilled,
      totalMatches,
      stages: stagesForUser,
    };
  })
  /* Most-active first — users with more predictions on top. */
  .sort((a, b) =>
    b.totalFilled - a.totalFilled ||
    b.lastUpdated - a.lastUpdated ||
    a.displayName.localeCompare(b.displayName, "he"));

  return NextResponse.json({
    ok: true,
    groupId,
    memberCount,
    stages,
    members,
  });
}
