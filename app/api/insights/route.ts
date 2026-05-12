import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";
import { MATCHES, TEAMS } from "@/lib/data";
import { applyOverride } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* =====================================================================
 * Smart Insights — aggregates predictions within a friend group and asks
 * Claude to surface the most interesting picks, consensus, and risk.
 *
 * POST /api/insights  { groupId? , matchId? }
 * Returns: { markdown: string, distribution: ... }
 * ===================================================================*/

const SYSTEM_PROMPT = `אתה אנליסט ספורט אינטליגנטי לאפליקציית מונדיאל 2026.
קיבלת נתוני ניחוש מקבוצת חברים: כמה אנשים בחרו כל תוצאה, ואיזה ניחוש "סטייה" יוצא חריג.
התפקיד שלך הוא לכתוב סיכום קצר בעברית (3-5 משפטים) שמראה:
- מי הניחוש הפופולרי
- מי הניחוש המסוכן/לא שגרתי
- אם יש קונצנזוס ברור — ציין
- אם יש דעות מפוצלות — תאר את החלוקה
טון: ספורטיבי, חברותי, קליל.
אל תמציא נתונים מעבר למה שניתן לך.`;

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const { groupId, matchId } = await req.json();
  const { db } = getAdmin();

  /* 1. Resolve uids in scope */
  let uids: string[];
  if (groupId) {
    const mem = await db.collection("group_memberships").where("groupId", "==", groupId).get();
    uids = mem.docs.map(d => d.data().uid as string);
  } else {
    const profs = await db.collection("profiles").get();
    uids = profs.docs.map(d => d.id);
  }
  if (!uids.length) return NextResponse.json({ markdown: "אין מספיק נתונים — חכה שהחברים ינחשו." });

  /* 2. Resolve target matches */
  const ovSnap = await db.collection("broadcast_overrides").get();
  const overrides: Record<string, any> = {};
  ovSnap.forEach(d => { overrides[d.id] = d.data(); });
  const effective = MATCHES.map(mt => applyOverride(mt, overrides[mt.id]));
  const targets = matchId
    ? effective.filter(mt => mt.id === matchId)
    : effective.filter(mt => {
        const start = new Date(mt.utc).getTime();
        return start > Date.now() && start - Date.now() < 7 * 24 * 60 * 60 * 1000; // next 7 days
      }).slice(0, 5);
  if (!targets.length) return NextResponse.json({ markdown: "אין משחקים קרובים לנתח." });

  /* 3. Pull predictions for those matches in scope */
  const distribution: Array<{
    matchId: string; home: string; away: string;
    count: number;
    homeWin: number; draw: number; awayWin: number;
    topPicks: Array<{ score: string; count: number }>;
  }> = [];

  for (const m of targets) {
    const preds = await db.collection("predictions").where("matchId", "==", m.id).get();
    const scoped = preds.docs.map(d => d.data() as any).filter(p => uids.includes(p.uid));
    if (!scoped.length) continue;

    let H = 0, D = 0, A = 0;
    const tally: Record<string, number> = {};
    scoped.forEach(p => {
      const k = `${p.homeScore}-${p.awayScore}`;
      tally[k] = (tally[k] || 0) + 1;
      if (p.homeScore > p.awayScore) H++;
      else if (p.homeScore < p.awayScore) A++;
      else D++;
    });
    const topPicks = Object.entries(tally)
      .sort((a,b) => b[1]-a[1]).slice(0, 3)
      .map(([score, count]) => ({ score, count }));

    distribution.push({
      matchId: m.id,
      home: TEAMS[m.home]?.name || m.home,
      away: TEAMS[m.away]?.name || m.away,
      count: scoped.length,
      homeWin: H, draw: D, awayWin: A,
      topPicks,
    });
  }

  if (!distribution.length) {
    return NextResponse.json({
      markdown: "עדיין לא היו ניחושים מהחברים שלך למשחקים הקרובים. שלח להם הזמנה והתחילו לנחש!",
      distribution: [],
    });
  }

  /* 4. Ask Claude (graceful fallback if no key) */
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const md = distribution.map(d =>
      `**${d.home} – ${d.away}**: ${d.count} ניחושים. ביתית ${d.homeWin}, תיקו ${d.draw}, חוצה ${d.awayWin}.` +
      ` הניחוש הפופולרי: ${d.topPicks[0]?.score} (${d.topPicks[0]?.count} מנחשים).`
    ).join("\n\n");
    return NextResponse.json({ markdown: md, distribution });
  }

  const userMsg = `נתוני הניחושים של החברים:\n${JSON.stringify(distribution, null, 2)}\n\nכתוב סיכום ניחושים אינטליגנטי.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    const markdown = (data.content?.[0]?.text || "").trim();
    return NextResponse.json({ markdown, distribution });
  } catch (e: any) {
    return NextResponse.json({ error: "ai_failed", details: e.message, distribution }, { status: 502 });
  }
}
