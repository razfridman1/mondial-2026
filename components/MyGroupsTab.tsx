"use client";
/* =====================================================================
 * MyGroupsTab — list every group the user is a member of (active + left).
 * Click a group → switch to it as currentGroupId, navigate to ranking tab.
 * ===================================================================*/
import Link from "next/link";
import { useStore } from "@/lib/store";
import { shareToWhatsApp } from "@/lib/share";

export default function MyGroupsTab() {
  const user        = useStore(s => s.user);
  const groups      = useStore(s => s.groups);
  const leftGroups  = useStore(s => s.leftGroups);
  const setCurrentGroup = useStore(s => s.setCurrentGroup);
  const setPref     = useStore(s => s.setPref);
  const rejoinGroup = useStore(s => s.rejoinGroup);
  const deleteGroup = useStore(s => s.deleteGroup);
  const leaveGroup  = useStore(s => s.leaveGroup);

  if (!user) {
    return (
      <section className="mygroups-tab" style={{ textAlign: "center", padding: 40 }}>
        <h2>👥 הקבוצות שלי</h2>
        <p className="muted">היכנס כדי לראות את הקבוצות שלך, להזמין חברים ולעקוב אחר ביצועים.</p>
        <Link className="btn btn-primary" href="/login">כניסה</Link>
      </section>
    );
  }

  function openInRanking(groupId: string) {
    setCurrentGroup(groupId);
    setPref("tab", "ranking");
  }

  function shareInvite(g: any) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/?invite=${g.inviteCode}`;
    const msg =
      `🏆 הצטרף לקבוצת מונדיאל 2026 שלי "${g.name}"!\n` +
      `נחש תוצאות משחקים, התחרה מול חברים על לוח תוצאות חי 🔮\n\n` +
      `${url}\n\n` +
      `(או הזן את הקוד ידנית: ${g.inviteCode})`;
    shareToWhatsApp(msg);
  }

  async function handleRejoin(groupId: string) {
    try { await rejoinGroup(groupId); }
    catch (e: any) { alert(`שגיאה: ${e?.message || "לא ניתן לחזור"}`); }
  }

  async function handleDelete(g: any) {
    if ((g.memberCount || 1) > 1) {
      alert("לא ניתן למחוק כאשר יש עוד חברים");
      return;
    }
    if (!confirm(`האם למחוק את הקבוצה "${g.name}"? פעולה זו אינה הפיכה.`)) return;
    try { await deleteGroup(g.id); }
    catch (e: any) {
      const msg = e?.message || "";
      if (/members?|חבר/i.test(msg)) {
        alert("לא ניתן למחוק כאשר יש עוד חברים");
      } else {
        alert(`שגיאה: ${msg || "לא ניתן למחוק את הקבוצה"}`);
      }
    }
  }

  async function handleLeave(g: any) {
    if ((g.memberCount || 1) <= 1) {
      alert("לא ניתן לעזוב את הקבוצה כשאתה החבר היחיד בה");
      return;
    }
    if (!confirm(`האם לעזוב את הקבוצה "${g.name}"?`)) return;
    try { await leaveGroup(g.id); }
    catch (e: any) { alert(`שגיאה: ${e?.message || "לא ניתן לעזוב את הקבוצה"}`); }
  }

  return (
    <section className="mygroups-tab">
      <h2 className="sec-title">👥 הקבוצות שלי</h2>
      <p className="muted" style={{ marginTop: 4, marginBottom: 16, fontSize: 13 }}>
        כל הקבוצות שאתה חבר בהן. לחץ על קבוצה כדי לפתוח את לוח התוצאות שלה,
        או הזמן חברים נוספים דרך כפתור "צרף חבר".
      </p>

      {groups.length === 0 && leftGroups.length === 0 ? (
        <div className="empty-state">
          עוד לא הצטרפת לקבוצה — פתח אחת בלשונית "🏆 דירוג חברים" או הצטרף עם קוד הזמנה.
        </div>
      ) : null}

      {groups.length > 0 && (
        <div className="mygroups-grid">
          {groups.map(g => {
            const isOwner = (g as any).ownerUid === user.uid;
            return (
              <div key={g.id} className="mygroups-card">
                <header className="mygroups-card-head">
                  <div className="mygroups-card-name">
                    {g.name}
                    {isOwner && <span className="chip chip-strong" style={{ fontSize: 10, marginInlineStart: 6 }}>👑 בעלים</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    👥 {g.memberCount || 1} חברים
                  </div>
                </header>
                {g.description && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{g.description}</div>
                )}
                <div className="mygroups-card-meta">
                  <span className="muted" style={{ fontSize: 11 }}>קוד הזמנה</span>
                  <code className="invite-code">{g.inviteCode}</code>
                </div>
                <div className="mygroups-card-actions">
                  <button className="btn btn-primary btn-small" onClick={() => openInRanking(g.id)}>
                    🏆 פתח לוח תוצאות
                  </button>
                  <button className="btn btn-small wa-btn" onClick={() => shareInvite(g)}>
                    ➕ צרף חבר
                  </button>
                  {isOwner && (
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => handleDelete(g)}
                      title={(g.memberCount || 1) > 1 ? "לא ניתן למחוק כאשר יש עוד חברים" : "מחיקת הקבוצה"}
                    >
                      🗑️ מחק קבוצה
                    </button>
                  )}
                  <button
                    className="btn btn-small"
                    onClick={() => handleLeave(g)}
                    disabled={(g.memberCount || 1) <= 1}
                    title={(g.memberCount || 1) <= 1 ? "אין משתמשים נוספים בקבוצה" : "יציאה מהקבוצה"}
                  >
                    🚪 צא מהקבוצה
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {leftGroups.length > 0 && (
        <>
          <h3 className="sec-title" style={{ marginTop: 22 }}>📭 קבוצות שעזבת ({leftGroups.length})</h3>
          <div className="mygroups-grid">
            {leftGroups.map(g => (
              <div key={g.id} className="mygroups-card" style={{ opacity: 0.78 }}>
                <header className="mygroups-card-head">
                  <div className="mygroups-card-name">{g.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    👥 {g.memberCount || 0} חברים פעילים
                  </div>
                </header>
                <div className="mygroups-card-actions" style={{ marginTop: 10 }}>
                  <button className="btn btn-small btn-primary" onClick={() => handleRejoin(g.id)}>
                    ↩ חזור לקבוצה
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
