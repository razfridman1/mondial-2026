import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/activity?groupId=...&limit=50
 *
 * Returns recent activity events. Same scoping rules as the leaderboard:
 *   - A regular user MUST supply a `groupId` and MUST be an active
 *     member of that group; otherwise we return an empty list (no
 *     global activity feed for non-admins).
 *   - Admins (`ADMIN_EMAILS`) may omit `groupId` for the global feed.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId");
  const limit = Math.min(100, Number(url.searchParams.get("limit") || 50));

  /* Try to resolve the caller — anonymous callers fall through to the
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
    } catch { /* fall through as anonymous */ }
  }

  const { db } = getAdmin();

  if (groupId) {
    /* Non-admin caller must be an active member of the requested group. */
    if (!callerIsAdmin) {
      if (!callerUid) return NextResponse.json([]);
      const myMem = await db
        .collection("group_memberships")
        .doc(`${callerUid}_${groupId}`)
        .get();
      const myMemData = myMem.exists ? (myMem.data() as any) : null;
      if (!myMemData || myMemData.left) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }
    const snap = await db
      .collection("activity")
      .where("groupId", "==", groupId)
      .orderBy("ts", "desc")
      .limit(limit)
      .get();
    return NextResponse.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  /* No groupId — only admins get the cross-group feed. */
  if (!callerIsAdmin) return NextResponse.json([]);

  const snap = await db.collection("activity").orderBy("ts", "desc").limit(limit).get();
  return NextResponse.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

/* POST /api/activity  { kind, payload?, groupId?, matchId? } */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  const body = await req.json();
  const { db } = getAdmin();
  const profileSnap = await db.collection("profiles").doc(decoded.uid).get();
  const profile: any = profileSnap.data() || {};
  await db.collection("activity").add({
    kind: body.kind || "user.reaction",
    uid: decoded.uid,
    displayName: profile.displayName || decoded.email,
    avatarId: profile.avatarId || "messi",
    groupId: body.groupId || null,
    matchId: body.matchId || null,
    payload: body.payload || {},
    ts: Date.now(),
  });
  return NextResponse.json({ ok: true });
}
