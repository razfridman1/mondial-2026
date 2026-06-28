"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MATCHES, TEAMS, STAGES } from "@/lib/data";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import { AVATARS } from "@/lib/avatars";
import { scorePrediction, userTotals } from "@/lib/scoring";

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
  updatedAt?: number; predictedWinner?: string;
}
interface GroupRow {
  id: string; name: string; inviteCode: string; description?: string;
  memberCount?: number; members?: any[];
}
interface DeletedGroupRow {
  id: string;
  group: { name?: string; description?: string; inviteCode?: string; memberCount?: number };
  memberships: any[];
  deletedAt: number;
  deletedBy?: string;
}
interface ResultRow {
  id: string; matchId: string; home: number; away: number; sim?: boolean;
  winner?: string; isKnockout?: boolean;
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
        <summary>🏁 תוצאות משחקים — עריכה ידנית</summary>
        <ResultsAdmin />
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
        <summary>🔍 כל המידע על משתמש (Deep View)</summary>
        <UserDeepView />
      </details>

      <details className="adm-section">
        <summary>💾 גיבוי מלא — ייצוא לקובץ JSON</summary>
        <BackupAdmin />
      </details>

      <details className="adm-section">
        <summary>🗄️ גיבוי יומי אוטומטי — שחזור</summary>
        <FullBackupAdmin />
      </details>

      <details className="adm-section">
        <summary>📅 גיבוי תוצאות יומי</summary>
        <LeaderboardSnapshots />
      </details>

      <details className="adm-section">
        <summary>🔴 סנכרון תוצאות חי (Live Sync)</summary>
        <LiveSyncPanel />
      </details>

      <details className="adm-section">
        <summary>🎁 בונוסים ידניים — הוספת/הפחתת נקודות</summary>
        <BonusAwardsPanel />
      </details>

      <details className="adm-section">
        <summary>🌐 FIFA — משיכת נתונים חיים</summary>
        <FifaPullPanel />
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

  async function saveResult(matchId: string, home: number, away: number, winner?: string) {
    await fetch("/api/admin/results", {
      method: "POST", headers: await adminAuthHeaders(),
      body: JSON.stringify({ matchId, home, away, ...(winner ? { winner } : {}) }),
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
              return <ResultRowEditor key={m.id} match={m} result={r} onSave={saveResult} onDelete={deleteResult} onRestored={load} />;
            })}
          </tbody>
        </table>
      </div>
      {busy && <div className="muted">טוען…</div>}
    </div>
  );
}

