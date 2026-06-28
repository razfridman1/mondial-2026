import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, isAdminEmail, getAdmin } from "@/lib/firebase-admin";

async function verifyAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.split(" ")[1];
  if (!token) return false;
  try {
    const decoded = await verifyIdToken(token);
    return isAdminEmail(decoded.email);
  } catch { return false; }
}

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") || "scorers";
  const { db } = getAdmin();

  try {
    if (type === "scorers") {
      const doc = await db.collection("live_data").doc("fifa_scorers").get();
      if (!doc.exists) return NextResponse.json({ ok: false, error: "No data - run: node crawl-fifa.mjs --only scorers" });
      const data = doc.data()!;
      return NextResponse.json({ ok: true, type, rows: data.scorers || [], updatedAt: data.updatedAt });
    }
    if (type === "assists") {
      const doc = await db.collection("live_data").doc("fifa_assists").get();
      if (!doc.exists) return NextResponse.json({ ok: false, error: "No data - run: node crawl-fifa.mjs --only assists" });
      const data = doc.data()!;
      return NextResponse.json({ ok: true, type, rows: data.assists || [], updatedAt: data.updatedAt });
    }
    if (type === "fixtures") {
      const doc = await db.collection("live_data").doc("cached_fixtures_fifa").get();
      if (!doc.exists) return NextResponse.json({ ok: false, error: "No data - run: node crawl-fifa.mjs --only fixtures" });
      const data = doc.data()!;
      return NextResponse.json({ ok: true, type, rows: data.matches || data.raw?.matches || [], updatedAt: data.updatedAt });
    }
    if (type === "matchcentre") {
      const doc = await db.collection("live_data").doc("fifa_match_results").get();
      if (!doc.exists) return NextResponse.json({ ok: false, error: "No data - run: node crawl-fifa.mjs --only matchcentre" });
      const data = doc.data()!;
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const recent = (data.matches || []).filter((m: any) => m.scrapedAt && m.scrapedAt >= twoDaysAgo);
      return NextResponse.json({ ok: true, type, rows: recent, updatedAt: data.updatedAt });
    }
    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
