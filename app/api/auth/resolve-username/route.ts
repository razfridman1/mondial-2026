import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

/* =====================================================================
 * Public-but-rate-limited username → email resolver. Used by the login
 * page so a user can sign in with "raz" instead of "raz@mondial2026.local".
 *
 * GET /api/auth/resolve-username?u=username
 * Returns { email } on success, 404 otherwise.
 *
 * No password is touched here — the client still calls Firebase Auth
 * `signInWithEmailAndPassword` with the resolved email.
 * ===================================================================*/

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = (url.searchParams.get("u") || "").trim().toLowerCase();
  if (!raw || raw.length < 3 || raw.length > 30) {
    return NextResponse.json({ error: "invalid username" }, { status: 400 });
  }
  if (!/^[a-z0-9._-]+$/.test(raw)) {
    return NextResponse.json({ error: "invalid characters" }, { status: 400 });
  }
  const { db } = getAdmin();
  const doc = await db.collection("username_lookup").doc(raw).get();
  if (!doc.exists) return NextResponse.json({ error: "not found" }, { status: 404 });
  const data = doc.data() as any;
  return NextResponse.json({ email: data.email });
}
