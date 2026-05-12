import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";
import { MATCHES, TEAMS } from "@/lib/data";
import { scorePrediction } from "@/lib/scoring";

export const runtime = "nodejs";
export const maxDuration = 30;

/* =====================================================================
 * מנוע עקיצות — Roast Engine (now multi-target)
 *
 * POST /api/roast
 *   { mode: "self" }                                  → roast the caller
 *   { mode: "friend", targetUid: "...", groupId? }   → roast one friend
 *   { mode: "all",    groupId: "..." }               → group roast (everyone)
 *
 * Always stores the result in Firestore `roasts/{id}` so members see it
 * in the realtime side feed. Returns: { markdown, ids[] }.
 * ===================================================================*/

const SYSTEM_PROMPT = `אתה מנוע עקיצות (Roast Engine) של אפליקציית מונדיאל 2026.
אתה מקבל ניחושים גרועים של משתמש או של קבוצה ויוצר עקיצה בעברית.
חוקים קשיחים:
- טון ידידותי, ספורטיבי, חברותי בלבד — לעולם לא פוגעני
- אסור: קללות, השפלות, רמיזות לגזע/מין/דת/גיל/מראה חיצוני/אישיות
- מותר: עקיצות על הניחושים עצמם, אירוניה על "ביש מזל", התלוצצות
- 2-4 משפטים, בגובה העיניים, מעודד
- אם פונים אל קבוצה — עקוץ את כולם יחד בכבוד, או הדגש מי "הכי טרגי"
- סיים תמיד בנימה חיובית, "סבב הבא יהיה שלך"`;

async function callClaude(userMsg: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return "🃏 איי איי איי... המנוע במצב הדגמה (אין מפתח Anthropic). אבל לפי הנתונים האלה — נראה שכדאי לך לשמור את כסף הקפה לפעם הבאה.\n\nבהצלחה בסבב הבא!";
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 450,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return (data.content?.[0]?.text || "").trim();
}

interface RoastTarget {
  uid: string;
  displayName: string;
  avatarId: string;
}

async function buildWorstPredsFor(db: FirebaseFirestore.Firestore, uid: string) {
  const predSnap = await db.collection("predictions").where("uid", "==", uid).get();
  const preds = predSnap.docs.map(d => d.data() as any);
  if (!preds.length) return [];
  const resSnap = await db.collection("match_results").get();
  const results: Record<string, { home: number; away: number }> = {};
  resSnap.forEach(d => { results[d.id] = d.data() as any; });
  return preds
    .map(p => {
      const r = results[p.matchId];
      if (!r) return null;
      const sc = scorePrediction({
        predictedHome: p.homeScore, predictedAway: p.awayScore,
        actualHome: r.home, actualAway: r.away,
      });
      const m = MATCHES.find(x => x.id === p.matchId);
      return {
        match: m ? `${TEAMS[m.home]?.name || m.home} – ${TEAMS[m.away]?.name || m.away}` : p.matchId,
        guessed: `${p.homeScore}-${p.awayScore}`,
        actual: `${r.home}-${r.away}`,
        pts: sc.points,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.pts - b.pts)
    .slice(0, 5);
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const mode: "self" | "friend" | "all" = body.mode || "self";
  const { db } = getAdmin();

  /* Resolve list of targets */
  let targets: RoastTarget[] = [];
  const callerProf = (await db.collection("profiles").doc(decoded.uid).get()).data() as any || {};
  const callerName = callerProf.displayName || decoded.email || "משתמש";

  if (mode === "self") {
    targets = [{ uid: decoded.uid, displayName: callerName, avatarId: callerProf.avatarId || "messi" }];
  } else if (mode === "friend") {
    if (!body.targetUid) return NextResponse.json({ error: "targetUid required" }, { status: 400 });
    const p = (await db.collection("profiles").doc(body.targetUid).get()).data() as any || {};
    targets = [{ uid: body.targetUid, displayName: p.displayName || "חבר", avatarId: p.avatarId || "messi" }];
  } else if (mode === "all") {
    if (!body.groupId) return NextResponse.json({ error: "groupId required for mode=all" }, { status: 400 });
    const mems = await db.collection("group_memberships").where("groupId", "==", body.groupId).get();
    const uids = mems.docs.map(d => d.data().uid as string).filter(u => u !== decoded.uid);
    for (const uid of uids.slice(0, 8)) { // cap at 8 to control AI cost
      const p = (await db.collection("profiles").doc(uid).get()).data() as any || {};
      targets.push({ uid, displayName: p.displayName || "חבר", avatarId: p.avatarId || "messi" });
    }
  }

  if (!targets.length) return NextResponse.json({ markdown: "אין יעד לעקוץ — צרף חברים לקבוצה ונסה שוב." });

  /* Build prompt with prediction data per target */
  const dataBlocks = await Promise.all(targets.map(async t => {
    const worst = await buildWorstPredsFor(db, t.uid);
    return { name: t.displayName, worstPredictions: worst };
  }));

  const userMsg = mode === "all"
    ? `בנה עקיצה קצרה משותפת לחברי הקבוצה הבאים, על סמך הניחושים הגרועים שלהם:\n${JSON.stringify(dataBlocks, null, 2)}\n\nציין את "המנצח" של הניחושים הגרועים ביותר.`
    : `כתוב עקיצה ידידותית ל-${dataBlocks[0].name}:\n${JSON.stringify(dataBlocks[0], null, 2)}`;

  let markdown = "";
  try { markdown = await callClaude(userMsg); }
  catch (e: any) {
    return NextResponse.json({ error: "ai_failed", details: e.message }, { status: 502 });
  }

  /* Persist roast(s) to Firestore so everyone sees it in the feed */
  const ts = Date.now();
  const ids: string[] = [];
  const groupId = body.groupId || null;

  if (mode === "all") {
    const ref = db.collection("roasts").doc();
    await ref.set({
      mode, groupId,
      targets: targets.map(t => ({ uid: t.uid, displayName: t.displayName, avatarId: t.avatarId })),
      byUid: decoded.uid,
      byName: callerName,
      byAvatarId: callerProf.avatarId || "messi",
      markdown,
      ts,
    });
    ids.push(ref.id);
  } else {
    const t = targets[0];
    const ref = db.collection("roasts").doc();
    await ref.set({
      mode, groupId,
      targetUid: t.uid,
      targetName: t.displayName,
      targetAvatarId: t.avatarId,
      byUid: decoded.uid,
      byName: callerName,
      byAvatarId: callerProf.avatarId || "messi",
      markdown,
      ts,
    });
    ids.push(ref.id);
  }

  return NextResponse.json({ markdown, ids, targets });
}
