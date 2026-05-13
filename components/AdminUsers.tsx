"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";

interface UserRow {
  uid: string;
  email?: string;
  displayName?: string;
  username?: string | null;
  role?: "admin" | "user";
  disabled?: boolean;
  isManaged?: boolean;
  provider?: string;
  createdAt?: string;
  lastLoginAt?: string;
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
  const me = useStore(s => s.user);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupModal, setGroupModal] = useState<UserRow | null>(null);
  const [filter, setFilter] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  async function authHeaders() {
    const token = await getFirebase().auth!.currentUser!.getIdToken();
    return { "content-type": "application/json", authorization: `Bearer ${token}` };
  }

  async function load() {
    if (!me?.isAdmin) return;
    setBusy(true); setError(null);
    try {
      const [pR, gR] = await Promise.all([
        fetch("/api/admin/profiles", { headers: await authHeaders() }),
        fetch("/api/admin/groups",   { headers: await authHeaders() }),
      ]);
      if (!pR.ok) {
        let detail = `HTTP ${pR.status}`;
        try {
          const d = await pR.json();
          detail = d.message || d.error || detail;
        } catch {}
        setError(`שגיאה בטעינת המשתמשים: ${detail}`);
        return;
      }
      setUsers(await pR.json());
      if (gR.ok) setGroups(await gR.json());
    } catch (e: any) {
      setError(`שגיאה בטעינת המשתמשים: ${e?.message || "רשת לא זמינה"}`);
    } finally { setBusy(false); }
  }

  useEffect(() => { load(); }, [me?.isAdmin]);

  async function createManaged() {
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

  async function patchManaged(uid: string, body: any, errMsg = "שגיאה") {
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

  async function patchProfile(uid: string, body: any, errMsg = "שגיאה") {
    /* Updates regular (non-managed) profiles via /api/admin/profiles */
    setBusy(true);
    try {
      const r = await fetch("/api/admin/profiles", {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ uid, ...body }),
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

  async function patchUser(u: UserRow, body: any, errMsg = "שגיאה") {
    /* Dispatches to the right API based on user type */
    return u.isManaged ? patchManaged(u.uid, body, errMsg) : patchProfile(u.uid, body, errMsg);
  }

  async function resetPassword(u: UserRow) {
    if (!u.isManaged) {
      alert("רק משתמשים פנימיים (username/password) ניתנים לאיפוס סיסמה דרך הפאנל.\nמשתמשי Google מנהלים את הסיסמה דרך Google.");
      return;
    }
    const password = prompt(`סיסמה חדשה ל-${u.username || u.displayName} (לפחות 6 תווים):`);
    if (!password || password.length < 6) return;
    await patchManaged(u.uid, { password }, "שגיאה באיפוס סיסמה");
  }

  async function renameDisplay(u: UserRow) {
    const displayName = prompt("שם תצוגה חדש:", u.displayName || "");
    if (!displayName) return;
    await patchUser(u, { displayName });
  }

  async function renameUsername(u: UserRow) {
    if (!u.isManaged) {
      alert("שינוי שם משתמש זמין רק למשתמשים פנימיים שנוצרו דרך הפאנל.");
      return;
    }
    const username = prompt(
      `שם משתמש חדש ל-${u.username}:\n(3-30 תווים, אותיות קטנות, מספרים, ._-)\nאחרי השינוי הוא יתחבר עם השם החדש.`,
      u.username || ""
    );
    if (!username || username === u.username) return;
    await patchManaged(u.uid, { username }, "שגיאה בשינוי שם המשתמש");
  }

  async function toggleRole(u: UserRow) {
    if (!u.isManaged) {
      alert("שינוי תפקיד דרך הפאנל זמין רק למשתמשים פנימיים.\nGoogle admins מוגדרים דרך ADMIN_EMAILS ב‑Vercel.");
      return;
    }
    const role = u.role === "admin" ? "user" : "admin";
    if (!confirm(`לשנות את התפקיד של ${u.username} ל-${role}?`)) return;
    await patchManaged(u.uid, { role });
  }

  async function toggleDisable(u: UserRow) {
    const disabled = !u.disabled;
    const verb = disabled ? "להשבית" : "להפעיל";
    if (!confirm(`${verb} את ${u.displayName || u.email}?`)) return;
    await patchUser(u, { disabled });
  }

  async function toggleAi(u: UserRow) {
    await patchUser(u, { aiBlocked: !u.aiBlocked });
  }

  async function deleteUser(u: UserRow) {
    if (u.uid === me?.uid) { alert("אי אפשר למחוק את עצמך."); return; }
    if (!confirm(`למחוק את ${u.displayName || u.email} לצמיתות? כל הניחושים והנתונים שלו יימחקו.`)) return;
    if (!confirm("פעולה זו בלתי הפיכה. להמשיך?")) return;
    setBusy(true);
    try {
      /* Both managed and Google users go through the same delete endpoint */
      const url = u.isManaged
        ? `/api/admin/users/${u.uid}`
        : `/api/admin/profiles`;
      const r = await fetch(url, {
        method: "DELETE",
        headers: await authHeaders(),
        body: u.isManaged ? undefined : JSON.stringify({ uid: u.uid }),
      });
      if (!r.ok) { alert("שגיאה במחיקה"); return; }
      load();
    } finally { setBusy(false); }
  }

  if (!me) return null;
  if (!me.isAdmin) return null;

  const filtered = users.filter(u => {
    if (onlyUnassigned && (u.groupIds || []).length > 0) return false;
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (u.displayName || "").toLowerCase().includes(q)
        || (u.email || "").toLowerCase().includes(q)
        || (u.username || "").toLowerCase().includes(q)
        || u.uid.toLowerCase().includes(q);
  });

  const unassignedCount = users.filter(u => (u.groupIds || []).length === 0).length;

  return (
    <section style={{ marginTop: 26 }}>
      <div className="admin-bar">
        <h3>👥 ניהול משתמשים פנימי</h3>
        <button className="btn btn-primary" onClick={createManaged} disabled={busy}>
          ➕ צור משתמש פנימי חדש
        </button>
      </div>

      <p className="muted" style={{ marginBottom: 10 }}>
        מציג את <strong>כל המשתמשים</strong> במערכת — גם משתמשי Google וגם משתמשים פנימיים (username/password) שאתה יצרת.
        ניתן ליצור משתמש פנימי חדש עם שם משתמש וסיסמה (ללא צורך באימייל אמיתי).
      </p>
      <p className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
        💡 <strong>פעולות:</strong> 🔑 סיסמה · 👤 שם משתמש · ✏️ שם תצוגה · 👥 שיוך לקבוצות · 🤖 חסימת AI · 🚫 השבתה · 🗑️ מחיקה
      </p>

      <div className="filter-row" style={{ marginBottom: 10 }}>
        <input
          type="text"
          placeholder="🔎 חפש לפי שם / אימייל / username..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ flex: 1, padding: 7, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={onlyUnassigned} onChange={e => setOnlyUnassigned(e.target.checked)} />
          הצג רק לא משויכים לקבוצה
          {unassignedCount > 0 && <span className="chip" style={{ background: "var(--orange)", color: "#fff" }}>{unassignedCount}</span>}
        </label>
      </div>

      {error && <p className="pred-msg is-locked">{error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>שם תצוגה</th>
              <th>אימייל / שם משתמש</th>
              <th>סוג</th>
              <th>סטטוס</th>
              <th>קבוצות</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !busy && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>
                {users.length === 0 ? "אין משתמשים במערכת." : "אין תוצאות מתאימות לחיפוש."}
              </td></tr>
            )}
            {filtered.map(u => (
              <tr key={u.uid} style={u.uid === me.uid ? { background: "rgba(0,212,255,0.06)" } : {}}>
                <td>
                  <strong>{u.displayName || "—"}</strong>
                  {u.uid === me.uid && <span className="chip chip-strong" style={{ marginInlineStart: 6, fontSize: 10 }}>אתה</span>}
                </td>
                <td style={{ fontSize: 12 }}>
                  {u.username && <><strong>@{u.username}</strong><br /></>}
                  <span className="muted">{u.email || "—"}</span>
                </td>
                <td>
                  {u.isManaged
                    ? <span className="chip">פנימי</span>
                    : <span className="chip chip-soft">{u.provider === "google.com" ? "🌐 Google" : "🌐 חיצוני"}</span>}
                  <br/>
                  <span className={`chip ${u.role === "admin" ? "chip-strong" : ""}`} style={{ fontSize: 10, marginTop: 3 }}>
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
                <td style={{ minWidth: 130 }}>
                  {(u.groupIds || []).length === 0 ? (
                    <span style={{
                      display: "inline-block",
                      padding: "3px 10px",
                      background: "rgba(245,158,11,0.18)",
                      color: "var(--orange)",
                      border: "1px solid var(--orange)",
                      borderRadius: 999,
                      fontSize: 11, fontWeight: 700,
                    }}>⚠ לא משויך</span>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {(u.groupIds || []).map(gid => {
                        const g = groups.find(x => x.id === gid);
                        return g
                          ? <span key={gid} className="chip" style={{ fontSize: 11 }}>{g.name}</span>
                          : <span key={gid} className="muted" style={{ fontSize: 10 }}>{gid.slice(0, 6)}…</span>;
                      })}
                    </div>
                  )}
                </td>
                <td className="adm-actions" style={{ whiteSpace: "nowrap" }}>
                  {u.isManaged && (
                    <>
                      <button className="btn btn-small btn-primary" onClick={() => resetPassword(u)} disabled={busy} title="איפוס סיסמה">🔑</button>
                      <button className="btn btn-small" onClick={() => renameUsername(u)} disabled={busy} title="שינוי שם משתמש">👤</button>
                    </>
                  )}
                  <button className="btn btn-small" onClick={() => renameDisplay(u)} disabled={busy} title="שינוי שם תצוגה">✏️</button>
                  <button className="btn btn-small" onClick={() => setGroupModal(u)} disabled={busy} title="שיוך לקבוצות">👥</button>
                  <button className="btn btn-small" onClick={() => toggleAi(u)} disabled={busy}
                          title={u.aiBlocked ? "AI חסום — שחרר" : "AI פעיל — חסום"}
                          style={{ background: u.aiBlocked ? "rgba(239,68,68,0.15)" : "transparent" }}>
                    {u.aiBlocked ? "🤖🚫" : "🤖"}
                  </button>
                  {u.isManaged && (
                    <button className="btn btn-small" onClick={() => toggleRole(u)} disabled={busy}
                            title={u.role === "admin" ? "הפוך למשתמש רגיל" : "הפוך לאדמין"}>
                      {u.role === "admin" ? "⬇" : "⬆"}
                    </button>
                  )}
                  <button className="btn btn-small" onClick={() => toggleDisable(u)} disabled={busy}
                          title={u.disabled ? "הפעל" : "השבת"}>
                    {u.disabled ? "✓" : "🚫"}
                  </button>
                  {u.uid !== me.uid && (
                    <button className="btn btn-small" onClick={() => deleteUser(u)} disabled={busy}
                            title="מחיקה לצמיתות"
                            style={{ background: "rgba(239,68,68,0.15)", borderColor: "var(--red)", color: "var(--red)" }}>
                      🗑️
                    </button>
                  )}
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
  user: UserRow;
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
      /* Both managed and external users can be assigned via /api/admin/users/{uid} */
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
          <h2>👥 שיוך {user.displayName || user.email} לקבוצות</h2>
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
