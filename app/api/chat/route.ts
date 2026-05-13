import { NextResponse } from "next/server";
import { verifyIdToken, isAiBlocked } from "@/lib/firebase-admin";

/* =====================================================================
 * AI Chat — proxies messages to Anthropic Claude Haiku
 * Endpoint: POST /api/chat  { messages: [{role, content}, ...] }
 * Returns:  { reply: string }
 * ===================================================================*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SYSTEM_PROMPT = `אתה עוזר חכם של אפליקציית "מונדיאל 2026" — מומחה לכדורגל ולמונדיאל.
ענה תמיד בעברית, באופן ידידותי, תמציתי ומדויק.
נושאים שמתאימים לך: שחקנים, קבוצות, סטטיסטיקות, היסטוריה של מונדיאלים, טקטיקות, השוואות בין שחקנים.
אם השאלה לא קשורה לכדורגל — הסבר בנימוס שהתפקיד שלך הוא להתמקד במונדיאל ובכדורגל, והצע נושא רלוונטי.
אל תמציא עובדות; אם אינך בטוח — אמור זאת בכנות.
אורך התשובה: 2-6 משפטים בדרך כלל. אם נדרשת רשימה — השתמש בכוכביות.`;

export async function POST(req: Request) {
  try {
    /* Require auth so admin can block per-user access to AI chat */
    const authHdr = req.headers.get("authorization") || "";
    const tokenMatch = authHdr.match(/^Bearer (.+)$/);
    if (!tokenMatch) return NextResponse.json({ error: "unauthorized", message: "צריך להתחבר כדי להשתמש בצ׳אט." }, { status: 401 });
    let decoded;
    try { decoded = await verifyIdToken(tokenMatch[1]); }
    catch (e: any) { return NextResponse.json({ error: "unauthorized", message: e.message }, { status: 401 }); }

    if (await isAiBlocked(decoded.uid, decoded.email)) {
      return NextResponse.json({ error: "ai_blocked", message: "השימוש בכלי ה-AI נחסם עבור המשתמש שלך על-ידי מנהל המערכת." }, { status: 403 });
    }

    const { messages } = await req.json();
    if (!Array.isArray(messages) || !messages.length) {
      return NextResponse.json({ error: "missing messages" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Graceful fallback so the UI keeps working in local dev
      return NextResponse.json({
        reply: "⚠️ מצב Demo: ANTHROPIC_API_KEY לא הוגדר. הוסף אותו ב-.env.local כדי להפעיל את הצ׳אט האמיתי.\n" +
               "אני יודע לענות על שאלות בנוגע למונדיאל, אבל כרגע צריך מפתח API.",
      });
    }

    // Strip our own system messages — Anthropic expects them as separate field
    const cleanMessages = messages
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({ role: m.role, content: String(m.content || "").slice(0, 4000) }))
      .slice(-12); // keep last 12 turns

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: cleanMessages,
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      return NextResponse.json({ error: "anthropic_error", details: err }, { status: 502 });
    }

    const data = await r.json();
    const reply = (data.content?.[0]?.text || "מצטער, אין לי תשובה כרגע.").trim();
    return NextResponse.json({ reply });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "server error" }, { status: 500 });
  }
}