function ResultRowEditor({ match, result, onSave, onDelete, onRestored }: any) {
  const [home, setHome] = useState(result?.home ?? "");
  const [away, setAway] = useState(result?.away ?? "");
  const [winner, setWinner] = useState(result?.winner ?? "");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const isKO = match.stage !== "GROUP";
  useEffect(() => {
    setHome(result?.home ?? "");
    setAway(result?.away ?? "");
    setWinner(result?.winner ?? "");
  }, [result?.home, result?.away, result?.winner]);
  const homeTeam = TEAMS[match.home];
  const awayTeam = TEAMS[match.away];

  async function loadHistory() {
    setHistoryBusy(true);
    try {
      const r = await fetch(`/api/admin/results/history?matchId=${match.id}`, { headers: await adminAuthHeaders() });
      setHistory(r.ok ? await r.json() : []);
    } finally { setHistoryBusy(false); }
  }
  function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    if (next && history === null) loadHistory();
  }
  async function restore(backupId: string) {
    if (!confirm("לשחזר את הגרסה הזו? המצב הנוכחי יישמר כגיבוי וניתן יהיה לחזור אליו.")) return;
    await fetch("/api/admin/results/history", {
      method: "POST", headers: await adminAuthHeaders(),
      body: JSON.stringify({ matchId: match.id, backupId }),
    });
    setHistory(null);
    onRestored?.();
    loadHistory();
  }

  const ACTION_LABELS: Record<string, string> = {
    update: "עריכה ידנית", delete: "מחיקה", "before-restore": "לפני שחזור",
  };

  return (
    <>
      {/* === ROW 1: Match result (90-min score) === */}
      <tr>
        <td rowSpan={isKO ? 2 : 1}>
          <small className="muted">{match.id}</small><br />
          {homeTeam?.flag} {homeTeam?.name || match.home} <span className="muted">נגד</span> {awayTeam?.name || match.away} {awayTeam?.flag}
        </td>
        <td rowSpan={isKO ? 2 : 1} className="muted" style={{ fontSize: 11 }}>
          {formatIsraelDate(match.utc, { short: true })}<br />{formatIsraelTime(match.utc)}
        </td>
        <td><input type="number" min={0} max={30} value={home} onChange={e => setHome(e.target.value)} style={{ width: 60 }} /></td>
        <td>:</td>
        <td><input type="number" min={0} max={30} value={away} onChange={e => setAway(e.target.value)} style={{ width: 60 }} /></td>
        <td>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            {isKO && <span className="chip" style={{ fontSize: 10, background: "var(--bg-elev)" }}>תוצאת משחק</span>}
            <button className="btn btn-small btn-primary"
                    disabled={home === "" || away === ""}
                    onClick={() => onSave(match.id, Number(home), Number(away))}>שמור תוצאה</button>
            {result && <button className="btn btn-small" onClick={() => onDelete(match.id)} style={{ color: "var(--red)" }}>מחק</button>}
            {result?.sim && <span className="chip">סים</span>}
            <button className="btn btn-small" onClick={toggleHistory} title="גיבויים קודמים">🕘</button>
          </div>
        </td>
      </tr>
      {/* === ROW 2 (KO only): Winner === */}
      {isKO && (
        <tr style={{ background: "color-mix(in srgb, var(--accent) 6%, transparent)" }}>
          <td colSpan={3} style={{ paddingTop: 6, paddingBottom: 6 }}>
            <span className="chip" style={{ fontSize: 10, background: "var(--accent)", color: "#fff", marginInlineEnd: 6 }}>מנצחת</span>
            <select value={winner} onChange={e => setWinner(e.target.value)}
                    style={{ fontSize: 12, padding: "2px 6px", background: "var(--bg-elev)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4 }}>
              <option value="">— בחר מנצחת —</option>
              <option value={match.home}>{homeTeam?.flag} {homeTeam?.name || match.home}</option>
              <option value={match.away}>{awayTeam?.flag} {awayTeam?.name || match.away}</option>
            </select>
          </td>
          <td style={{ paddingTop: 6, paddingBottom: 6 }}>
            <button className="btn btn-small btn-primary"
                    disabled={!winner || home === "" || away === ""}
                    onClick={() => onSave(match.id, Number(home), Number(away), winner)}>שמור מנצחת</button>
          </td>
        </tr>
      )}
      {showHistory && (
        <tr>
          <td colSpan={6} style={{ background: "var(--bg-elev)" }}>
            {historyBusy && <div className="muted" style={{ fontSize: 12 }}>טוען גיבויים…</div>}
            {!historyBusy && history && history.length === 0 && (
              <div className="muted" style={{ fontSize: 12 }}>אין גיבויים קודמים למשחק זה.</div>
            )}
            {!historyBusy && history && history.length > 0 && (
              <table style={{ width: "100%", fontSize: 12 }}>
                <thead><tr><th>תאריך</th><th>תוצאה</th><th>פעולה</th><th>ע"י</th><th></th></tr></thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td className="muted">{formatIsraelDate(new Date(h.backedUpAt).toISOString(), { short: true })} {formatIsraelTime(new Date(h.backedUpAt).toISOString())}</td>
                      <td>{h.home != null ? `${h.home}:${h.away}` : "—"}</td>
                      <td className="muted">{ACTION_LABELS[h.action] || h.action}</td>
                      <td className="muted">{h.backedUpBy || "—"}</td>
                      <td><button className="btn btn-small" onClick={() => restore(h.id)}>שחזר</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
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
/* localStorage key + helper for "new since last visit" badges. Returns
 * Date.now() (i.e. "nothing new") on first-ever load so existing data
 * doesn't flood the badge the first time this ships. */
const PREDICTIONS_SEEN_KEY = "mondial_admin_predictions_seen_at";
function readSeenAt(key: string): number {
  if (typeof window === "undefined") return Date.now();
  const v = window.localStorage.getItem(key);
  return v ? Number(v) : Date.now();
}

function PredictionsAdmin() {
  const [rows, setRows] = useState<PredictionRow[]>([]);
  const [profilesByUid, setProfilesByUid] = useState<Record<string, { displayName: string; avatarId: string }>>({});
  const [resultsByMatch, setResultsByMatch] = useState<Record<string, { home: number; away: number; finishedAt?: number; winner?: string; isKnockout?: boolean }>>({});
  const [busy, setBusy] = useState(false);
  const [userModal, setUserModal] = useState<string | null>(null);

  /* "🆕 ניחושים חדשים" badge — predictions a real user filled in (not
   * auto-generated) since the admin last acknowledged this section. */
  const [predSeenAt, setPredSeenAt] = useState<number>(() => readSeenAt(PREDICTIONS_SEEN_KEY));

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
        const m = MATCHES.find(x => x.id === p.matchId);
        const sc = scorePrediction({
          predictedHome: p.homeScore, predictedAway: p.awayScore,
          actualHome: r.home, actualAway: r.away,
          predictedWinner: p.predictedWinner ?? null,
          actualWinner: r.winner ?? null,
          isKnockout: r.isKnockout ?? (m ? m.stage !== "GROUP" : false),
        });
        e.points += sc.points;
        if (sc.exact) e.exact++;
      }
      t[p.uid] = e;
    }
    return t;
  }, [filtered, resultsByMatch]);

  /* New (manually-filled) predictions since the admin last acknowledged
   * this section — grouped by user for the badge. */
  const newPredsByUid = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of rows) {
      if (p.auto) continue; // not a real "user filled it in" event
      if (!p.updatedAt || p.updatedAt <= predSeenAt) continue;
      m.set(p.uid, (m.get(p.uid) || 0) + 1);
    }
    return m;
  }, [rows, predSeenAt]);
  const newPredsTotal = useMemo(() => Array.from(newPredsByUid.values()).reduce((a, b) => a + b, 0), [newPredsByUid]);

  function ackNewPredictions() {
    const now = Date.now();
    if (typeof window !== "undefined") window.localStorage.setItem(PREDICTIONS_SEEN_KEY, String(now));
    setPredSeenAt(now);
  }

  return (
    <div className="adm-body">
      {newPredsTotal > 0 && (
        <div className="admin-new-badge">
          <span>🆕 <strong>{newPredsTotal}</strong> ניחושים חדשים מילאו {newPredsByUid.size} משתמשים: {
            Array.from(newPredsByUid.entries())
              .map(([uid, count]) => `${profilesByUid[uid]?.displayName || uid.slice(0, 8)} (${count})`)
              .join(", ")
          }</span>
          <button className="btn btn-small" onClick={ackNewPredictions}>✓ סמן כנקרא</button>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        💡 כל הניחושים של כל המשתמשים מוצגים. השתמש בפילטרים כדי לצמצם תצוגה.
        בעמודה "נקודות" — חישוב לפי תוצאות שכבר קיימות (משחקים שלא הסתיימו = 0).
        לחץ על שם משתמש כדי לראות את כל הניחושים שלו — גם משחקים שהסתיימו (עם תוצאה ונקודות) וגם עתידיים.
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
                onUserClick={setUserModal}
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

      {userModal && (
        <UserPredictionDeepView
          uid={userModal}
          profile={profilesByUid[userModal]}
          rows={rows}
          resultsByMatch={resultsByMatch}
          onClose={() => setUserModal(null)}
        />
      )}
    </div>
  );
}

function PredictionRowEditor({ pred, profile, result, onPatch, onDelete, onUserClick }: any) {
  const [h, setH] = useState(pred.homeScore);
  const [a, setA] = useState(pred.awayScore);
  const [editing, setEditing] = useState(false);
  const match = MATCHES.find(m => m.id === pred.matchId);
  const stageName = match ? (match.stage === "GROUP" ? `בית ${match.group || ""}` : ({GROUP:"בתים",R32:"32",R16:"16",QF:"רבע",SF:"חצי",THIRD:"3-4",FINAL:"גמר"} as any)[match.stage] || match.stage) : "—";

  let points = "—";
  let pointsColor = "";
  if (result) {
    const sc = scorePrediction({
      predictedHome: pred.homeScore, predictedAway: pred.awayScore,
      actualHome: result.home, actualAway: result.away,
      predictedWinner: pred.predictedWinner ?? null,
      actualWinner: result.winner ?? null,
      isKnockout: result.isKnockout ?? (match ? match.stage !== "GROUP" : false),
    });
    points = String(sc.points);
    pointsColor = sc.points >= 8 ? "#22c55e" : sc.points >= 7 ? "#22c55e" : sc.points > 0 ? "var(--accent)" : "var(--red)";
  }

  return (
    <tr>
      <td>
        <button
          className="btn-link"
          onClick={() => onUserClick?.(pred.uid)}
          title="הצג את 4 המשחקים הקרובים של המשתמש"
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
        >
          <strong style={{ fontSize: 13 }}>{profile?.displayName || "—"}</strong>
        </button>
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

/* User "deep view" — opened by clicking a username in the predictions
 * table. Shows the 4 nearest upcoming matches and, for each, whether the
 * user filled it in themselves, whether it was auto-filled by the system
 * (because they didn't), or whether it's still empty. */
function UserPredictionDeepView({ uid, profile, rows, resultsByMatch, onClose }: {
  uid: string;
  profile?: { displayName: string };
  rows: PredictionRow[];
  resultsByMatch: Record<string, { home: number; away: number; finishedAt?: number; winner?: string; isKnockout?: boolean }>;
  onClose: () => void;
}) {
  const { finished, upcoming, totals } = useMemo(() => {
    const userPreds = rows.filter(r => r.uid === uid);
    const predByMatch = new Map(userPreds.map(p => [p.matchId, p]));

    const sorted = [...MATCHES].sort((a, b) => +new Date(a.utc) - +new Date(b.utc));
    const finishedList: Array<{ m: typeof MATCHES[number]; p?: PredictionRow; r: { home: number; away: number }; sc: ReturnType<typeof scorePrediction> | null }> = [];
    const upcomingList: Array<{ m: typeof MATCHES[number]; p?: PredictionRow }> = [];

    for (const m of sorted) {
      const p = predByMatch.get(m.id);
      const r = resultsByMatch[m.id];
      if (r) {
        const isKO = m.stage !== "GROUP";
        const sc = p ? scorePrediction({
          predictedHome: p.homeScore, predictedAway: p.awayScore,
          actualHome: r.home, actualAway: r.away,
          predictedWinner: p.predictedWinner ?? null,
          actualWinner: r.winner ?? null,
          isKnockout: isKO,
        }) : null;
        finishedList.push({ m, p, r, sc });
      } else {
        upcomingList.push({ m, p });
      }
    }
    finishedList.reverse(); // most recent first

    /* Accurate totals (incl. streak bonus), same engine as the leaderboard. */
    const predsForTotals = userPreds.map(p => ({
      matchId: p.matchId, homeScore: p.homeScore, awayScore: p.awayScore,
      predictedWinner: p.predictedWinner,
    }));
    const resultsForTotals: Record<string, any> = {};
    for (const [id, r] of Object.entries(resultsByMatch)) {
      const m = MATCHES.find(x => x.id === id);
      resultsForTotals[id] = { ...r, finishedAt: r.finishedAt || 0, isKnockout: r.isKnockout ?? (m ? m.stage !== "GROUP" : false) };
    }
    const totals = userTotals(predsForTotals, resultsForTotals);

    return { finished: finishedList, upcoming: upcomingList, totals };
  }, [rows, uid, resultsByMatch]);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" style={{ maxWidth: 680 }}>
        <button className="modal-close" onClick={onClose} aria-label="סגור">✕</button>
        <header className="modal-header">
          <h2>🔍 {profile?.displayName || uid.slice(0, 10)}</h2>
          <div className="muted">
            סה״כ <strong>{totals.totalPoints}</strong> נק׳ · 🎯 {totals.exactCount} מדויקים · ✅ {totals.resultCount}/{totals.predictionsCount} ניחושים · 🔥 סטריק {totals.streak}
          </div>
        </header>

        <h3 style={{ marginTop: 14, fontSize: 14 }}>✅ משחקים שהסתיימו ({finished.length})</h3>
        {finished.length === 0 ? (
          <p className="muted" style={{ marginTop: 6 }}>אין עדיין משחקים שהסתיימו.</p>
        ) : (
          <div className="adm-table-wrap" style={{ marginTop: 6, maxHeight: 260, overflowY: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>משחק</th>
                  <th>מועד</th>
                  <th>ניחוש</th>
                  <th>תוצאה</th>
                  <th>נק׳</th>
                </tr>
              </thead>
              <tbody>
                {finished.map(({ m, p, r, sc }) => (
                  <tr key={m.id}>
                    <td style={{ fontSize: 12 }}>
                      <span>{TEAMS[m.home]?.flag || ""} {TEAMS[m.home]?.name || m.home}</span>
                      <span className="muted"> נגד </span>
                      <span>{TEAMS[m.away]?.name || m.away} {TEAMS[m.away]?.flag || ""}</span>
                      <br />
                      <span className="muted" style={{ fontSize: 10 }}>{m.id} · {STAGES[m.stage]?.name || m.stage}</span>
                    </td>
                    <td style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                      {formatIsraelDate(m.utc, { short: true })} {formatIsraelTime(m.utc)}
                    </td>
                    <td>
                      {p
                        ? <span style={{ fontVariantNumeric: "tabular-nums" }}>{p.homeScore} : {p.awayScore}</span>
                        : <span className="muted">לא ניחש</span>}
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.home} : {r.away}</td>
                    <td>
                      {sc
                        ? <strong style={{ color: sc.points > 0 ? "var(--green)" : "var(--muted, #888)" }}>{sc.points}{sc.exact ? " 🎯" : ""}</strong>
                        : <span className="muted">0</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 style={{ marginTop: 14, fontSize: 14 }}>🔮 משחקים עתידיים / טרם הסתיימו ({upcoming.length})</h3>
        {upcoming.length === 0 ? (
          <p className="muted" style={{ marginTop: 6 }}>אין משחקים נוספים.</p>
        ) : (
          <div className="adm-table-wrap" style={{ marginTop: 6, maxHeight: 260, overflowY: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>משחק</th>
                  <th>מועד</th>
                  <th>ניחוש</th>
                  <th>מצב</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map(({ m, p }) => (
                  <tr key={m.id}>
                    <td style={{ fontSize: 12 }}>
                      <span>{TEAMS[m.home]?.flag || ""} {TEAMS[m.home]?.name || m.home}</span>
                      <span className="muted"> נגד </span>
                      <span>{TEAMS[m.away]?.name || m.away} {TEAMS[m.away]?.flag || ""}</span>
                      <br />
                      <span className="muted" style={{ fontSize: 10 }}>{m.id} · {STAGES[m.stage]?.name || m.stage}</span>
                    </td>
                    <td style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                      {formatIsraelDate(m.utc, { short: true })} {formatIsraelTime(m.utc)}
                    </td>
                    <td>
                      {p
                        ? <strong style={{ fontVariantNumeric: "tabular-nums" }}>{p.homeScore} : {p.awayScore}</strong>
                        : <span className="muted">—</span>}
                    </td>
                    <td>
                      {!p ? (
                        <span className="badge badge-finished" style={{ background: "rgba(239,68,68,0.18)" }}>❌ לא מילא</span>
                      ) : p.auto ? (
                        <span className="badge badge-finished" style={{ background: "rgba(245,158,11,0.18)", color: "var(--orange)" }}>🤖 מולא אוטומטית</span>
                      ) : (
                        <span className="status-pill pill-open">✅ מילא ידנית</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mc-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ 4. GROUPS ============================ */
function GroupsAdmin() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [deleted, setDeleted] = useState<DeletedGroupRow[]>([]);
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const [r, rd] = await Promise.all([
        fetch("/api/admin/groups", { headers: await adminAuthHeaders() }),
        fetch("/api/admin/groups/deleted", { headers: await adminAuthHeaders() }),
      ]);
      if (r.ok) setGroups(await r.json());
      if (rd.ok) setDeleted(await rd.json());
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
  async function nuke(id: string, memberCount: number) {
    const warn = memberCount > 0
      ? `הקבוצה הזו כוללת ${memberCount} חברים. למחוק אותה לצמיתות בכל זאת?\n(ניתן לשחזר אותה במדויק מתוך "קבוצות שנמחקו" למטה אם צריך)`
      : "למחוק את הקבוצה לצמיתות? כל החברויות יוסרו.";
    if (!confirm(warn)) return;
    const r = await fetch("/api/admin/groups", { method: "DELETE", headers: await adminAuthHeaders(), body: JSON.stringify({ id }) });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "שגיאה במחיקה");
      return;
    }
    load();
  }
  async function restore(id: string) {
    if (!confirm("לשחזר את הקבוצה הזו בדיוק כפי שהייתה לפני המחיקה?")) return;
    const r = await fetch("/api/admin/groups/deleted", { method: "POST", headers: await adminAuthHeaders(), body: JSON.stringify({ id }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { alert(d.error || "שגיאה בשחזור"); return; }
    load();
  }
  async function purge(id: string) {
    if (!confirm("למחוק את הגיבוי הזה לצמיתות? לא ניתן יהיה לשחזר אותו לאחר מכן.")) return;
    await fetch("/api/admin/groups/deleted", { method: "DELETE", headers: await adminAuthHeaders(), body: JSON.stringify({ id }) });
    load();
  }

  return (
    <div className="adm-body">
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        💡 לחץ <strong>✏️ ערוך</strong> כדי לשנות את שם הקבוצה, התיאור, או קוד ההזמנה. מחיקה אפשרית גם לקבוצות עם חברים — תמיד נשמר גיבוי לשחזור.
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

      <h4 style={{ marginTop: 20, marginBottom: 8 }}>🗑️ קבוצות שנמחקו — שחזור</h4>
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        קבוצות שנמחקו על ידי אדמין נשמרות כאן בדיוק כפי שהיו (כולל כל החברויות). אפשר לשחזר אותן במלואן.
      </p>
      <div className="adm-table-wrap" style={{ maxHeight: 360, overflowY: "auto" }}>
        <table className="admin-table">
          <thead><tr><th>שם / תיאור</th><th>קוד הזמנה</th><th>חברים</th><th>נמחקה</th><th>פעולות</th></tr></thead>
          <tbody>
            {deleted.map(d => (
              <tr key={d.id}>
                <td>
                  <strong>{d.group?.name || "(ללא שם)"}</strong>
                  {d.group?.description && <><br /><span className="muted" style={{ fontSize: 11 }}>{d.group.description}</span></>}
                </td>
                <td><code className="invite-code">{d.group?.inviteCode || "—"}</code></td>
                <td>{d.memberships?.length ?? d.group?.memberCount ?? 0}</td>
                <td className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                  {formatIsraelDate(new Date(d.deletedAt).toISOString(), { short: true })} {formatIsraelTime(new Date(d.deletedAt).toISOString())}
                  {d.deletedBy && <><br />ע"י {d.deletedBy}</>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-small btn-primary" onClick={() => restore(d.id)}>↩️ שחזר</button>
                  <button className="btn btn-small" onClick={() => purge(d.id)} style={{ color: "var(--red)", marginInlineStart: 4 }}>מחק לצמיתות</button>
                </td>
              </tr>
            ))}
            {!deleted.length && !busy && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>אין קבוצות מחוקות.</td></tr>}
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
        <button className="btn btn-small" onClick={() => onDelete(g.id, g.members?.length || 0)} style={{ color: "var(--red)", marginInlineStart: 4 }}>🗑️ מחק</button>
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

/* ============================ 7b. FULL SITE BACKUP ============================ */
const FULL_BACKUP_COLLECTIONS = [
  "profiles", "managed_users", "username_lookup", "predictions", "predictions_backup",
  "match_results", "match_results_history", "groups", "group_memberships", "deleted_groups",
  "joker_usage", "broadcast_overrides", "sim_config", "activity", "roasts", "bonus_awards",
  "leaderboard_snapshots", "live_data", "stats", "user_favorites",
];

interface FullBackupSummary {
  dateKey: string;
  exportedAt: number;
  exportedBy: string | null;
  version: number;
  counts: Record<string, number>;
  chunkCounts: Record<string, number>;
}

function FullBackupAdmin() {
  const [list, setList] = useState<FullBackupSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [restoreColl, setRestoreColl] = useState<Record<string, string>>({});
  const [restoreExact, setRestoreExact] = useState<Record<string, boolean>>({});
  const [restoreBusy, setRestoreBusy] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<Record<string, string>>({});

  async function load() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/backups", { headers: await adminAuthHeaders() });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "שגיאה בטעינת רשימת הגיבויים");
        return;
      }
      setList(await r.json());
    } catch (e: any) {
      setError(e.message || "שגיאה");
    } finally { setBusy(false); }
  }

  useEffect(() => { load(); }, []);

  async function runNow() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/cron/daily-backup", { method: "POST", headers: await adminAuthHeaders() });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "שגיאה בביצוע הגיבוי");
        return;
      }
      await load();
    } catch (e: any) {
      setError(e.message || "שגיאה");
    } finally { setBusy(false); }
  }

  async function downloadDate(dateKey: string) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/admin/backups/${dateKey}`, { headers: await adminAuthHeaders() });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "שגיאה בהורדה");
        return;
      }
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mondial-2026-full-backup-${dateKey}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e: any) {
      setError(e.message || "שגיאה");
    } finally { setBusy(false); }
  }

  async function restore(dateKey: string) {
    const coll = restoreColl[dateKey] || FULL_BACKUP_COLLECTIONS[0];
    const exact = !!restoreExact[dateKey];
    const warn = exact
      ? `לשחזר את "${coll}" מהגיבוי מתאריך ${dateKey}?\n\n⚠️ שחזור מדויק: כל רשומה ב-${coll} שלא הייתה קיימת בגיבוי הזה — תימחק לצמיתות!\n\n(המצב הנוכחי יישמר אוטומטית כגיבוי-לפני-שחזור, אך מומלץ לוודא שזה באמת מה שרוצים.)`
      : `לשחזר את "${coll}" מהגיבוי מתאריך ${dateKey}?\n\nרשומות שקיימות כרגע ולא היו בגיבוי הזה יישארו ללא שינוי.`;
    if (!confirm(warn)) return;

    setRestoreBusy(dateKey);
    setRestoreMsg(m => ({ ...m, [dateKey]: "" }));
    try {
      const r = await fetch("/api/admin/backups/restore", {
        method: "POST", headers: await adminAuthHeaders(),
        body: JSON.stringify({ dateKey, collection: coll, exact }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRestoreMsg(m => ({ ...m, [dateKey]: `⚠ ${d.error || "שגיאה בשחזור"}` }));
        return;
      }
      setRestoreMsg(m => ({
        ...m,
        [dateKey]: `✓ שוחזרו ${d.restored ?? 0} רשומות ב-${coll}${d.deleted ? `, נמחקו ${d.deleted}` : ""}`,
      }));
    } catch (e: any) {
      setRestoreMsg(m => ({ ...m, [dateKey]: `⚠ ${e.message || "שגיאה"}` }));
    } finally {
      setRestoreBusy(null);
    }
  }

  return (
    <div className="adm-body">
      <p className="muted" style={{ marginBottom: 10, fontSize: 13, lineHeight: 1.6 }}>
        גיבוי יומי אוטומטי (כל לילה ב-01:00) של <strong>כל הנתונים</strong> באתר —
        משתמשים, ניחושים, תוצאות, קבוצות חברים, סימולציה, פעילות ועוד —
        נשמר ישירות ב-Firestore ונשמר 21 יום אחורה.
        אפשר להוריד כל גיבוי כקובץ JSON, או לשחזר קולקציה ספציפית מתאריך מסוים
        אם נמחק או נפגם משהו בטעות.
      </p>

      <div className="mc-actions">
        <button className="btn btn-primary" onClick={runNow} disabled={busy}>
          {busy ? "…מבצע" : "🔄 גיבוי עכשיו"}
        </button>
        <button className="btn btn-small" onClick={load} disabled={busy}>↻ רענן רשימה</button>
      </div>

      {error && <p className="pred-msg is-locked" style={{ marginTop: 10 }}>⚠ {error}</p>}

      {list && list.length === 0 && (
        <p className="muted" style={{ marginTop: 10 }}>אין עדיין גיבויים שמורים.</p>
      )}

      {list && list.map(b => (
        <div
          key={b.dateKey}
          style={{ marginTop: 10, padding: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <div>
              <strong>{b.dateKey}</strong>
              <span className="muted" style={{ fontSize: 12, marginInlineStart: 8 }}>
                {new Date(b.exportedAt).toLocaleString("he-IL")} · {b.exportedBy || "—"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-small" onClick={() => downloadDate(b.dateKey)} disabled={busy}>⬇️ JSON</button>
              <button className="btn btn-small" onClick={() => setOpenDate(openDate === b.dateKey ? null : b.dateKey)}>
                {openDate === b.dateKey ? "סגור" : "פרטים ושחזור"}
              </button>
            </div>
          </div>

          {openDate === b.dateKey && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div
                style={{
                  fontFamily: "monospace", fontSize: 12, marginBottom: 10,
                  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 4,
                }}
              >
                {FULL_BACKUP_COLLECTIONS.map(coll => (
                  <div key={coll}>{coll}: {b.counts?.[coll] ?? 0}</div>
                ))}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <span className="muted" style={{ fontSize: 13 }}>♻️ שחזר קולקציה:</span>
                <select
                  value={restoreColl[b.dateKey] || FULL_BACKUP_COLLECTIONS[0]}
                  onChange={e => setRestoreColl(m => ({ ...m, [b.dateKey]: e.target.value }))}
                  style={{ padding: "2px 4px" }}
                >
                  {FULL_BACKUP_COLLECTIONS.map(coll => (
                    <option key={coll} value={coll}>{coll} ({b.counts?.[coll] ?? 0})</option>
                  ))}
                </select>
                <label className="muted" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={!!restoreExact[b.dateKey]}
                    onChange={e => setRestoreExact(m => ({ ...m, [b.dateKey]: e.target.checked }))}
                  />
                  שחזור מדויק (מוחק רשומות שלא היו בגיבוי)
                </label>
                <button
                  className="btn btn-small"
                  style={{ color: "var(--red)" }}
                  onClick={() => restore(b.dateKey)}
                  disabled={restoreBusy === b.dateKey}
                >
                  {restoreBusy === b.dateKey ? "…משחזר" : "♻️ שחזר"}
                </button>
              </div>
              {restoreMsg[b.dateKey] && (
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{restoreMsg[b.dateKey]}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ============================ 8. LEADERBOARD SNAPSHOTS ============================ */
interface SnapshotSummary {
  dateKey: string;
  savedAt: number;
  triggeredBy: string;
  totals?: { users: number; groups: number; finishedMatches: number };
  topThree?: Array<{ rank: number; displayName: string; totalPoints: number }>;
}

function LeaderboardSnapshots() {
  const [list, setList] = useState<SnapshotSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<any>(null);

  async function load() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/leaderboard-snapshots", { headers: await adminAuthHeaders() });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "שגיאה בטעינה");
        return;
      }
      setList(await r.json());
    } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function snapshotNow() {
    if (!confirm("ליצור snapshot של לוח התוצאות עכשיו? אם כבר קיים גיבוי להיום — הוא יידרס.")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/cron/snapshot-leaderboard", {
        method: "POST",
        headers: await adminAuthHeaders(),
      });
      const data = await r.json();
      if (!r.ok) { alert(`שגיאה: ${data.error || data.message || r.status}`); return; }
      alert(`✓ נשמר snapshot לתאריך ${data.dateKey}\nמשתמשים: ${data.totals?.users || 0}\nקבוצות: ${data.totals?.groups || 0}`);
      load();
    } finally { setBusy(false); }
  }

  async function viewSnapshot(dateKey: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/leaderboard-snapshots?date=${dateKey}`, { headers: await adminAuthHeaders() });
      if (!r.ok) { alert("שגיאה בטעינת הגיבוי"); return; }
      setViewing(await r.json());
    } finally { setBusy(false); }
  }

  async function downloadSnapshot(dateKey: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/leaderboard-snapshots?date=${dateKey}`, { headers: await adminAuthHeaders() });
      if (!r.ok) { alert("שגיאה"); return; }
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leaderboard-${dateKey}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } finally { setBusy(false); }
  }

  async function deleteSnapshot(dateKey: string) {
    if (!confirm(`למחוק את הגיבוי של ${dateKey}? פעולה זו בלתי הפיכה.`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/leaderboard-snapshots", {
        method: "DELETE",
        headers: await adminAuthHeaders(),
        body: JSON.stringify({ dateKey }),
      });
      if (!r.ok) { alert("שגיאה במחיקה"); return; }
      load();
    } finally { setBusy(false); }
  }

  return (
    <div className="adm-body">
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 10 }}>
        🗓️ הגיבוי היומי <strong>רץ אוטומטית כל יום בחצות (שעון ישראל)</strong> ושומר את לוח התוצאות הגלובלי וזה של כל קבוצה.
        הקבצים נשמרים באוסף <code>leaderboard_snapshots</code> ב‑Firestore.
      </p>

      <div className="mc-actions" style={{ marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={snapshotNow} disabled={busy}>
          📸 צלם snapshot עכשיו
        </button>
        <button className="btn" onClick={load} disabled={busy}>
          ↻ רענן רשימה
        </button>
      </div>

      {error && <p className="pred-msg is-locked">{error}</p>}

      <div className="adm-table-wrap" style={{ maxHeight: 480, overflowY: "auto" }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>תאריך</th>
              <th>נשמר ב</th>
              <th>נוצר ע"י</th>
              <th>סיכום</th>
              <th>מובילים (טופ 3)</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && !busy && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>
                עדיין אין snapshots. ה‑cron ירוץ אוטומטית בחצות הקרובה, או לחץ "📸 צלם עכשיו".
              </td></tr>
            )}
            {list.map(s => (
              <tr key={s.dateKey}>
                <td><strong>{s.dateKey}</strong></td>
                <td className="muted" style={{ fontSize: 11 }}>
                  {new Date(s.savedAt).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="muted" style={{ fontSize: 11 }}>
                  {s.triggeredBy === "cron"
                    ? <span className="chip chip-soft">⏰ cron</span>
                    : <span className="chip">{s.triggeredBy?.replace("admin:", "👤 ")}</span>}
                </td>
                <td style={{ fontSize: 12 }}>
                  👥 {s.totals?.users ?? 0} · 🏆 {s.totals?.groups ?? 0} · ⚽ {s.totals?.finishedMatches ?? 0}
                </td>
                <td style={{ fontSize: 11 }}>
                  {(s.topThree || []).map(t => (
                    <div key={t.rank}>
                      {t.rank === 1 ? "🥇" : t.rank === 2 ? "🥈" : "🥉"} {t.displayName} ({t.totalPoints})
                    </div>
                  ))}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-small btn-primary" onClick={() => viewSnapshot(s.dateKey)} disabled={busy} title="צפה">👁️</button>
                  <button className="btn btn-small" onClick={() => downloadSnapshot(s.dateKey)} disabled={busy} title="הורד JSON" style={{ marginInlineStart: 4 }}>⬇️</button>
                  <button className="btn btn-small" onClick={() => deleteSnapshot(s.dateKey)} disabled={busy} title="מחק" style={{ color: "var(--red)", marginInlineStart: 4 }}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setViewing(null)}>
          <div className="modal" role="dialog" style={{ maxWidth: 720 }}>
            <button className="modal-close" onClick={() => setViewing(null)}>✕</button>
            <header className="modal-header">
              <h2>📅 לוח תוצאות — {viewing.dateKey}</h2>
              <div className="muted">{new Date(viewing.savedAt).toLocaleString("he-IL")}</div>
            </header>
            <h3 className="sec-title" style={{ marginTop: 16, fontSize: 14 }}>🌍 גלובלי</h3>
            <div style={{ maxHeight: 260, overflowY: "auto", marginTop: 8 }}>
              {(viewing.global || []).map((r: any) => (
                <div key={r.uid} style={{
                  display: "grid", gridTemplateColumns: "40px 1fr auto",
                  gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--border-soft)",
                  fontSize: 13,
                }}>
                  <span style={{ fontWeight: 700, color: "var(--accent)" }}>#{r.rank}</span>
                  <span>{r.displayName}</span>
                  <span style={{ fontWeight: 700 }}>{r.totalPoints} נק׳</span>
                </div>
              ))}
            </div>
            {Object.entries(viewing.groups || {}).map(([gid, g]: any) => (
              <details key={gid} style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>👥 {g.name}</summary>
                <div style={{ maxHeight: 200, overflowY: "auto", marginTop: 6 }}>
                  {(g.rows || []).map((r: any) => (
                    <div key={r.uid} style={{
                      display: "grid", gridTemplateColumns: "40px 1fr auto",
                      gap: 8, padding: "5px 10px", borderBottom: "1px solid var(--border-soft)",
                      fontSize: 12,
                    }}>
                      <span style={{ color: "var(--accent)" }}>#{r.rank}</span>
                      <span>{r.displayName}</span>
                      <span>{r.totalPoints}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
            <div className="mc-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => downloadSnapshot(viewing.dateKey)}>⬇️ הורד JSON</button>
              <button className="btn" onClick={() => setViewing(null)}>סגור</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ 9. LIVE SYNC ============================ */
function LiveSyncPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [counts, setCounts] = useState<{ sim: number; admin: number; live: number; total: number } | null>(null);

  async function loadCounts() {
    try {
      const r = await fetch("/api/match-results");
      if (!r.ok) return;
      const data = await r.json();
      let sim = 0, admin = 0, live = 0;
      Object.values(data).forEach((x: any) => {
        if (x.source === "live") live++;
        else if (x.source === "admin" || x.setByAdmin) admin++;
        else if (x.sim) sim++;
        else admin++;
      });
      setCounts({ sim, admin, live, total: Object.keys(data).length });
    } catch {}
  }
  useEffect(() => { loadCounts(); }, []);

  async function syncNow() {
    setBusy(true); setResult(null);
    try {
      const r = await fetch("/api/cron/sync-results");
      const data = await r.json();
      setResult(data);
      loadCounts();
    } catch (e: any) {
      setResult({ error: e?.message || String(e) });
    } finally { setBusy(false); }
  }

  return (
    <div className="adm-body">
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 10 }}>
        🌐 <strong>סנכרון תוצאות חי מ‑API חיצוני.</strong> כשהמונדיאל יתחיל,
        תוצאות אמיתיות יישלפו אוטומטית כל חצי שעה ויעדכנו את הטבלאות והדירוגים.
      </p>

      {counts && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 8, marginBottom: 14,
        }}>
          <div style={{ padding: 10, background: "rgba(34,197,94,0.10)", borderRadius: 8, textAlign: "center", border: "1px solid rgba(34,197,94,0.4)" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#22c55e" }}>{counts.live}</div>
            <div className="muted" style={{ fontSize: 11 }}>🔴 LIVE (אוטומטי)</div>
          </div>
          <div style={{ padding: 10, background: "rgba(0,212,255,0.08)", borderRadius: 8, textAlign: "center", border: "1px solid var(--accent)" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--accent)" }}>{counts.admin}</div>
            <div className="muted" style={{ fontSize: 11 }}>✓ Admin (ידני)</div>
          </div>
          <div style={{ padding: 10, background: "rgba(167,139,250,0.10)", borderRadius: 8, textAlign: "center", border: "1px solid rgba(167,139,250,0.4)" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--purple)" }}>{counts.sim}</div>
            <div className="muted" style={{ fontSize: 11 }}>🧪 Sim</div>
          </div>
          <div style={{ padding: 10, background: "var(--bg-elev)", borderRadius: 8, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{counts.total}</div>
            <div className="muted" style={{ fontSize: 11 }}>סה"כ</div>
          </div>
        </div>
      )}

      <div className="mc-actions">
        <button className="btn btn-primary" onClick={syncNow} disabled={busy}>
          {busy ? "…מסנכרן" : "🔄 סנכרן עכשיו"}
        </button>
        <button className="btn" onClick={loadCounts} disabled={busy}>↻ רענן ספירה</button>
      </div>

      {result && (
        <div style={{
          marginTop: 12, padding: 10,
          background: result.error ? "rgba(239,68,68,0.10)" : result.skipped ? "rgba(245,158,11,0.10)" : "rgba(34,197,94,0.10)",
          border: `1px solid ${result.error ? "rgba(239,68,68,0.4)" : result.skipped ? "rgba(245,158,11,0.4)" : "rgba(34,197,94,0.4)"}`,
          borderRadius: 8, fontSize: 12, lineHeight: 1.6,
        }}>
          {result.error
            ? <div>❌ <strong>שגיאה:</strong> {result.error} {result.message ? `· ${result.message}` : ""}</div>
            : result.skipped
              ? <div>⏸ <strong>דולג:</strong> {result.skipped}<br/>{result.docs && <em style={{ fontSize: 11 }}>{result.docs}</em>}</div>
              : <div>
                  ✓ <strong>סנכרון הושלם:</strong>
                  <div style={{ marginTop: 4 }}>חדשים: {result.inserted || 0} · עודכנו: {result.updated || 0} · דולגו: {result.skipped || 0}</div>
                </div>}
        </div>
      )}

      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
          🔧 איך מפעילים סנכרון חי?
        </summary>
        <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.8, padding: 10, background: "var(--bg-elev)", borderRadius: 8 }}>
          <p style={{ margin: "0 0 8px" }}>
            <strong>1.</strong> הירשם לחשבון חינמי ב‑<a href="https://www.football-data.org" target="_blank" rel="noopener" style={{ color: "var(--accent)" }}>football-data.org</a> (או ספק דומה).
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong>2.</strong> ב‑Vercel Dashboard → Settings → Environment Variables, הוסף:
            <br/><code style={{ background: "var(--bg-card)", padding: "2px 6px", borderRadius: 4 }}>FOOTBALL_API_KEY=<em>your_key</em></code>
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong>3.</strong> Redeploy. מעכשיו ה‑cron ירוץ אוטומטית כל 30 דקות וימשוך תוצאות אמיתיות.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong>4.</strong> תוצאות חיות נשמרות עם <code>source: "live"</code> ולא ידרסו על‑ידי איפוס סימולציה.
          </p>
          <p style={{ margin: 0 }}>
            <strong>📌 לפני המונדיאל:</strong> לחץ "🔄 אפס סימולציה" בלשונית 🧪 ניהול סימולציה
            כדי לנקות תוצאות בדיקה (sim:true). תוצאות חיות חדשות יחליפו אותן אוטומטית.
          </p>
        </div>
      </details>
    </div>
  );
}

/* ============================ 10. BONUS AWARDS ============================ */
interface BonusAward {
  id: string;
  uid: string;
  points: number;
  reason: string;
  awardedBy: string;
  awardedAt: number;
}
interface ProfileLite {
  uid: string;
  displayName?: string;
  email?: string;
  avatarId?: string;
}

function BonusAwardsPanel() {
  const [awards, setAwards] = useState<BonusAward[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Form state */
  const [pickUid, setPickUid] = useState<string>("");
  const [pointsInput, setPointsInput] = useState<string>("");
  const [reasonInput, setReasonInput] = useState<string>("");

  async function load() {
    setBusy(true); setError(null);
    try {
      const [aR, pR] = await Promise.all([
        fetch("/api/admin/bonus-awards", { headers: await adminAuthHeaders() }),
        fetch("/api/admin/profiles",     { headers: await adminAuthHeaders() }),
      ]);
      if (aR.ok) setAwards(await aR.json());
      if (pR.ok) {
        const arr = await pR.json();
        const m: Record<string, ProfileLite> = {};
        for (const p of arr) m[p.uid] = { uid: p.uid, displayName: p.displayName, email: p.email, avatarId: p.avatarId };
        setProfiles(m);
      }
    } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function addAward() {
    if (!pickUid) { alert("בחר משתמש"); return; }
    const points = parseInt(pointsInput, 10);
    if (!Number.isFinite(points) || points === 0) { alert("הזן ערך נקודות (חיובי או שלילי, לא 0)"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/bonus-awards", {
        method: "POST",
        headers: await adminAuthHeaders(),
        body: JSON.stringify({ uid: pickUid, points, reason: reasonInput.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { alert(`שגיאה: ${data.error || r.status}`); return; }
      const profName = profiles[pickUid]?.displayName || "משתמש";
      alert(`✓ ${points > 0 ? "הוספו" : "נוכו"} ${Math.abs(points)} נק׳ ל${profName}`);
      setPickUid(""); setPointsInput(""); setReasonInput("");
      load();
    } finally { setBusy(false); }
  }

  async function deleteAward(id: string) {
    if (!confirm("למחוק את הבונוס הזה?")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/bonus-awards", {
        method: "DELETE",
        headers: await adminAuthHeaders(),
        body: JSON.stringify({ id }),
      });
      if (!r.ok) { alert("שגיאה"); return; }
      load();
    } finally { setBusy(false); }
  }

  /* Totals per user */
  const totalsByUid: Record<string, number> = {};
  for (const a of awards) totalsByUid[a.uid] = (totalsByUid[a.uid] || 0) + a.points;

  return (
    <div className="adm-body">
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>
        💡 הוסף או הפחת נקודות ידנית למשתמשים. הבונוסים נוספים <strong>גלובלית</strong> לכל הלוחות (כי הניקוד גלובלי לכל משתמש).
        ערכים שליליים מנכים נקודות. כל בונוס נשמר עם הסיבה ומי הוסיף — אפשר למחוק בכל רגע.
      </p>

      {/* Add form */}
      <div style={{
        padding: 14,
        background: "rgba(0,212,255,0.06)",
        border: "1px solid var(--accent)",
        borderRadius: 12,
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>➕ הוספת בונוס חדש</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 100px 2fr auto", gap: 8, alignItems: "end" }}>
          <label>
            <div style={{ fontSize: 11, marginBottom: 4 }}>משתמש</div>
            <select value={pickUid} onChange={e => setPickUid(e.target.value)} disabled={busy}
                    style={{ width: "100%", padding: 7, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }}>
              <option value="">— בחר משתמש —</option>
              {Object.values(profiles)
                .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "", "he"))
                .map(p => (
                  <option key={p.uid} value={p.uid}>{p.displayName || p.email || p.uid.slice(0, 10)}</option>
                ))}
            </select>
          </label>
          <label>
            <div style={{ fontSize: 11, marginBottom: 4 }}>נקודות (± )</div>
            <input type="number" value={pointsInput} onChange={e => setPointsInput(e.target.value)}
                   disabled={busy} placeholder="10 / -5"
                   style={{ width: "100%", padding: 7, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontVariantNumeric: "tabular-nums" }} />
          </label>
          <label>
            <div style={{ fontSize: 11, marginBottom: 4 }}>סיבה (אופציונלי)</div>
            <input type="text" value={reasonInput} onChange={e => setReasonInput(e.target.value)}
                   disabled={busy} placeholder="לדוגמה: ניחוש מצוין בגמר"
                   maxLength={240}
                   style={{ width: "100%", padding: 7, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }} />
          </label>
          <button className="btn btn-primary" onClick={addAward}
                  disabled={busy || !pickUid || !pointsInput}>
            💾 הוסף
          </button>
        </div>
      </div>

      {/* Totals per user (top of list) */}
      {Object.keys(totalsByUid).length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>📊 סיכום נקודות פר משתמש:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(totalsByUid).map(([uid, total]) => {
              const p = profiles[uid];
              return (
                <span key={uid} className="chip" style={{
                  background: total > 0 ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)",
                  color: total > 0 ? "#22c55e" : "#ef4444",
                  borderColor: total > 0 ? "#22c55e" : "#ef4444",
                }}>
                  {p?.displayName || uid.slice(0, 10)}: {total > 0 ? "+" : ""}{total}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="pred-msg is-locked">{error}</p>}

      {/* Awards table */}
      <div className="adm-table-wrap" style={{ maxHeight: 420, overflowY: "auto" }}>
        <table className="admin-table">
          <thead><tr>
            <th>תאריך</th><th>משתמש</th><th>נקודות</th><th>סיבה</th><th>הוסף ע"י</th><th>פעולה</th>
          </tr></thead>
          <tbody>
            {awards.length === 0 && !busy && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>
                אין עדיין בונוסים. השתמש בטופס למעלה כדי להוסיף.
              </td></tr>
            )}
            {awards.map(a => {
              const p = profiles[a.uid];
              return (
                <tr key={a.id}>
                  <td className="muted" style={{ fontSize: 11 }}>
                    {new Date(a.awardedAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td>{p?.displayName || a.uid.slice(0, 10) + "…"}</td>
                  <td>
                    <span style={{
                      fontWeight: 800,
                      fontSize: 14,
                      color: a.points > 0 ? "#22c55e" : "#ef4444",
                    }}>
                      {a.points > 0 ? `+${a.points}` : a.points}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{a.reason || <span className="muted">—</span>}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{a.awardedBy}</td>
                  <td>
                    <button className="btn btn-small" onClick={() => deleteAward(a.id)}
                            disabled={busy}
                            style={{ color: "var(--red)" }}>🗑️</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================ FIFA PULL ============================ */
function FifaPullPanel() {
  const [standings, setStandings] = useState<any[]>([]);
  const [scorers, setScorers] = useState<any[]>([]);
  const [assists, setAssists] = useState<any[]>([]);
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [busy, setBusy] = useState<Record<string,boolean>>({});
  const [errors, setErrors] = useState<Record<string,string>>({});

  const FIFA_URLS: Record<string, string> = {
    standings: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/standings",
    scorers:   "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/statistics/player-statistics",
    assists:   "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/statistics/player-statistics",
    fixtures:  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures?country=IL&wtw-filter=ALL",
  };

  async function pull(type: "standings" | "scorers" | "assists" | "fixtures") {
    setBusy(b => ({ ...b, [type]: true }));
    setErrors(e => ({ ...e, [type]: "" }));
    try {
      const hdrs = await adminAuthHeaders();
      const res = await fetch(`/api/admin/fifa-pull?type=${type}`, { headers: hdrs });
      const json = await res.json();
      if (json.ok && json.rows?.length) {
        if (type === "standings") setStandings(json.rows);
        if (type === "scorers")   setScorers(json.rows);
        if (type === "assists")   setAssists(json.rows);
        if (type === "fixtures")  setFixtures(json.rows);
      } else {
        setErrors(e => ({ ...e, [type]: json.error || "שגיאה לא ידועה" }));
      }
    } catch (err: any) {
      setErrors(e => ({ ...e, [type]: err.message }));
    } finally {
      setBusy(b => ({ ...b, [type]: false }));
    }
  }

  const leftSections: { key: "standings"|"scorers"|"assists"|"fixtures"; label: string; data: any[] }[] = [
    { key: "standings", label: "🏆 טבלאות קבוצות", data: standings },
    { key: "scorers",   label: "⚽ מלך השערים",     data: scorers },
    { key: "assists",   label: "🎯 מלך הבישולים",   data: assists },
  ];

  function PullSection({ k, label, data }: { k: "standings"|"scorers"|"assists"|"fixtures"; label: string; data: any[] }) {
    return (
      <div style={{ marginBottom: 16, background: "var(--bg-elev)", borderRadius: 10, padding: 14, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <strong style={{ fontSize: 14 }}>{label}</strong>
          <button className="btn btn-small btn-primary" onClick={() => pull(k)} disabled={busy[k]}>
            {busy[k] ? "⏳ מושך..." : "↓ משוך"}
          </button>
          <a href={FIFA_URLS[k]} target="_blank" rel="noreferrer"
             style={{ fontSize: 11, color: "var(--accent)", marginInlineStart: "auto" }}>
            פתח ↗
          </a>
        </div>
        {errors[k] && (
          <div style={{ fontSize: 12, color: "var(--red)", background: "rgba(239,68,68,0.1)",
                        borderRadius: 6, padding: "8px 12px", marginBottom: 8 }}>
            ⚠️ {errors[k]}
          </div>
        )}
        {data.length > 0 && (
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all",
                          background: "var(--bg)", borderRadius: 6, padding: 10,
                          color: "var(--text-muted)", margin: 0 }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
        {data.length === 0 && !busy[k] && !errors[k] && (
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>לחץ על "משוך" כדי לטעון נתונים.</p>
        )}
      </div>
    );
  }

  return (
    <div className="adm-body">
      <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
        לחץ על כפתור המשיכה לכל קטגוריה. הנתונים מגיעים מ-FIFA.com — אם האתר מרונדר בדפדפן בלבד, תוצג הודעת שגיאה.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {/* Left column: standings, scorers, assists */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {leftSections.map(({ key, label, data }) => (
            <PullSection key={key} k={key} label={label} data={data} />
          ))}
        </div>
        {/* Right column: fixtures */}
        <PullSection k="fixtures" label="📅 לוח משחקים (IL)" data={fixtures} />
      </div>
    </div>
  );
}
