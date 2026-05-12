"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import { TEAMS } from "@/lib/data";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import { shareToWhatsApp } from "@/lib/share";
import { AvatarDisplay } from "./AvatarPicker";
import MatchModal from "./MatchModal";
import type { LeaderRow, ActivityEvent } from "@/lib/types";

interface PredictionCell {
  uid: string;
  displayName: string;
  avatarId: string;
  homeScore: number | null;
  awayScore: number | null;
  joker: boolean;
  auto: boolean;
  hidden: boolean;
  isSelf: boolean;
}
interface MatchRow {
  matchId: string;
  home: string;
  away: string;
  utc: string;
  stage: string;
  group: string | null;
  visible: boolean;
  predictions: PredictionCell[];
}

export default function FriendsRanking() {
  const user = useStore(s => s.user);
  const groups = useStore(s => s.groups);
  const currentGroupId = useStore(s => s.currentGroupId);
  const setCurrentGroup = useStore(s => s.setCurrentGroup);

  const refreshGroups = useStore(s => s.refreshGroups);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [openMatch, setOpenMatch] = useState<string | null>(null);
  const [scope, setScope] = useState<"upcoming" | "finished" | "all">("upcoming");

  useEffect(() => { refreshGroups(); }, [refreshGroups]);

  const currentGroup = useMemo(
    () => groups.find(g => g.id === currentGroupId),
    [groups, currentGroupId]
  );

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getFirebase().auth!.currentUser!.getIdToken();
      const q = currentGroupId ? `?groupId=${currentGroupId}` : "";
      const acQ = currentGroupId ? `?groupId=${currentGroupId}&limit=30` : "?limit=30";
      const [lbR, prR, acR] = await Promise.all([
        fetch(`/api/leaderboard${q}`),
        fetch(`/api/group-predictions${q}`, { headers: { authorization: `Bearer ${token}` } }),
        fetch(`/api/activity${acQ}`),
      ]);
      if (lbR.ok) setLeaderboard(await lbR.json());
      if (prR.ok) {
        const data = await prR.json();
        setRows(data.rows || []);
      }
      if (acR.ok) setActivity(await acR.json());
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [user?.uid, currentGroupId]);
  useEffect(() => {
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [currentGroupId]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return rows.filter(r => {
      const start = new Date(r.utc).getTime();
      if (scope === "upcoming") return start > now - 2 * 60 * 60 * 1000; // upcoming + last 2h
      if (scope === "finished") return start < now;
      return true;
    });
  }, [rows, scope]);

  if (!user) {
    return (
      <section className="empty-state">
        <h3>🔒 דירוג חברים</h3>
        <p>צריך להתחבר כדי לראות את הדירוג והניחושים של החברים.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="sec-title">🏆 דירוג חברים</h2>

      {/* Group selector + create / join */}
      <header className="groups-header">
        <div className="groups-tabs">
          <button className={`seg ${!currentGroupId ? "on" : ""}`} onClick={() => setCurrentGroup(null)}>
            🌍 גלובלי
          </button>
          {groups.map(g => (
            <button key={g.id}
              className={`seg ${currentGroupId === g.id ? "on" : ""}`}
              onClick={() => setCurrentGroup(g.id)}>
              {g.name} · {g.memberCount || 1}
            </button>
          ))}
        </div>
        <div className="groups-actions">
          <CreateGroupBtn onCreated={refreshGroups} />
          <JoinGroupBtn   onJoined={refreshGroups} />
        </div>
      </header>

      {currentGroup && (
        <div className="group-meta">
          <div>
            <strong>{currentGroup.name}</strong>
            {currentGroup.description && <span className="muted"> · {currentGroup.description}</span>}
          </div>
          <div className="muted" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            קוד הזמנה: <code className="invite-code">{currentGroup.inviteCode}</code>
            <button className="btn btn-small wa-btn"
                    onClick={() => shareToWhatsApp(`הצטרף לקבוצת מונדיאל 2026 שלי "${currentGroup.name}" עם קוד הזמנה: *${currentGroup.inviteCode}*`)}>
              💬 שתף בווטסאפ
            </button>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <h3 className="sec-title">📊 לוח התוצאות</h3>
      {loading && !leaderboard.length ? (
        <div className="muted">…טוען</div>
      ) : (
        <Leaderboard rows={leaderboard} myUid={user.uid} />
      )}

      {/* Predictions per match */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
        <h3 className="sec-title" style={{ margin: 0 }}>🔮 ניחושים פר משחק</h3>
        <div className="filter-row" style={{ margin: 0 }}>
          <button className={`seg ${scope === "upcoming" ? "on" : ""}`} onClick={() => setScope("upcoming")}>קרובים</button>
          <button className={`seg ${scope === "finished" ? "on" : ""}`} onClick={() => setScope("finished")}>הסתיימו</button>
          <button className={`seg ${scope === "all" ? "on" : ""}`} onClick={() => setScope("all")}>הכול</button>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        🔒 הניחושים של החברים מוסתרים עד <strong>2 דקות לפני שריקת הפתיחה</strong>.
        הניחוש שלך תמיד גלוי לך. אכיפה גם בצד שרת — אי אפשר להציץ.
      </p>

      {filtered.length === 0 ? (
        <div className="empty-state">אין עדיין ניחושים בתחום זה.</div>
      ) : (
        <div className="fr-list">
          {filtered.map(r => (
            <MatchBlock key={r.matchId} row={r} onOpen={() => setOpenMatch(r.matchId)} />
          ))}
        </div>
      )}

      {/* Activity feed */}
      <h3 className="sec-title">📡 פיד פעילות חברים</h3>
      <ActivityFeed items={activity} />

      {openMatch && <MatchModal matchId={openMatch} onClose={() => setOpenMatch(null)} />}
    </section>
  );
}

function ActivityFeed({ items }: { items: ActivityEvent[] }) {
  if (!items.length) return <div className="empty-state">עוד לא הייתה פעילות.</div>;
  const labels: Record<string, string> = {
    "prediction.created":  "✏️ ניחש משחק",
    "prediction.updated":  "✏️ עדכן ניחוש",
    "prediction.auto":     "🤖 קיבל ניחוש אוטומטי",
    "match.result":        "🏁 משחק הסתיים",
    "leaderboard.move":    "📈 עלה בטבלה",
    "achievement.unlocked":"🏅 פתח הישג",
    "group.joined":        "👋 הצטרף לקבוצה",
    "user.reaction":       "💬 הגיב",
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

function Leaderboard({ rows, myUid }: { rows: LeaderRow[]; myUid: string }) {
  if (!rows.length) return <div className="empty-state">אין עדיין נתונים — כשיתחילו המשחקים יופיע leaderboard חי.</div>;
  return (
    <div className="leaderboard">
      {rows.map(r => (
        <div key={r.uid} className={`lb-row ${r.rank === 1 ? "is-first" : r.rank === 2 ? "is-second" : r.rank === 3 ? "is-third" : ""} ${r.uid === myUid ? "is-me" : ""}`}>
          <div className="lb-rank">#{r.rank}</div>
          <div className="lb-avatar"><AvatarDisplay avatarId={r.avatarId} size={36} /></div>
          <div className="lb-name">
            <div>
              {r.displayName}
              {r.uid === myUid && <span className="chip" style={{ marginInlineStart: 6, fontSize: 9 }}>אתה</span>}
            </div>
            <div className="muted lb-stats">
              🎯 {r.exactCount} · ✅ {r.resultCount}/{r.predictionsCount} · 🔥 {r.streak}
            </div>
          </div>
          <div className="lb-points">{r.totalPoints}<span className="muted" style={{ fontSize: 11 }}> נק׳</span></div>
        </div>
      ))}
    </div>
  );
}

function MatchBlock({ row, onOpen }: { row: MatchRow; onOpen: () => void }) {
  const home = TEAMS[row.home] || { name: row.home, flag: "❓" };
  const away = TEAMS[row.away] || { name: row.away, flag: "❓" };
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startMs = new Date(row.utc).getTime();
  const visibleAtMs = startMs - 2 * 60 * 1000;
  const msToVisibility = visibleAtMs - now;
  const visibleNow = row.visible || msToVisibility <= 0;
  const fmtCountdown = () => {
    const total = Math.max(0, Math.floor(msToVisibility / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}ש׳ ${m}ד׳`;
    return `${m}ד׳ ${String(s).padStart(2, "0")}ש׳`;
  };

  return (
    <div className="fr-match-block">
      <header className="fr-match-header" onClick={onOpen} style={{ cursor: "pointer" }}>
        <div className="fr-teams">
          <span className="flag">{home.flag}</span>
          <strong>{home.name}</strong>
          <span className="muted">נגד</span>
          <strong>{away.name}</strong>
          <span className="flag">{away.flag}</span>
        </div>
        <div className="muted fr-time">
          {formatIsraelDate(row.utc, { short: true })} · {formatIsraelTime(row.utc)}
        </div>
      </header>

      <div className={`fr-visibility ${visibleNow ? "is-visible" : "is-hidden"}`}>
        {visibleNow
          ? "👁️ ניחושי כולם גלויים"
          : `🔒 ניחושי החברים ייחשפו בעוד ${fmtCountdown()}`}
      </div>

      <div className="fr-preds-grid">
        {row.predictions.map(p => (
          <div key={p.uid} className={`fr-pred ${p.isSelf ? "is-self" : ""} ${p.hidden ? "is-hidden" : ""}`}>
            <AvatarDisplay avatarId={p.avatarId} size={32} />
            <div className="fr-pred-name">
              <div>{p.displayName}</div>
              {p.isSelf && <span className="chip" style={{ fontSize: 9 }}>אתה</span>}
            </div>
            <div className="fr-pred-score">
              {p.hidden ? (
                <span title="ניחוש מוסתר עד 2 דקות לפני המשחק">🔒</span>
              ) : (
                <>
                  <strong>{p.homeScore} : {p.awayScore}</strong>
                  {p.joker && <span title="ג׳וקר ×2" className="fr-tag">🃏</span>}
                  {p.auto && <span title="ניחוש אוטומטי" className="fr-tag">🤖</span>}
                </>
              )}
            </div>
          </div>
        ))}
        {!row.predictions.length && (
          <div className="muted" style={{ padding: 8 }}>טרם נחתמו ניחושים.</div>
        )}
      </div>
    </div>
  );
}
