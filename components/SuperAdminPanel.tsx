"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MATCHES, TEAMS } from "@/lib/data";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import { AVATARS } from "@/lib/avatars";

/* God-mode admin panel — full control over every piece of user data.
 * Sections (collapsible):
 *   1. Match Results
 *   2. Users (profiles, edit any field, delete cascade)
 *   3. Groups
 *   4. Activity Feed cleanup
 *   5. User Data Deep Dive (single-user "show me everything")
 */

interface ProfileRow {
  uid: string;
  displayName?: string;
  avatarId?: string;
  email?: string;
  disabled?: boolean;
  provider?: string;
  createdAt?: string;
  lastLoginAt?: string;
  aiBlocked?: boolean;
}
interface PredictionRow {
  id: string; uid: string; matchId: string;
  homeScore: number; awayScore: number; joker?: boolean; auto?: boolean;
}
interface GroupRow {
  id: string; name: string; inviteCode: string; description?: string;
  memberCount?: number; members?: any[];
}
interface ResultRow {
  id: string; matchId: string; home: number; away: number; sim?: boolean;
}

async function adminAuthHeaders() {
  const token = await getFirebase().auth!.currentUser!.getIdToken();
  return { "content-type": "application/json", authorization: `Bearer ${token}` };
}

export default function SuperAdminPanel() {
  const user = useStore(s => s.user);

  if (!user) return (
    <div className="admin-locked">
      <h3>🔒 שליטה מלאה</h3>
      <p className="muted">צריך להתחבר כדי לגשת.</p>
      <Link href="/login" className="btn btn-primary">כניסה</Link>
    </div>
  );
  if (!user.isAdmin) return (
    <div className="admin-locked">
      <h3>🔒 שליטה מלאה — Super Admin בלבד</h3>
      <p className="muted">אין לך הרשאה. הוסף את האימייל שלך ל-<code>ADMIN_EMAILS</code> ב-<code>.env.local</code>.</p>
      <p className="muted">משתמש מחובר: <strong>{user.email}</strong></p>
    </div>
  );

  return (
    <section>
      <div className="admin-bar">
        <h3>🛡️ שליטה מלאה — Super Admin</h3>
        <div className="muted">{user.email}</div>
      </div>

      <p className="muted" style={{ marginBottom: 14 }}>
        פאנל ניהול מלא. כל הפעולות פועלות מיידית ומשפיעות על כל המשתמשים.
      </p>

      <details className="adm-section" open>
        <summary>🏁 תוצאות משחקים</summary>
        <ResultsAdmin />
      </details>

      <details className="adm-section">
        <summary>👥 משתמשים — שמות, אווטר, סיסמה, השבתה, מחיקה</summary>
        <UsersAdmin />
      </details>

      <details className="adm-section">
        <summary>🔮 ניחושים של משתמשים — עריכה ומחיקה</summary>
        <PredictionsAdmin />
      </details>

      <details className="adm-section">
        <summary>👫 קבוצות חברים — עריכה ומחיקה</summary>
        <GroupsAdmin />
      </details>

      <details className="adm-section">
        <summary>📡 פיד פעילות — ניקוי</summary>
        <ActivityAdmin />
      </details>

      <details className="adm-section">
        <summary>🔍 כל המידע על משתמש (Deep View)</summary>
        <UserDeepView />
      </details>
    </section>
  );
}

