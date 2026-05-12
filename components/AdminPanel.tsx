"use client";
import Link from "next/link";
import { useStore } from "@/lib/store";
import AdminUsers from "./AdminUsers";

/* The original broadcast-overrides table lived here — it required manually
 * editing 104 matches and was removed at the user's request. The Firestore
 * `broadcast_overrides` collection + the /api/overrides endpoint still
 * exist so a CSV-import flow can be added later if needed. */

export default function AdminPanel() {
  const user = useStore(s => s.user);

  if (!user) return (
    <div className="admin-locked">
      <h3>🔒 ניהול משתמשים</h3>
      <p className="muted">כניסה דרושה. <Link href="/login" className="btn btn-primary">כניסה</Link></p>
    </div>
  );

  if (!user.isAdmin) return (
    <div className="admin-locked">
      <h3>🔒 ניהול משתמשים — Super Admin בלבד</h3>
      <p className="muted">אין לך הרשאת Super Admin. צור קשר עם מנהל המערכת.</p>
      <p className="muted">משתמש מחובר: <strong>{user.email}</strong></p>
    </div>
  );

  return (
    <>
      <div className="admin-bar">
        <h3>👥 ניהול משתמשים — Super Admin</h3>
        <div className="muted">{user.email}</div>
      </div>

      <AdminUsers />
    </>
  );
}
