"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { setUserDoc, getFirebase } from "@/lib/firebase";
import { fakeSiteUserCount } from "@/lib/utils";
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
  const leftGroups = useStore(s => s.leftGroups);
  const leaveGroup = useStore(s => s.leaveGroup);
  const rejoinGroup = useStore(s => s.rejoinGroup);
  const deleteGroup = useStore(s => s.deleteGroup);
  const predictions = useStore(s => s.predictions);
  const signOut = useStore(s => s.signOut);

  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [myRow, setMyRow] = useState<LeaderRow | null>(null);
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [loginStats, setLoginStats] = useState<{ total: number; today: number } | null>(null);

  /* "Leave" only allowed if user has >1 active group (so they always have at least one). */
  const canLeave = groups.length > 1;

  async function handleLeave(g: any) {
    if (!confirm(`לעזוב את הקבוצה "${g.name}"?\nניתן לחזור בכל עת מהפרופיל.`)) return;
    setBusyGroup(g.id);
    try { await leaveGroup(g.id); }
    catch (e: any) { alert(`שגיאה: ${e.message || "לא ניתן לעזוב"}`); }
    finally { setBusyGroup(null); }
  }
  async function handleRejoin(g: any) {
    setBusyGroup(g.id);
    try { await rejoinGroup(g.id); }
    catch (e: any) { alert(`שגיאה: ${e.message || "לא ניתן לחזור"}`); }
    finally { setBusyGroup(null); }
  }
  async function handleDelete(g: any) {
    if (!confirm(`למחוק לצמיתות את הקבוצה "${g.name}"?\nפעולה זו בלתי הפיכה — הקבוצה תיעלם מהמערכת.`)) return;
    setBusyGroup(g.id);
    try { await deleteGroup(g.id); }
    catch (e: any) { alert(`שגיאה: ${e.message || "לא ניתן למחוק"}`); }
    finally { setBusyGroup(null); }
  }

  /* Pull this user's leaderboard stats, scoped to their first active
   * group. The leaderboard endpoint no longer exposes a global view to
   * regular users, so we always query against a group the user is a
   * member of. Points are global per-user (a prediction earns the same
   * regardless of which group the leaderboard is sliced by) so any of
   * the user's groups gives us the correct totals. */
  useEffect(() => {
    if (!user) return;
    const groupId = groups[0]?.id;
    if (!groupId) { setMyRow(null); return; }
    (async () => {
      try {
        const fb = getFirebase();
        const tok = fb.auth?.currentUser ? await fb.auth.currentUser.getIdToken() : null;
        const headers: Record<string, string> = tok ? { authorization: `Bearer ${tok}` } : {};
        const r = await fetch(`/api/leaderboard?groupId=${groupId}`, { headers });
        if (!r.ok) return;
        const rows: LeaderRow[] = await r.json();
        const me = rows.find(x => x.uid === user.uid);
        if (me) setMyRow(me);
      } catch {}
    })();
  }, [user?.uid, groups]);

  /* Admin-only: number of user logins (today / all-time), excluding the
   * admin's own logins. See /api/auth/log-login + /api/admin/login-stats.
   * Defaults to 0/0 — if no non-admin logins have happened yet (or the
   * fetch is still in flight / fails), show "0" rather than hiding the
   * widget entirely. */
  useEffect(() => {
    if (!user?.isAdmin) { setLoginStats(null); return; }
    setLoginStats({ total: 0, today: 0 });
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const fb = getFirebase();
          const tok = fb.auth?.currentUser ? await fb.auth.currentUser.getIdToken() : null;
          if (!tok) { await new Promise(res => setTimeout(res, 300)); continue; }
          const r = await fetch("/api/admin/login-stats", { headers: { authorization: `Bearer ${tok}` } });
          if (r.ok) {
            const j = await r.json();
            if (!cancelled) setLoginStats({ total: j.total ?? 0, today: j.today ?? 0 });
          }
          return;
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [user?.isAdmin]);

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

          {/* Scoring legend — how points are awarded */}
          <ScoringLegend />
        </div>

        {/* Admin-only: live login stats (excludes the admin's own logins) */}
        {user.isAdmin && loginStats && (
          <div className="admin-login-stats">
            <span className="chip chip-strong">📈 כניסות משתמשים</span>
            <span className="admin-login-stat">
              <strong>{loginStats.today}</strong>
              <span className="muted"> היום</span>
            </span>
            <span className="admin-login-stat">
              <strong>{loginStats.total}</strong>
              <span className="muted"> סה״כ</span>
            </span>
          </div>
        )}

        {/* Regular users: decorative "site users" counter */}
        {!user.isAdmin && (
          <div className="admin-login-stats">
            <span className="chip chip-strong">👥 משתמשים באתר</span>
            <span className="admin-login-stat">
              <strong>{fakeSiteUserCount().toLocaleString("he-IL")}</strong>
            </span>
          </div>
        )}

        {/* Stats */}
        <h3 className="sec-title">📊 הסטטיסטיקה שלי</h3>
        <div className="profile-stats">
          <div className="stat-card stat-gold">
            <div className="stat-val">{myRow?.totalPoints ?? 0}</div>
            <div className="stat-lbl">סך נקודות</div>
            {myRow?.rank && <div className="stat-sub">מקום #{myRow.rank} בקבוצה</div>}
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
        </div>

        {/* Groups */}
        <h3 className="sec-title">👥 הקבוצות שלי ({groups.length})</h3>
        {groups.length === 0 ? (
          <div className="empty-state">עוד לא הצטרפת לקבוצה — פתח אחת בלשונית "דירוג חברים".</div>
        ) : (
          <div className="profile-groups">
            {groups.map(g => {
              const isOwner = g.ownerUid === user.uid;
              const memCount = g.memberCount || 1;
              const canDelete = isOwner && memCount <= 1;
              const busy = busyGroup === g.id;
              return (
                <div key={g.id} className="profile-group">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong>{g.name}</strong>
                    {isOwner && <span className="chip chip-strong" style={{ fontSize: 10 }}>👑 בעלים</span>}
                    <span className="muted"> · {memCount} חברים</span>
                    <span className="invite-code">{g.inviteCode}</span>
                  </div>
                  <div className="profile-group-actions" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {canDelete && (
                      <button
                        className="btn btn-small"
                        style={{ background: "rgba(239,68,68,0.12)", borderColor: "var(--red)", color: "var(--red)" }}
                        onClick={() => handleDelete(g)}
                        disabled={busy}
                        title="ניתן למחוק רק קבוצה שבה אתה החבר היחיד"
                      >
                        🗑 מחק קבוצה
                      </button>
                    )}
                    {canLeave && (
                      <button
                        className="btn btn-small"
                        onClick={() => handleLeave(g)}
                        disabled={busy}
                        title="עזוב את הקבוצה — תוכל לחזור בכל עת"
                      >
                        🚪 צא מהקבוצה
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Left groups — rejoin opportunity */}
        {leftGroups.length > 0 && (
          <>
            <h3 className="sec-title" style={{ marginTop: 14 }}>📭 קבוצות שעזבת ({leftGroups.length})</h3>
            <div className="profile-groups">
              {leftGroups.map(g => {
                const busy = busyGroup === g.id;
                return (
                  <div key={g.id} className="profile-group" style={{ opacity: 0.85 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong>{g.name}</strong>
                      <span className="muted"> · {g.memberCount || 0} חברים פעילים</span>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <button className="btn btn-small btn-primary"
                              onClick={() => handleRejoin(g)} disabled={busy}>
                        ↩ חזור לקבוצה
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
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

/* =====================================================================
 * ScoringLegend — quick-reference card that explains how points are
 * awarded. Lives inside the profile hero so users always see it.
 * ===================================================================*/
function ScoringLegend() {
  return (
    <aside className="scoring-legend" aria-label="מפתח ניקוד">
      <div className="scoring-legend-title">🧮 מפתח ניקוד</div>

      <div className="scoring-legend-section">
        <div className="scoring-legend-stage">🏟 שלב הבתים</div>
        <ul>
          <li><span className="pts pts-gold">7</span> תוצאה מדויקת</li>
          <li><span className="pts pts-silver">4</span> תוצאה נכונה + הפרש שערים</li>
          <li><span className="pts pts-bronze">3</span> רק תוצאה נכונה (מנצח/תיקו)</li>
        </ul>
      </div>

      <div className="scoring-legend-section">
        <div className="scoring-legend-stage">🥊 שלבי נוקאאוט</div>
        <ul>
          <li><span className="pts pts-gold">8</span> תוצאה מדויקת + מנצח</li>
          <li><span className="pts pts-silver">5</span> מנצח נכון + הפרש שערים</li>
          <li><span className="pts pts-bronze">3</span> רק מנצח נכון (כולל הארכה/פנדלים)</li>
        </ul>
      </div>

      <div className="scoring-legend-bonus">
        <span className="pts pts-fire">🔥 +1</span>
        בונוס על כל ניחוש נכון ברצף
      </div>
    </aside>
  );
}
