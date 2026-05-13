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
  aiBlocked?: boolean;
  groupIds?: string[];
}

interface GroupRow {
  id: string;
  name: string;
  inviteCode: string;
  memberCount?: number;
}

export default function AdminUsers() {
  const user = useStore(s => s.user);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupModal, setGroupModal] = useState<ManagedUser | null>(null);

  async function authHeaders() {
    const token = await getFirebase().auth!.currentUser!.getIdToken();
    return { "content-type": "application/json", authorization: `Bearer ${token}` };
  }

  async function load() {
    if (!user?.isAdmin) return;
    setBusy(true); setError(null);
    try {
      const [uR, gR] = await Promise.all([
        fetch("/api/admin/users", { headers: await authHeaders() }),
        fetch("/api/admin/groups", { headers: await authHeaders() }),
      ]);
      if (!uR.ok) { setError("שגיאה בטעינת המשתמשים"); return; }
      setUsers(await uR.json());
      if (gR.ok) setGroups(await gR.json());
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

  async function patch(uid: string, body: any, errMsg = "שגיאה") {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/users/${uid}`, {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error || errMsg);
        return false;
      }
      load();
      return true;
    } finally { setBusy(false); }
  }

  async function resetPassword(u: ManagedUser) {
    const password = prompt(`סיסמה חדשה ל-${u.username} (לפחות 6 תווים):`);
    if (!password || password.length < 6) return;
    await patch(u.uid, { password }, "שגיאה באיפוס סיסמה");
  }

  async function renameDisplay(u: ManagedUser) {
    const displayName = prompt("שם תצוגה חדש:", u.displayName);
    if (!displayName) return;
    await patch(u.uid, { displayName });
  }

  async function renameUsername(u: ManagedUser) {
    const username = prompt(
      `שם משתמש חדש ל-${u.username}:\n(3-30 תווים, אותיות קטנות, מספרים, ._-)\nאחרי השינוי הוא יתחבר עם השם החדש.`,
      u.username
    );
    if (!username || username === u.username) return;
    await patch(u.uid, { username }, "שגיאה בשינוי שם המשתמש");
  }

  async function toggleRole(u: ManagedUser) {
    const role = u.role === "admin" ? "user" : "admin";
    if (!confirm(`לשנות את התפקיד של ${u.username} ל-${role}?`)) return;
    await patch(u.uid, { role });
  }

  async function toggleDisable(u: ManagedUser) {
    const disabled = !u.disabled;
    const verb = disabled ? "להשבית" : "להפעיל";
    if (!confirm(`${verb} את ${u.username}?`)) return;
    await patch(u.uid, { disabled });
  }

  async function toggleAi(u: ManagedUser) {
    await patch(u.uid, { aiBlocked: !u.aiBlocked });
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
      <p className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
        💡 <strong>מקרא פעולות:</strong> 🔑 סיסמה · 👤 שם משתמש · ✏️ שם תצוגה · 👥 שיוך לקבוצות · 🤖 חסימת AI · 🚫 השבתה · 🗑️ מחיקה
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
              <th>קבוצות</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && !busy && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>
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
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {u.disabled
                      ? <span className="badge badge-finished">🚫 מושבת</span>
                      : <span className="status-pill pill-open">✓ פעיל</span>}
                    {u.aiBlocked && <span className="badge badge-finished" style={{ background: "rgba(239,68,68,0.18)" }}>🤖 AI חסום</span>}
                  </div>
                </td>
                <td className="muted" style={{ fontSize: 11 }}>
                  {(u.groupIds || []).length === 0 ? "—" : (u.groupIds || []).map(gid => {
                    const g = groups.find(x => x.id === gid);
                    return g ? <span key={gid} className="chip" style={{ marginInlineEnd: 4 }}>{g.name}</span> : null;
                  })}
                </td>
                <td className="adm-actions" style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-small btn-primary" onClick={() => resetPassword(u)} disabled={busy} title="איפוס סיסמה">🔑</button>
                  <button className="btn btn-small" onClick={() => renameUsername(u)} disabled={busy} title="שינוי שם משתמש">👤</button>
                  <button className="btn btn-small" onClick={() => renameDisplay(u)} disabled={busy} title="שינוי שם תצוגה">✏️</button>
                  <button className="btn btn-small" onClick={() => setGroupModal(u)} disabled={busy} title="שיוך לקבוצות">👥</button>
                  <button className="btn btn-small" onClick={() => toggleAi(u)} disabled={busy}
                          title={u.aiBlocked ? "AI חסום — שחרר" : "AI פעיל — חסום"}
                          style={{ background: u.aiBlocked ? "rgba(239,68,68,0.15)" : "transparent" }}>
                    {u.aiBlocked ? "🤖🚫" : "🤖"}
                  </button>
                  <button className="btn btn-small" onClick={() => toggleRole(u)} disabled={busy}
                          title={u.role === "admin" ? "הפוך למשתמש רגיל" : "הפוך לאדמין"}>
                    {u.role === "admin" ? "⬇" : "⬆"}
                  </button>
                  <button className="btn btn-small" onClick={() => toggleDisable(u)} disabled={busy}
                          title={u.disabled ? "הפעל" : "השבת"}>
                    {u.disabled ? "✓" : "🚫"}
                  </button>
                  <button className="btn btn-small" onClick={() => deleteUser(u)} disabled={busy}
                          title="מחיקה לצמיתות"
                          style={{ background: "rgba(239,68,68,0.15)", borderColor: "var(--red)", color: "var(--red)" }}>
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {groupModal && (
        <GroupAssignModal
          user={groupModal}
          groups={groups}
          onClose={() => setGroupModal(null)}
          onChange={() => load()}
          authHeaders={authHeaders}
        />
      )}
    </section>
  );
}

/* ===================================================================
 * Group assignment modal — admin assigns/unassigns user to/from groups
 * =================================================================== */
function GroupAssignModal({
  user, groups, onClose, onChange, authHeaders,
}: {
  user: ManagedUser;
  groups: GroupRow[];
  onClose: () => void;
  onChange: () => void;
  authHeaders: () => Promise<any>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(groupId: string, currentlyMember: boolean) {
    setBusy(groupId);
    try {
      const body = currentlyMember
        ? { removeFromGroupId: groupId }
        : { addToGroupId: groupId };
      const r = await fetch(`/api/admin/users/${user.uid}`, {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error || "שגיאה");
        return;
      }
      onChange();
    } finally { setBusy(null); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" style={{ maxWidth: 520 }}>
        <button className="modal-close" onClick={onClose} aria-label="סגור">✕</button>
        <header className="modal-header">
          <h2>👥 שיוך {user.displayName} לקבוצות</h2>
          <div className="muted">סמן את הקבוצות שהמשתמש יהיה חבר בהן</div>
        </header>

        {groups.length === 0 ? (
          <p className="muted" style={{ marginTop: 14 }}>
            עוד לא נוצרו קבוצות. צור קבוצה דרך לשונית "דירוג חברים" קודם.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
            {groups.map(g => {
              const isMember = (user.groupIds || []).includes(g.id);
              return (
                <label
                  key={g.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px",
                    background: isMember ? "rgba(0,212,255,0.08)" : "var(--bg-elev)",
                    border: `1px solid ${isMember ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 10,
                    cursor: busy === g.id ? "wait" : "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isMember}
                    disabled={busy === g.id}
                    onChange={() => toggle(g.id, isMember)}
                  />
                  <div style={{ flex: 1 }}>
                    <strong>{g.name}</strong>
                    <span className="muted" style={{ marginInlineStart: 8, fontSize: 11 }}>
                      קוד: <code className="invite-code">{g.inviteCode}</code>
                      {" · "}{g.memberCount || 0} חברים
                    </span>
                  </div>
                  {busy === g.id && <span className="muted" style={{ fontSize: 11 }}>שומר…</span>}
                </label>
              );
            })}
          </div>
        )}

        <div className="mc-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onClose}>סיום</button>
        </div>
      </div>
    </div>
  );
}