/* ============================ 1. RESULTS ============================ */
function ResultsAdmin() {
  const [results, setResults] = useState<ResultRow[]>([]);
  const [busy, setBusy] = useState(false);
  const byMatchId = useMemo(() => Object.fromEntries(results.map(r => [r.matchId, r])), [results]);
  const [filter, setFilter] = useState("");

  async function load() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/results", { headers: await adminAuthHeaders() });
      if (r.ok) setResults(await r.json());
    } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function saveResult(matchId: string, home: number, away: number) {
    await fetch("/api/admin/results", {
      method: "POST", headers: await adminAuthHeaders(),
      body: JSON.stringify({ matchId, home, away }),
    });
    load();
  }
  async function deleteResult(matchId: string) {
    if (!confirm("למחוק את התוצאה?")) return;
    await fetch("/api/admin/results", {
      method: "DELETE", headers: await adminAuthHeaders(),
      body: JSON.stringify({ matchId }),
    });
    load();
  }

  const matchesFiltered = MATCHES.filter(m => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return m.id.toLowerCase().includes(f) ||
           m.home.toLowerCase().includes(f) ||
           m.away.toLowerCase().includes(f) ||
           (TEAMS[m.home]?.name || "").includes(filter) ||
           (TEAMS[m.away]?.name || "").includes(filter);
  });

  return (
    <div className="adm-body">
      <input className="flt-input" placeholder="חפש משחק (קוד / קבוצה)..." value={filter} onChange={e => setFilter(e.target.value)}
             style={{ width: "100%", padding: 8, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", marginBottom: 10 }} />
      <div className="adm-table-wrap" style={{ maxHeight: 480, overflowY: "auto" }}>
        <table className="admin-table">
          <thead><tr><th>משחק</th><th>תאריך</th><th>בית</th><th></th><th>חוץ</th><th>פעולות</th></tr></thead>
          <tbody>
            {matchesFiltered.slice(0, 80).map(m => {
              const r = byMatchId[m.id];
              return <ResultRowEditor key={m.id} match={m} result={r} onSave={saveResult} onDelete={deleteResult} />;
            })}
          </tbody>
        </table>
      </div>
      {busy && <div className="muted">טוען…</div>}
    </div>
  );
}

function ResultRowEditor({ match, result, onSave, onDelete }: any) {
  const [home, setHome] = useState(result?.home ?? "");
  const [away, setAway] = useState(result?.away ?? "");
  useEffect(() => { setHome(result?.home ?? ""); setAway(result?.away ?? ""); }, [result?.home, result?.away]);
  const homeTeam = TEAMS[match.home];
  const awayTeam = TEAMS[match.away];
  return (
    <tr>
      <td><small className="muted">{match.id}</small><br />
          {homeTeam?.flag} {homeTeam?.name || match.home} <span className="muted">נגד</span> {awayTeam?.name || match.away} {awayTeam?.flag}</td>
      <td className="muted" style={{ fontSize: 11 }}>{formatIsraelDate(match.utc, { short: true })}<br />{formatIsraelTime(match.utc)}</td>
      <td><input type="number" min={0} max={30} value={home} onChange={e => setHome(e.target.value)} style={{ width: 60 }} /></td>
      <td>:</td>
      <td><input type="number" min={0} max={30} value={away} onChange={e => setAway(e.target.value)} style={{ width: 60 }} /></td>
      <td>
        <button className="btn btn-small btn-primary"
                disabled={home === "" || away === ""}
                onClick={() => onSave(match.id, Number(home), Number(away))}>שמור</button>
        {result && <button className="btn btn-small" onClick={() => onDelete(match.id)} style={{ marginInlineStart: 4, color: "var(--red)" }}>מחק</button>}
        {result?.sim && <span className="chip" style={{ marginInlineStart: 4 }}>סים</span>}
      </td>
    </tr>
  );
}

/* ============================ 2. USERS ============================ */
function UsersAdmin() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/profiles", { headers: await adminAuthHeaders() });
      if (r.ok) setProfiles(await r.json());
    } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function patch(uid: string, body: any) {
    await fetch("/api/admin/profiles", {
      method: "PATCH", headers: await adminAuthHeaders(),
      body: JSON.stringify({ uid, ...body }),
    });
    load();
  }
  async function nuke(uid: string) {
    if (!confirm("למחוק את המשתמש לצמיתות?\nכל הנתונים שלו (ניחושים, חברויות) יימחקו.")) return;
    if (!confirm("פעולה בלתי הפיכה. להמשיך?")) return;
    await fetch("/api/admin/profiles", {
      method: "DELETE", headers: await adminAuthHeaders(),
      body: JSON.stringify({ uid }),
    });
    load();
  }

  return (
    <div className="adm-body">
      <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        💡 כפתור <strong>🤖</strong> חוסם/מאפשר למשתמש לבצע פעולות AI (ניתוח חכם, עקיצה, צ׳אט).
      </p>
      <div className="adm-table-wrap" style={{ maxHeight: 480, overflowY: "auto" }}>
        <table className="admin-table">
          <thead><tr><th>אווטר</th><th>שם / Email</th><th>פרובידר</th><th>נכנס לאחרונה</th><th>פעולות</th></tr></thead>
          <tbody>
            {profiles.map(p => (
              <UserRowEditor key={p.uid} profile={p} onPatch={patch} onDelete={nuke} />
            ))}
            {!profiles.length && !busy && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>אין משתמשים עדיין.</td></tr>}
          </tbody>
        </table>
      </div>
      {busy && <div className="muted">טוען…</div>}
    </div>
  );
}

