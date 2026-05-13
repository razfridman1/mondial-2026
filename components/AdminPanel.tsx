"use client";
import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import AdminUsers from "./AdminUsers";
import AdminGroups from "./AdminGroups";

type Sub = "users" | "groups";

export default function AdminPanel() {
  const user = useStore(s => s.user);
  const [sub, setSub] = useState<Sub>("users");

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
        <h3>🛡️ ניהול — Super Admin</h3>
        <div className="muted">{user.email}</div>
      </div>

      {/* Sub-tab switcher */}
      <div className="filter-row" style={{ marginBottom: 14 }}>
        <button
          className={`seg ${sub === "users" ? "on" : ""}`}
          onClick={() => setSub("users")}
        >
          👥 משתמשים
        </button>
        <button
          className={`seg ${sub === "groups" ? "on" : ""}`}
          onClick={() => setSub("groups")}
        >
          👫 קבוצות
        </button>
      </div>

      {sub === "users"  && <AdminUsers />}
      {sub === "groups" && <AdminGroups />}
    </>
  );
}
