import { NextResponse } from "next/server";
import { verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const decoded = await verifyIdToken(m[1]);
    return NextResponse.json({
      uid: decoded.uid,
      email: decoded.email,
      isAdmin: isAdminEmail(decoded.email),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