function UserRowEditor({ profile, onPatch, onDelete }: any) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.displayName || "");
  const [avatar, setAvatar] = useState(profile.avatarId || "messi");
  return (
    <tr>
      <td>
        <select value={avatar} onChange={e => setAvatar(e.target.value)} style={{ maxWidth: 110 }} disabled={!editing}>
          {AVATARS.map(a => <option key={a.id} value={a.id}>{a.flag} {a.name}</option>)}
        </select>
      </td>
      <td>
        {editing
          ? <input type="text" value={name} onChange={e => setName(e.target.value)} style={{ width: 180 }} />
          : <strong>{profile.displayName || "—"}</strong>}
        <br /><small className="muted">{profile.email || profile.uid}</small>
      </td>
      <td className="muted" style={{ fontSize: 11 }}>
        {profile.provider || "—"}
        {profile.disabled && <><br /><span className="badge badge-finished">מושבת</span></>}
        {profile.aiBlocked && <><br /><span className="badge badge-finished" style={{ background: "rgba(239,68,68,0.18)" }}>AI חסום</span></>}
      </td>
      <td className="muted" style={{ fontSize: 11 }}>{profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleDateString("he-IL") : "—"}</td>
      <td className="adm-actions" style={{ whiteSpace: "nowrap" }}>
        {!editing
          ? <button className="btn btn-small btn-primary" onClick={() => setEditing(true)}>✏️ ערוך</button>
          : <>
              <button className="btn btn-small btn-primary" onClick={() => { onPatch(profile.uid, { displayName: name, avatarId: avatar }); setEditing(false); }}>💾 שמור</button>
              <button className="btn btn-small" onClick={() => setEditing(false)}>ביטול</button>
            </>}
        <button className="btn btn-small" onClick={() => {
          const pw = prompt("סיסמה חדשה (6+ תווים):");
          if (pw && pw.length >= 6) onPatch(profile.uid, { password: pw });
        }}>🔑</button>
        <button
          className="btn btn-small"
          title={profile.aiBlocked ? "AI חסום — לחץ כדי לאפשר" : "AI פעיל — לחץ כדי לחסום"}
          onClick={() => onPatch(profile.uid, { aiBlocked: !profile.aiBlocked })}
          style={{ background: profile.aiBlocked ? "rgba(239,68,68,0.15)" : "transparent" }}
        >
          {profile.aiBlocked ? "🤖🚫" : "🤖"}
        </button>
        <button className="btn btn-small" onClick={() => onPatch(profile.uid, { disabled: !profile.disabled })}>
          {profile.disabled ? "✓" : "🚫"}
        </button>
        <button className="btn btn-small" onClick={() => onDelete(profile.uid)} style={{ color: "var(--red)" }}>🗑️</button>
      </td>
    </tr>
  );
}

