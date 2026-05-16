"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import { AvatarDisplay } from "./AvatarPicker";
import { shareToWhatsApp } from "@/lib/share";
import type { LeaderRow, ActivityEvent, Group } from "@/lib/types";

export default function GroupsTab() {
  const user = useStore(s => s.user);
  const groups = useStore(s => s.groups);
  const currentGroupId = useStore(s => s.currentGroupId);
  const setCurrentGroup = useStore(s => s.setCurrentGroup);
  const refreshGroups = useStore(s => s.refreshGroups);

  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { refreshGroups(); }, [refreshGroups]);

  async function loadGroupData(gid: string | null) {
    /* No global view — without a groupId we render nothing rather than
     * leaking cross-group data. */
    if (!gid) {
      setLeaderboard([]); setActivity([]); setLoading(false);
      return;
    }
    setLoading(true);
    try {
      /* Server requires an auth token so it can verify the caller is an
       * active member of the requested group before returning anything. */
      const fb = getFirebase();
      const tok = fb.auth?.currentUser ? await fb.auth.currentUser.getIdToken() : null;
      const headers: Record<string, string> = tok ? { authorization: `Bearer ${tok}` } : {};
      const q = `?groupId=${gid}`;
      const [lbR, acR] = await Promise.all([
        fetch(`/api/leaderboard${q}`, { headers }),
        fetch(`/api/activity${q}&limit=40`.replace("?&", "?"), { headers }),
      ]);
      if (lbR.ok) setLeaderboard(await lbR.json());
      if (acR.ok) setActivity(await acR.json());
    } finally { setLoading(false); }
  }

  useEffect(() => { loadGroupData(currentGroupId); }, [currentGroupId]);
  useEffect(() => {
    /* Reduced from 20s → 90s to lower Firestore read pressure. */
    const id = setInterval(() => loadGroupData(currentGroupId), 90000);
    return () => clearInterval(id);
  }, [currentGroupId]);

  if (!user) return (
    <div className="admin-locked">
      <h3>🔒 קבוצות חברים פרטיות</h3>
      <p className="muted">צריך להתחבר כדי לפתוח קבוצות, להזמין חברים ולראות leaderboard בזמן אמת.</p>
    </div>
  );

  const cur = groups.find(g => g.id === currentGroupId) || null;

  return (
    <section>
      <header className="groups-header">
        <h2 className="sec-title">👥 קבוצות חברים</h2>
        <div className="groups-actions">
          <CreateGroupBtn onCreated={refreshGroups} />
          <JoinGroupBtn   onJoined={refreshGroups} />
        </div>
      </header>

      {groups.length > 0 && (
        <div className="groups-tabs">
          {/* The "🌍 גלובלי" button was removed — there is no cross-group
           * view at any stage. The user can only switch between groups
           * they are actually a member of, and the leaderboard / activity
           * feed shows only members of the currently-selected group. */}
          {groups.map(g => (
            <button key={g.id}
              className={`seg ${currentGroupId === g.id ? "on" : ""}`}
              onClick={() => setCurrentGroup(g.id)}>
              {g.name} · {g.memberCount || 1}
            </button>
          ))}
        </div>
      )}

      {cur && (() => {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const inviteUrl = `${origin}/?invite=${cur.inviteCode}`;
        const waText = `הצטרף לקבוצת מונדיאל 2026 שלי "${cur.name}" 🏆\n${inviteUrl}\n(או הזן קוד ידני: ${cur.inviteCode})`;
        async function copyLink() {
          try { await navigator.clipboard.writeText(inviteUrl); alert("הקישור הועתק!"); }
          catch { prompt("העתק את הקישור ידנית:", inviteUrl); }
        }
        return (
          <div className="group-meta">
            <div>
              <strong>{cur.name}</strong>
              {cur.description && <span className="muted"> · {cur.description}</span>}
            </div>
            <div className="muted" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              קוד הזמנה: <code className="invite-code">{cur.inviteCode}</code>
              <button className="btn btn-small" onClick={copyLink}>
                🔗 העתק קישור הזמנה
              </button>
              <button className="btn btn-small wa-btn"
                      onClick={() => shareToWhatsApp(waText)}>
                💬 שתף בווטסאפ
              </button>
            </div>
          </div>
        );
      })()}

      <div className="groups-grid-two">
        <section>
          <h3 className="sec-title">🏆 לוח תוצאות</h3>
          {!currentGroupId ? (
            <div className="empty-state">בחר קבוצה כדי לראות את לוח התוצאות שלה.</div>
          ) : loading ? (
            <div className="muted">…טוען</div>
          ) : <Leaderboard rows={leaderboard} />}
        </section>

        <section>
          <h3 className="sec-title">📡 פיד פעילות חברים</h3>
          {loading ? <div className="muted">…טוען</div> : <ActivityFeed items={activity} />}
        </section>
      </div>
    </section>
  );
}

