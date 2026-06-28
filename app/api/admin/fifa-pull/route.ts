import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { initAdminApp } from "@/lib/firebaseAdmin";

initAdminApp();

async function verifyAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization")?.split(" ")[1];
  if (!auth) return false;
  try {
    const decoded = await getAuth().verifyIdToken(auth);
    const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim());
    return adminEmails.includes(decoded.email || "");
  } catch { return false; }
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

const BASE = "https://www.fifa.com";

// Try to extract JSON-LD or __NEXT_DATA__ from HTML
function extractData(html: string, type: string): any[] {
  // Try JSON-LD
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (ldMatch) {
    try { return [JSON.parse(ldMatch[1])]; } catch {}
  }
  // Try __NEXT_DATA__
  const ndMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (ndMatch) {
    try {
      const data = JSON.parse(ndMatch[1]);
      // Navigate to relevant data based on type
      const props = data?.props?.pageProps;
      if (type === "standings") return props?.standings || props?.groups || [];
      if (type === "scorers") return props?.topScorers || props?.scorers || props?.players || [];
      if (type === "assists") return props?.topAssists || props?.assists || props?.players || [];
      return props ? [props] : [];
    } catch {}
  }
  return [];
}

async function fetchFifaPage(url: string, type: string) {
  const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  // Check if we got real content or just meta shell
  if (html.length < 5000) throw new Error("Page returned empty shell (client-rendered only)");
  const rows = extractData(html, type);
  return { rows, htmlLength: html.length };
}

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") || "scorers";

  const urls: Record<string, string> = {
    standings: `${BASE}/en/tournaments/mens/worldcup/canadamexicousa2026/standings`,
    scorers:   `${BASE}/en/tournaments/mens/worldcup/canadamexicousa2026/statistics/player-statistics`,
    assists:   `${BASE}/en/tournaments/mens/worldcup/canadamexicousa2026/statistics/player-statistics?statType=goal_assist`,
    fixtures:  `${BASE}/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures?country=IL&wtw-filter=ALL`,
  };

  const url = urls[type];
  if (!url) return NextResponse.json({ error: "Unknown type" }, { status: 400 });

  try {
    const { rows, htmlLength } = await fetchFifaPage(url, type);
    if (rows.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "לא נמצאו נתונים — האתר של FIFA מרונדר בדפדפן בלבד. פתח את הכתובת ידנית.",
        url,
        htmlLength,
      });
    }
    return NextResponse.json({ ok: true, type, rows, url });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, url });
  }
}