/* ============================ 3. PREDICTIONS ============================ */
function PredictionsAdmin() {
  const [uid, setUid] = useState("");
  const [matchId, setMatchId] = useState("");
  const [rows, setRows] = useState<PredictionRow[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (uid)     params.set("uid", uid);
      if (matchId) params.set("matchId", matchId);
      const r = await fetch(`/api/admin/predictions?${params}`, { headers: await adminAuthHeaders() });
      if (r.ok) setRows(await r.json());
    } finally { setBusy(false); }
  }
  async function patch(id: string, body: any) {
    await fetch("/api/admin/predictions", {
      method: "PATCH", headers: await adminAuthHeaders(),
      body: JSON.stringify({ id, ...body }),
    });
    load();
  }
  async function del(id: string) {
    if (!confirm("למחוק את הניחוש?")) return;
    await fetch("/api/admin/predictions", {
      method: "DELETE", headers: await adminAuthHeaders(),
      body: JSON.stringify({ id }),
    });
    load();
  }
  async function bulkDelete() {
    if (!uid && !matchId) { alert("הזן uid או matchId לפני מחיקה בכמות"); return; }
    if (!confirm(`למחוק את כל הניחושים התואמים את הפילטר? (${rows.length} ניחושים)`)) return;
    await fetch("/api/admin/predictions", {
      method: "DELETE", headers: await adminAuthHeaders(),
      body: JSON.stringify({ uid: uid || undefined, matchId: matchId || undefined }),
    });
    load();
  }

  return (
    <div className="adm-body">
      <div className="filter-row">
        <input type="text" placeholder="uid" value={uid} onChange={e => setUid(e.target.value)} style={{ flex: 1, padding: 6, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }} />
        <input type="text" placeholder="matchId (M001-M104)" value={matchId} onChange={e => setMatchId(e.target.value)} style={{ flex: 1, padding: 6, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }} />
        <button className="btn btn-primary" onClick={load}>🔎 חפש</button>
        {rows.length > 0 && <button className="btn" style={{ color: "var(--red)" }} onClick={bulkDelete}>🗑️ מחק הכל</button>}
      </div>

      <div className="adm-table-wrap" style={{ maxHeight: 400, overflowY: "auto", marginTop: 10 }}>
        <table className="admin-table">
          <thead><tr><th>uid</th><th>משחק</th><th>בית</th><th>חוץ</th><th>auto</th><th>פעולות</th></tr></thead>
          <tbody>
            {rows.map(p => <PredictionRowEditor key={p.id} pred={p} onPatch={patch} onDelete={del} />)}
            {!rows.length && !busy && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>אין תוצאות. מלא uid או matchId ולחץ חפש.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PredictionRowEditor({ pred, onPatch, onDelete }: any) {
  const [h, setH] = useState(pred.homeScore);
  const [a, setA] = useState(pred.awayScore);
  const match = MATCHES.find(m => m.id === pred.matchId);
  return (
    <tr>
      <td style={{ fontFamily: "monospace", fontSize: 10 }}>{pred.uid.slice(0, 12)}…</td>
      <td>{match ? `${TEAMS[match.home]?.name || match.home}-${TEAMS[match.away]?.name || match.away}` : pred.matchId}</td>
      <td><input type="number" min={0} max={30} value={h} onChange={e => setH(Number(e.target.value))} style={{ width: 55 }} /></td>
      <td><input type="number" min={0} max={30} value={a} onChange={e => setA(Number(e.target.value))} style={{ width: 55 }} /></td>
      <td>{pred.auto ? "🤖" : ""}</td>
      <td>
        <button className="btn btn-small btn-primary" onClick={() => onPatch(pred.id, { homeScore: h, awayScore: a })}>💾</button>
        <button className="btn btn-small" onClick={() => onDelete(pred.id)} style={{ color: "var(--red)", marginInlineStart: 4 }}>🗑️</button>
      </td>
    </tr>
  );
}

/* ============================ 4. GROUPS ============================ */
function GroupsAdmin() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/groups", { headers: await adminAuthHeaders() });
      if (r.ok) setGroups(await r.json());
    } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function rename(id: string, name: string) {
    await fetch("/api/admin/groups", { method: "PATCH", headers: await adminAuthHeaders(), body: JSON.stringify({ id, name }) });
    load();
  }
  async function nuke(id: string) {
    if (!confirm("למחוק את הקבוצה לצמיתות? כל החברויות יוסרו.")) return;
    await fetch("/api/admin/groups", { method: "DELETE", headers: await adminAuthHeaders(), body: JSON.stringify({ id }) });
    load();
  }

  return (
    <div className="adm-body">
      <div className="adm-table-wrap" style={{ maxHeight: 360, overflowY: "auto" }}>
        <table className="admin-table">
          <thead><tr><th>שם</th><th>קוד</th><th>חברים</th><th>פעולות</th></tr></thead>
          <tbody>
            {groups.map(g => (
              <tr key={g.id}>
                <td><strong>{g.name}</strong>{g.description && <><br /><span className="muted" style={{ fontSize: 11 }}>{g.description}</span></>}</td>
                <td><code className="invite-code">{g.inviteCode}</code></td>
                <td>{g.members?.length || 0}</td>
                <td>
                  <button className="btn btn-small" onClick={() => {
                    const name = prompt("שם חדש לקבוצה:", g.name);
                    if (name) rename(g.id, name);
                  }}>✏️</button>
                  <button className="btn btn-small" onClick={() => nuke(g.id)} style={{ color: "var(--red)", marginInlineStart: 4 }}>🗑️</button>
                </td>
              </tr>
            ))}
            {!groups.length && !busy && <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 20 }}>אין קבוצות עדיין.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================ 5. ACTIVITY ============================ */
function ActivityAdmin() {
  const [busy, setBusy] = useState(false);
  async function clear(payload: any, msg: string) {
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/activity", { method: "DELETE", headers: await adminAuthHeaders(), body: JSON.stringify(payload) });
      const data = await r.json();
      alert(`נמחקו ${data.deleted || 0} רשומות`);
    } finally { setBusy(false); }
  }
  return (
    <div className="adm-body">
      <div className="mc-actions">
        <button className="btn" onClick={() => clear({ all: true }, "למחוק את כל פיד הפעילות?")} disabled={busy}>🧹 נקה את כל הפיד</button>
        <button className="btn" onClick={() => {
          const uid = prompt("UID של משתמש לניקוי פיד:");
          if (uid) clear({ uid }, `למחוק את כל הפעילות של ${uid}?`);
        }} disabled={busy}>נקה לפי משתמש</button>
      </div>
    </div>
  );
}

/* ============================ 6. USER DEEP VIEW ============================ */
function UserDeepView() {
  const [uid, setUid] = useState("");
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    if (!uid) return;
    setBusy(true); setData(null);
    try {
      const r = await fetch(`/api/admin/user-data?uid=${encodeURIComponent(uid)}`, { headers: await adminAuthHeaders() });
      if (r.ok) setData(await r.json());
    } finally { setBusy(false); }
  }
  return (
    <div className="adm-body">
      <div className="filter-row">
        <input type="text" placeholder="הזן UID של משתמש..." value={uid} onChange={e => setUid(e.target.value)}
               style={{ flex: 1, padding: 8, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontFamily: "monospace" }} />
        <button className="btn btn-primary" onClick={load} disabled={busy || !uid}>🔍 הצג הכל</button>
      </div>
      {data && (
        <pre style={{
          marginTop: 10, padding: 12, background: "var(--bg-elev)", border: "1px solid var(--border)",
          borderRadius: 8, fontSize: 11, maxHeight: 480, overflow: "auto", direction: "ltr", textAlign: "left",
        }}>{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}
