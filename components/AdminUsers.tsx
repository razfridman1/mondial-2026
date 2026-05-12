"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";

interface ManagedUser {
  uid: string;
  username: string;
  email: string;
  displayName: string;
  role: "admin" | "user";
  disabled: boolean;
  createdBy?: string;
  createdAt?: number;
  passwordResetAt?: number;
}

export default function AdminUsers() {
  const user = useStore(s => s.user);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function authHeaders() {
    const token = await getFirebase().auth!.currentUser!.getIdToken();
    return { "content-type": "application/json", authorization: `Bearer ${token}` };
  }

  async function load() {
    if (!user?.isAdmin) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/users", { headers: await authHeaders() });
      if (!r.ok) { setError("שגיאה בטעינת המשתמשים"); return; }
      setUsers(await r.json());
    } finally { setBusy(false); }
  }

  useEffect(() => { load(); }, [user?.isAdmin]);

  async function createUser() {
    const username = prompt("שם משתמש (3-30 תווים, אותיות קטנות, מספרים, ._-):");
    if (!username) return;
    const displayName = prompt("שם תצוגה (אופציונלי):") || username;
    const password = prompt("סיסמה (לפחות 6 תווים):");
    if (!password) return;
    const role = confirm("האם זה משתמש Admin? (אישור = כן, ביטול = משתמש רגיל)") ? "admin" : "user";

    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ username, password, displayName, role }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "שגיאה ביצירת המשתמש"); return; }
      alert(`✓ נוצר משתמש "${data.username}"\nניתן להתחבר עם שם המשתמש והסיסמה.`);
      load();
    } finally { setBusy(false); }
  }

  async function resetPassword(u: ManagedUser) {
    const password = prompt(`סיסמה חדשה ל-${u.username} (לפחות 6 תווים):`);
    if (!password || password.length < 6) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/users/${u.uid}`, {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ password }),
      });
      if (!r.ok) { alert("שגיאה באיפוס סיסמה"); return; }
      alert("הסיסמה אופסה.");
      load();
    } finally { setBusy(false); }
  }

  async function renameUser(u: ManagedUser) {
    const displayName = prompt("שם תצוגה חדש:", u.displayName);
    if (!displayName) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/users/${u.uid}`, {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ displayName }),
      });
      if (!r.ok) { alert("שגיאה"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function toggleRole(u: ManagedUser) {
    const role = u.role === "admin" ? "user" : "admin";
    if (!confirm(`לשנות את התפקיד של ${u.username} ל-${role}?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/users/${u.uid}`, {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ role }),
      });
      if (!r.ok) { alert("שגיאה"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function toggleDisable(u: ManagedUser) {
    const disabled = !u.disabled;
    const verb = disabled ? "להשבית" : "להפעיל";
    if (!confirm(`${verb} את ${u.username}?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/users/${u.uid}`, {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ disabled }),
      });
      if (!r.ok) { alert("שגיאה"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function deleteUser(u: ManagedUser) {
    if (!confirm(`למחוק את ${u.username} לצמיתות? כל הניחושים והנתונים שלו יימחקו.`)) return;
    if (!confirm("פעולה זו בלתי הפיכה. להמשיך?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/users/${u.uid}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      if (!r.ok) { alert("שגיאה במחיקה"); return; }
      load();
    } finally { setBusy(false); }
  }

  if (!user) return null;
  if (!user.isAdmin) return null;

  return (
    <section style={{ marginTop: 26 }}>
      <div className="admin-bar">
        <h3>👥 ניהול משתמשים פנימי</h3>
        <button className="btn btn-primary" onClick={createUser} disabled={busy}>
          ➕ צור משתמש חדש
        </button>
      </div>

      <p className="muted" style={{ marginBottom: 10 }}>
        אתה (כמנהל) יכול ליצור חשבונות עם שם משתמש וסיסמה בלבד — ללא צורך באימייל אמיתי או אימות.
        משתמשים יתחברו דרך עמוד הכניסה הרגיל עם שם המשתמש שתיתן להם.
      </p>

      {error && <p className="pred-msg is-locked">{error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>שם משתמש</th>
              <th>שם תצוגה</th>
              <th>תפקיד</th>
              <th>סטטוס</th>
              <th>נוצר על-ידי</th>
              <th>נוצר ב</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && !busy && (
              <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 20 }}>
                אין משתמשים מנוהלים עדיין. לחץ "צור משתמש חדש" כדי להתחיל.
              </td></tr>
            )}
            {users.map(u => (
              <tr key={u.uid}>
                <td><strong>{u.username}</strong></td>
                <td>{u.displayName}</td>
                <td>
                  <span className={`chip ${u.role === "admin" ? "chip-strong" : ""}`}>
                    {u.role === "admin" ? "🛡️ Admin" : "👤 User"}
                  </span>
                </td>
                <td>
                  {u.disabled
                    ? <span className="badge badge-finished">🚫 מושבת</span>
                    : <span className="status-pill pill-open">✓ פעיל</span>}
                </td>
                <td className="muted" style={{ fontSize: 11 }}>{u.createdBy || "—"}</td>
                <td className="muted" style={{ fontSize: 11 }}>
                  {u.createdAt ? new Date(u.createdAt).toLocaleDateString("he-IL") : "—"}
                </td>
                <td className="adm-actions">
                  <button className="btn btn-small btn-primary" onClick={() => resetPassword(u)} disabled={busy}>🔑 סיסמה</button>
                  <button className="btn btn-small" onClick={() => renameUser(u)} disabled={busy}>✏️ שם</button>
                  <button className="btn btn-small" onClick={() => toggleRole(u)} disabled={busy}>
                    {u.role === "admin" ? "⬇ הפוך למשתמש" : "⬆ הפוך לאדמין"}
                  </button>
                  <button className="btn btn-small" onClick={() => toggleDisable(u)} disabled={busy}>
                    {u.disabled ? "✓ הפעל" : "🚫 השבת"}
                  </button>
                  <button className="btn btn-small" onClick={() => deleteUser(u)} disabled={busy}
                          style={{ background: "rgba(239,68,68,0.15)", borderColor: "var(--red)", color: "var(--red)" }}>
                    🗑️ מחק
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
