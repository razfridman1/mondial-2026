import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * Server session cookie — keeps users signed in even where localStorage
 * is wiped (e.g. WhatsApp's in-app browser). Cookies survive in-app
 * browser closes far more reliably than IndexedDB/localStorage.
 *
 *   POST   /api/auth/session  { idToken }  → mint httpOnly session cookie
 *   GET    /api/auth/session              → if cookie valid, return a custom
 *                                            token the client uses to
 *                                            silently sign back in
 *   DELETE /api/auth/session              → clear the cookie (sign-out)
 * ===================================================================*/

const COOKIE = "__session";
const EXPIRES_MS = 60 * 60 * 24 * 14 * 1000; // 14 days (Firebase max)

function readCookie(req: Request): string | null {
  const raw = req.headers.get("cookie") || "";
  const m = raw.match(/(?:^|;\s*)__session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function POST(req: Request) {
  try {
    const { idToken } = await req.json();
    if (!idToken) return NextResponse.json({ error: "missing idToken" }, { status: 400 });
    /* Make sure the ID token is genuine and recent before minting a cookie. */
    await verifyIdToken(idToken);
    const { auth } = getAdmin();
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: EXPIRES_MS });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(EXPIRES_MS / 1000),
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "session error" }, { status: 401 });
  }
}

export async function GET(req: Request) {
  try {
    const sessionCookie = readCookie(req);
    if (!sessionCookie) return NextResponse.json({ error: "no session" }, { status: 401 });
    const { auth } = getAdmin();
    /* checkRevoked=true so a signed-out / disabled user can't be restored. */
    const decoded = await auth.verifySessionCookie(sessionCookie, true);
    const customToken = await auth.createCustomToken(decoded.uid);
    return NextResponse.json({ token: customToken });
  } catch {
    /* Invalid/expired cookie — clear it so the browser stops sending it. */
    const res = NextResponse.json({ error: "invalid session" }, { status: 401 });
    res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
