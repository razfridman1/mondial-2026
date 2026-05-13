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
        <summary>🔮 כל הניחושים של כל המשתמשים — צפייה ועריכה</summary>
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

      <details className="adm-section">
        <summary>💾 גיבוי מלא — ייצוא לקובץ JSON</summary>
        <BackupAdmin />
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
  const [rows, setRows] = useState<PredictionRow[]>([]);
  const [profilesByUid, setProfilesByUid] = useState<Record<string, { displayName: string; avatarId: string }>>({});
  const [resultsByMatch, setResultsByMatch] = useState<Record<string, { home: number; away: number }>>({});
  const [busy, setBusy] = useState(false);

  /* Filters */
  const [search, setSearch]   = useState("");
  const [matchId, setMatchId] = useState("");
  const [stage, setStage]     = useState<string>("ALL");
  const [groupId, setGroupId] = useState<string>("");
  const [groups, setGroups]   = useState<{ id: string; name: string; memberUids: string[] }[]>([]);

  async function load() {
    setBusy(true);
    try {
      const [predR, profR, resR, grpR] = await Promise.all([
        fetch(`/api/admin/predictions`, { headers: await adminAuthHeaders() }),
        fetch(`/api/admin/profiles`,   { headers: await adminAuthHeaders() }),
        fetch(`/api/match-results`),
        fetch(`/api/admin/groups`,     { headers: await adminAuthHeaders() }),
      ]);
      if (predR.ok) setRows(await predR.json());
      if (profR.ok) {
        const arr = await profR.json();
        const map: Record<string, any> = {};
        for (const p of arr) map[p.uid] = { displayName: p.displayName || p.email || "—", avatarId: p.avatarId || "messi" };
        setProfilesByUid(map);
      }
      if (resR.ok) setResultsByMatch(await resR.json());
      if (grpR.ok) {
        const arr = await grpR.json();
        setGroups(arr.map((g: any) => ({
          id: g.id,
          name: g.name,
          memberUids: (g.members || []).map((m: any) => m.uid),
        })));
      }
    } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

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
    if (!confirm(`למחוק את כל ${filtered.length} הניחושים המסוננים?`)) return;
    if (!confirm("פעולה זו בלתי הפיכה. להמשיך?")) return;
    /* Use individual deletes via id to honor the current filter view */
    setBusy(true);
    try {
      for (const p of filtered) {
        await fetch("/api/admin/predictions", {
          method: "DELETE", headers: await adminAuthHeaders(),
          body: JSON.stringify({ id: p.id }),
        });
      }
      await load();
    } finally { setBusy(false); }
  }

  /* Build filtered, enriched, sorted rows */
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const groupUids = groupId ? new Set(groups.find(g => g.id === groupId)?.memberUids || []) : null;
    return rows.filter(p => {
      if (matchId && p.matchId !== matchId) return false;
      if (stage !== "ALL") {
        const m = MATCHES.find(x => x.id === p.matchId);
        if (!m) return false;
        if (stage === "KNOCKOUT" ? m.stage === "GROUP" : m.stage !== stage) return false;
      }
      if (groupUids && !groupUids.has(p.uid)) return false;
      if (s) {
        const prof = profilesByUid[p.uid];
        const name = (prof?.displayName || "").toLowerCase();
        if (!name.includes(s) && !p.uid.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [rows, profilesByUid, groups, search, matchId, stage, groupId]);

  const totalsByUid = useMemo(() => {
    const t: Record<string, { count: number; points: number; exact: number }> = {};
    for (const p of filtered) {
      const r = resultsByMatch[p.matchId];
      const e = t[p.uid] || { count: 0, points: 0, exact: 0 };
      e.count++;
      if (r) {
        const exact = p.homeScore === r.home && p.awayScore === r.away;
        const sgnP = Math.sign(p.homeScore - p.awayScore);
        const sgnR = Math.sign(r.home - r.away);
        const resOk = sgnP === sgnR;
        const diffOk = (p.homeScore - p.awayScore) === (r.home - r.away);
        const pts = exact ? 7 : resOk ? (diffOk ? 4 : 3) : 0;
        e.points += pts;
        if (exact) e.exact++;
      }
      t[p.uid] = e;
    }
    return t;
  }, [filtered, resultsByMatch]);

  return (
    <div className="adm-body">
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        💡 כל הניחושים של כל המשתמשים מוצגים. השתמש בפילטרים כדי לצמצם תצוגה.
        בעמודה "נקודות" — חישוב לפי תוצאות שכבר קיימות (משחקים שלא הסתיימו = 0).
      </p>

      <div className="filter-row" style={{ flexWrap: "wrap" }}>
        <input type="text" placeholder="🔎 חפש לפי שם משתמש או uid…" value={search} onChange={e => setSearch(e.target.value)}
               style={{ flex: "1 1 200px", padding: 6, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }} />
        <select value={stage} onChange={e => setStage(e.target.value)}
                style={{ padding: 6, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }}>
          <option value="ALL">כל השלבים</option>
          <option value="GROUP">שלב הבתים</option>
          <option value="KNOCKOUT">נוקאאוט בלבד</option>
          <option value="R32">שלב 32</option>
          <option value="R16">שלב 16</option>
          <option value="QF">רבע גמר</option>
          <option value="SF">חצי גמר</option>
          <option value="THIRD">המקום ה‑3</option>
          <option value="FINAL">הגמר</option>
        </select>
        <select value={groupId} onChange={e => setGroupId(e.target.value)}
                style={{ padding: 6, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }}>
          <option value="">כל הקבוצות (כולל אורחים)</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <input type="text" placeholder="matchId (M001-M104)" value={matchId} onChange={e => setMatchId(e.target.value)}
               style={{ width: 130, padding: 6, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }} />
        <button className="btn" onClick={load} disabled={busy}>↻ רענן</button>
        {filtered.length > 0 && (
          <button className="btn" style={{ color: "var(--red)" }} onClick={bulkDelete} disabled={busy}>
            🗑️ מחק {filtered.length}
          </button>
        )}
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        {busy ? "טוען…" : `סה"כ: ${filtered.length.toLocaleString("he-IL")} ניחושים · ${Object.keys(totalsByUid).length} משתמשים`}
      </div>

      <div className="adm-table-wrap" style={{ maxHeight: 560, overflowY: "auto", marginTop: 10 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>משתמש</th>
              <th>משחק</th>
              <th>שלב</th>
              <th>ניחוש</th>
              <th>תוצאה</th>
              <th>נק׳</th>
              <th>auto</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <PredictionRowEditor
                key={p.id}
                pred={p}
                profile={profilesByUid[p.uid]}
                result={resultsByMatch[p.matchId]}
                onPatch={patch}
                onDelete={del}
              />
            ))}
            {!filtered.length && !busy && (
              <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 20 }}>
                אין ניחושים תואמים את הפילטר.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PredictionRowEditor({ pred, profile, result, onPatch, onDelete }: any) {
  const [h, setH] = useState(pred.homeScore);
  const [a, setA] = useState(pred.awayScore);
  const [editing, setEditing] = useState(false);
  const match = MATCHES.find(m => m.id === pred.matchId);
  const stageName = match ? (match.stage === "GROUP" ? `בית ${match.group || ""}` : ({GROUP:"בתים",R32:"32",R16:"16",QF:"רבע",SF:"חצי",THIRD:"3-4",FINAL:"גמר"} as any)[match.stage] || match.stage) : "—";

  let points = "—";
  let pointsColor = "";
  if (result) {
    const exact = pred.homeScore === result.home && pred.awayScore === result.away;
    const sgnP = Math.sign(pred.homeScore - pred.awayScore);
    const sgnR = Math.sign(result.home - result.away);
    const resOk = sgnP === sgnR;
    const diffOk = (pred.homeScore - pred.awayScore) === (result.home - result.away);
    const pts = exact ? 7 : resOk ? (diffOk ? 4 : 3) : 0;
    points = String(pts);
    pointsColor = pts >= 7 ? "#22c55e" : pts > 0 ? "var(--accent)" : "var(--red)";
  }

  return (
    <tr>
      <td>
        <strong style={{ fontSize: 13 }}>{profile?.displayName || "—"}</strong>
        <br />
        <span className="muted" style={{ fontFamily: "monospace", fontSize: 10 }}>{pred.uid.slice(0, 10)}…</span>
      </td>
      <td style={{ fontSize: 12 }}>
        {match
          ? <>
              <span>{TEAMS[match.home]?.flag || ""} {TEAMS[match.home]?.name || match.home}</span>
              <span className="muted"> נגד </span>
              <span>{TEAMS[match.away]?.name || match.away} {TEAMS[match.away]?.flag || ""}</span>
              <br/>
              <span className="muted" style={{ fontSize: 10 }}>{match.id}</span>
            </>
          : pred.matchId}
      </td>
      <td><span className="chip" style={{ fontSize: 11 }}>{stageName}</span></td>
      <td>
        {editing ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="number" min={0} max={30} value={h} onChange={e => setH(Number(e.target.value))} style={{ width: 44 }} />
            <span>:</span>
            <input type="number" min={0} max={30} value={a} onChange={e => setA(Number(e.target.value))} style={{ width: 44 }} />
          </div>
        ) : (
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>{pred.homeScore} : {pred.awayScore}</strong>
        )}
      </td>
      <td>
        {result
          ? <strong style={{ color: "var(--accent-2)", fontVariantNumeric: "tabular-nums" }}>{result.home} : {result.away}</strong>
          : <span className="muted">—</span>}
      </td>
      <td>
        <strong style={{ color: pointsColor, fontVariantNumeric: "tabular-nums" }}>{points}</strong>
      </td>
      <td>{pred.auto ? "🤖" : ""}</td>
      <td style={{ whiteSpace: "nowrap" }}>
        {editing ? (
          <>
            <button className="btn btn-small btn-primary" onClick={() => { onPatch(pred.id, { homeScore: h, awayScore: a }); setEditing(false); }}>💾</button>
            <button className="btn btn-small" onClick={() => { setH(pred.homeScore); setA(pred.awayScore); setEditing(false); }} style={{ marginInlineStart: 4 }}>↩</button>
          </>
        ) : (
          <button className="btn btn-small" onClick={() => setEditing(true)}>✏️</button>
        )}
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

  async function patch(id: string, body: any) {
    const r = await fetch("/api/admin/groups", {
      method: "PATCH",
      headers: await adminAuthHeaders(),
      body: JSON.stringify({ id, ...body }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "שגיאה");
      return false;
    }
    load();
    return true;
  }
  async function nuke(id: string) {
    if (!confirm("למחוק את הקבוצה לצמיתות? כל החברויות יוסרו.")) return;
    await fetch("/api/admin/groups", { method: "DELETE", headers: await adminAuthHeaders(), body: JSON.stringify({ id }) });
    load();
  }

  return (
    <div className="adm-body">
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        💡 לחץ <strong>✏️ ערוך</strong> כדי לשנות את שם הקבוצה, התיאור, או קוד ההזמנה.
      </p>
      <div className="adm-table-wrap" style={{ maxHeight: 480, overflowY: "auto" }}>
        <table className="admin-table">
          <thead><tr><th>שם / תיאור</th><th>קוד הזמנה</th><th>חברים</th><th>פעולות</th></tr></thead>
          <tbody>
            {groups.map(g => (
              <GroupRowEditor key={g.id} g={g} onPatch={patch} onDelete={nuke} />
            ))}
            {!groups.length && !busy && <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 20 }}>אין קבוצות עדיין.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRowEditor({ g, onPatch, onDelete }: any) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(g.name || "");
  const [desc, setDesc] = useState(g.description || "");
  const [code, setCode] = useState(g.inviteCode || "");

  /* Reset inputs when group data refreshes from server */
  useEffect(() => {
    setName(g.name || "");
    setDesc(g.description || "");
    setCode(g.inviteCode || "");
  }, [g.name, g.description, g.inviteCode]);

  async function save() {
    const body: any = {};
    if (name.trim() && name.trim() !== g.name) body.name = name.trim();
    if (desc !== (g.description || "")) body.description = desc.trim();
    if (code.trim() && code.trim().toUpperCase() !== g.inviteCode) body.inviteCode = code.trim().toUpperCase();
    if (!Object.keys(body).length) { setEditing(false); return; }
    const ok = await onPatch(g.id, body);
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <tr>
        <td>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="שם הקבוצה"
            style={{ width: "100%", padding: 6, background: "var(--bg-elev)", border: "1px solid var(--accent)", borderRadius: 6, color: "var(--text)", marginBottom: 4 }}
          />
          <input
            type="text"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="תיאור (אופציונלי)"
            style={{ width: "100%", padding: 6, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 12 }}
          />
        </td>
        <td>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            style={{ width: 100, padding: 6, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontFamily: "monospace" }}
          />
        </td>
        <td>{g.members?.length || 0}</td>
        <td style={{ whiteSpace: "nowrap" }}>
          <button className="btn btn-small btn-primary" onClick={save}>💾 שמור</button>
          <button className="btn btn-small" onClick={() => {
            setName(g.name); setDesc(g.description || ""); setCode(g.inviteCode);
            setEditing(false);
          }} style={{ marginInlineStart: 4 }}>ביטול</button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        <strong>{g.name}</strong>
        {g.description && <><br /><span className="muted" style={{ fontSize: 11 }}>{g.description}</span></>}
      </td>
      <td><code className="invite-code">{g.inviteCode}</code></td>
      <td>{g.members?.length || 0}</td>
      <td style={{ whiteSpace: "nowrap" }}>
        <button className="btn btn-small btn-primary" onClick={() => setEditing(true)}>✏️ ערוך</button>
        <button className="btn btn-small" onClick={() => onDelete(g.id)} style={{ color: "var(--red)", marginInlineStart: 4 }}>🗑️ מחק</button>
      </td>
    </tr>
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

/* ============================ 7. BACKUP ============================ */
function BackupAdmin() {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ counts: Record<string, number>; exportedAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/backup", { headers: await adminAuthHeaders() });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "שגיאה בייצוא");
        return;
      }
      const data = await r.json();

      /* Trigger download */
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url;
      a.download = `mondial-2026-backup-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      setInfo({ counts: data.counts || {}, exportedAt: data.exportedAt });
    } catch (e: any) {
      setError(e.message || "שגיאה");
    } finally { setBusy(false); }
  }

  return (
    <div className="adm-body">
      <p className="muted" style={{ marginBottom: 10, fontSize: 13, lineHeight: 1.6 }}>
        ייצוא קובץ JSON שמכיל את <strong>כל הנתונים</strong> של האפליקציה:
        משתמשים, פרופילים, ניחושים, תוצאות, קבוצות, חברויות, סימולציות, ופיד פעילות.
        הקובץ נשמר במחשב שלך — אפשר להעלות לדרייב, GitHub, או כל מקום אחר לגיבוי.
      </p>
      <p className="muted" style={{ marginBottom: 14, fontSize: 12 }}>
        💡 <strong>שים לב:</strong> הנתונים שלך כבר נשמרים אוטומטית ב‑Firebase Firestore.
        deployment של קוד חדש לא נוגע בנתונים — הגיבוי הזה הוא רק שכבת ביטחון נוספת.
      </p>

      <div className="mc-actions">
        <button className="btn btn-primary" onClick={download} disabled={busy}>
          {busy ? "…מייצא" : "📥 הורד גיבוי מלא (JSON)"}
        </button>
      </div>

      {error && <p className="pred-msg is-locked" style={{ marginTop: 10 }}>⚠ {error}</p>}

      {info && (
        <div style={{
          marginTop: 14, padding: 12,
          background: "rgba(34,197,94,0.08)", border: "1px solid #22c55e", borderRadius: 10,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>✓ הגיבוי הורד בהצלחה</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            ייצוא: {new Date(info.exportedAt).toLocaleString("he-IL")}
          </div>
          <details>
            <summary style={{ cursor: "pointer", fontSize: 13 }}>📊 מספרי רשומות</summary>
            <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 12 }}>
              {Object.entries(info.counts).map(([coll, n]) => (
                <div key={coll}>
                  <strong>{coll}:</strong> {n}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