function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  if (!rows.length) return <div className="empty-state">עדיין אין נתונים — כשיתחילו המשחקים יופיע leaderboard חי.</div>;
  return (
    <div className="leaderboard">
      {rows.map(r => (
        <div key={r.uid} className={`lb-row ${r.rank === 1 ? "is-first" : r.rank === 2 ? "is-second" : r.rank === 3 ? "is-third" : ""}`}>
          <div className="lb-rank">#{r.rank}</div>
          <div className="lb-avatar"><AvatarDisplay avatarId={r.avatarId} size={36} /></div>
          <div className="lb-name">
            <div>{r.displayName}</div>
            <div className="muted lb-stats">
              🎯 {r.exactCount} · ✅ {r.resultCount}/{r.predictionsCount} · 🔥 {r.streak}
            </div>
          </div>
          <div className="lb-points">{r.totalPoints}<span className="muted" style={{fontSize:11}}> נק׳</span></div>
        </div>
      ))}
    </div>
  );
}

function ActivityFeed({ items }: { items: ActivityEvent[] }) {
  if (!items.length) return <div className="empty-state">עוד לא הייתה פעילות.</div>;
  const labels: Record<string, string> = {
    "prediction.created": "✏️ ניחש משחק",
    "prediction.updated": "✏️ עדכן ניחוש",
    "prediction.auto":    "🤖 קיבל ניחוש אוטומטי",
    "match.result":       "🏁 משחק הסתיים",
    "leaderboard.move":   "📈 עלה בטבלה",
    "achievement.unlocked":"🏅 פתח הישג",
    "group.joined":       "👋 הצטרף לקבוצה",
    "user.reaction":      "💬 הגיב",
  };
  return (
    <div className="activity">
      {items.map(it => (
        <div key={it.id} className="activity-row">
          <AvatarDisplay avatarId={it.avatarId} size={32} />
          <div>
            <div><strong>{it.displayName}</strong> {labels[it.kind] || it.kind}</div>
            <div className="muted activity-meta">
              {it.payload?.home != null && `${it.payload.home} : ${it.payload.away} · `}
              {new Date(it.ts).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CreateGroupBtn({ onCreated }: { onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  async function create() {
    const name = prompt("שם הקבוצה:");
    if (!name) return;
    const description = prompt("תיאור קצר (אופציונלי):") || "";
    setBusy(true);
    try {
      const token = await getFirebase().auth!.currentUser!.getIdToken();
      const r = await fetch("/api/groups", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, description }),
      });
      if (!r.ok) { alert("שגיאה ביצירת הקבוצה."); return; }
      const data = await r.json();
      alert(`קבוצה נוצרה! קוד הזמנה: ${data.inviteCode}`);
      onCreated();
    } finally { setBusy(false); }
  }
  return <button className="btn btn-primary" onClick={create} disabled={busy}>➕ צור קבוצה</button>;
}

function JoinGroupBtn({ onJoined }: { onJoined: () => void }) {
  const [busy, setBusy] = useState(false);
  async function join() {
    const code = prompt("הזן קוד הזמנה לקבוצה:");
    if (!code) return;
    setBusy(true);
    try {
      const token = await getFirebase().auth!.currentUser!.getIdToken();
      const r = await fetch("/api/groups/join", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ inviteCode: code.trim().toUpperCase() }),
      });
      if (!r.ok) { alert("הקבוצה לא נמצאה."); return; }
      alert("הצטרפת לקבוצה!");
      onJoined();
    } finally { setBusy(false); }
  }
  return <button className="btn" onClick={join} disabled={busy}>🔑 הצטרף עם קוד</button>;
}
