"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { setUserDoc, getFirebase } from "@/lib/firebase";
import { AVATARS } from "@/lib/avatars";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { AvatarDisplay } from "./AvatarPicker";
import AvatarPicker from "./AvatarPicker";
import Onboarding from "./Onboarding";
import type { LeaderRow } from "@/lib/types";

export default function ProfileTab() {
  const user = useStore(s => s.user);
  const profile = useStore(s => s.profile);
  const groups = useStore(s => s.groups);
  const favTeams = useStore(s => s.favTeams);
  const predictions = useStore(s => s.predictions);
  const signOut = useStore(s => s.signOut);

  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [myRow, setMyRow] = useState<LeaderRow | null>(null);

  /* Pull this user's leaderboard stats (global) */
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await fetch(`/api/leaderboard`);
        if (!r.ok) return;
        const rows: LeaderRow[] = await r.json();
        const me = rows.find(x => x.uid === user.uid);
        if (me) setMyRow(me);
      } catch {}
    })();
  }, [user?.uid]);

  const jokerCount = useMemo(() =>
    Object.values(predictions).filter(p => p.joker).length,
  [predictions]);

  if (!user) {
    return (
      <section style={{ textAlign: "center", padding: 40 }}>
        <h2>👤 הפרופיל שלך</h2>
        <p className="muted">צריך להתחבר כדי לראות את הפרופיל ולעקוב אחר הביצועים שלך.</p>
        <Link className="btn btn-primary" href="/login">כניסה</Link>
      </section>
    );
  }

  async function saveName() {
    if (!nameDraft.trim()) return;
    try {
      await setUserDoc(`profiles/${user!.uid}`, { displayName: nameDraft.trim() });
      // Update Zustand mirror
      useStore.setState(s => ({ profile: s.profile ? { ...s.profile, displayName: nameDraft.trim() } : null }));
      setEditingName(false);
    } catch (e) { alert("שגיאה בשמירה"); }
  }

  const av = AVATARS.find(a => a.id === profile?.avatarId) || AVATARS[0];

  return (
    <>
      <section className="profile-wrap">
        {/* Hero card */}
        <div className="profile-hero">
          <button className="profile-avatar-btn" onClick={() => setPickingAvatar(true)} title="שנה אווטר">
            <AvatarDisplay avatarId={av.id} size={120} />
            <span className="profile-edit-pill">✏️ שנה</span>
          </button>

          <div className="profile-meta">
            {editingName ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  className="pred-input"
                  style={{ width: 220, fontSize: 18 }}
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  autoFocus
                />
                <button className="btn btn-primary" onClick={saveName}>שמור</button>
                <button className="btn" onClick={() => setEditingName(false)}>ביטול</button>
              </div>
            ) : (
              <h2 className="profile-name">
                {profile?.displayName || user.email}
                <button className="btn btn-small" onClick={() => { setNameDraft(profile?.displayName || ""); setEditingName(true); }}>
                  ✏️
                </button>
              </h2>
            )}
            <div className="muted profile-sub">
              {av.flag} בשם {av.name}
              {user.isAdmin && <span className="chip chip-strong" style={{ marginInline: 8 }}>🛡️ Admin</span>}
              {profile?.managed && <span className="chip" style={{ marginInline: 8 }}>חשבון פנימי</span>}
            </div>
            <div className="muted profile-sub-2">
              📅 חבר מאז {profile?.joinedAt ? new Date(profile.joinedAt).toLocaleDateString("he-IL") : "—"}
              {" · "}
              📧 {user.email}
            </div>
          </div>
        </div>

        {/* Stats */}
        <h3 className="sec-title">📊 הסטטיסטיקה שלי</h3>
        <div className="profile-stats">
          <div className="stat-card stat-gold">
            <div className="stat-val">{myRow?.totalPoints ?? 0}</div>
            <div className="stat-lbl">סך נקודות</div>
            {myRow?.rank && <div className="stat-sub">מקום #{myRow.rank} בגלובלי</div>}
          </div>
          <div className="stat-card">
            <div className="stat-val">{myRow?.exactCount ?? 0}</div>
            <div className="stat-lbl">ניחושים מדויקים 🎯</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{myRow?.resultCount ?? 0}/{myRow?.predictionsCount ?? Object.keys(predictions).length}</div>
            <div className="stat-lbl">תוצאות נכונות ✅</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">🔥 {myRow?.streak ?? 0}</div>
            <div className="stat-lbl">סטריק הכי ארוך</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">🃏 {jokerCount}</div>
            <div className="stat-lbl">ג׳וקרים פעילים</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">⭐ {favTeams.size}</div>
            <div className="stat-lbl">קבוצות אהובות</div>
          </div>
        </div>

        {/* Groups */}
        <h3 className="sec-title">👥 הקבוצות שלי ({groups.length})</h3>
        {groups.length === 0 ? (
          <div className="empty-state">עוד לא הצטרפת לקבוצה — פתח אחת בלשונית "דירוג חברים".</div>
        ) : (
          <div className="profile-groups">
            {groups.map(g => (
              <div key={g.id} className="profile-group">
                <strong>{g.name}</strong>
                <span className="muted"> · {g.memberCount || 1} חברים</span>
                <span className="invite-code">{g.inviteCode}</span>
              </div>
            ))}
          </div>
        )}

        {/* Achievements */}
        <h3 className="sec-title">🏅 הישגים זמינים</h3>
        <p className="muted" style={{ fontSize: 12 }}>
          הישגים נפתחים אוטומטית כשעומדים בתנאים. המשך לנחש כדי לפתוח כולם.
        </p>
        <div className="achv-grid">
          {ACHIEVEMENTS.map(a => (
            <div key={a.id} className="achv-card">
              <div className="achv-icon">{a.icon}</div>
              <div>
                <div className="achv-name">{a.name}</div>
                <div className="muted achv-desc">{a.description}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <h3 className="sec-title">⚙️ פעולות</h3>
        <div className="profile-actions">
          <button className="btn btn-primary" onClick={() => setShowTutorial(true)}>
            📖 צפה שוב בהדרכה
          </button>
          <button className="btn" onClick={() => setPickingAvatar(true)}>
            🎭 שנה אווטר
          </button>
          <button className="btn" onClick={signOut} style={{ marginInlineStart: "auto" }}>
            🚪 יציאה
          </button>
        </div>
      </section>

      {pickingAvatar && <AvatarPicker onClose={() => setPickingAvatar(false)} />}
      {showTutorial && <Onboarding force onClose={() => setShowTutorial(false)} />}
    </>
  );
}
