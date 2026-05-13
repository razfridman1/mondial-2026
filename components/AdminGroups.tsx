"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import { shareToWhatsApp, leaderboardShareText } from "@/lib/share";
import type { LeaderRow } from "@/lib/types";
import { AvatarDisplay } from "./AvatarPicker";
import { userTotals } from "@/lib/scoring";

interface Member {
  uid: string;
  groupId: string;
  joinedAt: number;
  role?: "owner" | "admin" | "moderator" | "member";
}

interface GroupRow {
  id: string;
  name: string;
  description?: string;
  inviteCode: string;
  ownerUid: string;
  ownerName?: string;
  createdAt: number;
  memberCount?: number;
  status?: "active" | "frozen" | "archive";
  welcomeMessage?: string;
  maxMembers?: number;
  isPublic?: boolean;
  members?: Member[];
}

interface ProfileLite {
  uid: string;
  displayName?: string;
  email?: string;
  avatarId?: string;
}

type SortKey = "name" | "members" | "newest" | "oldest";
type StatusFilter = "all" | "active" | "frozen" | "archive";

function appUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return "https://mondial-2026-blush.vercel.app";
}

export default function AdminGroups() {
  const me = useStore(s => s.user);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [profilesByUid, setProfilesByUid] = useState<Record<string, ProfileLite>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("members");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAllLeaderboards, setShowAllLeaderboards] = useState(false);

  async function authHeaders() {
    const token = await getFirebase().auth!.currentUser!.getIdToken();
    return { "content-type": "application/json", authorization: `Bearer ${token}` };
  }

  async function load() {
    if (!me?.isAdmin) return;
    setBusy(true); setError(null);
    try {
      const [gR, pR] = await Promise.all([
        fetch("/api/admin/groups",   { headers: await authHeaders() }),
        fetch("/api/admin/profiles", { headers: await authHeaders() }),
      ]);
      if (!gR.ok) {
        const d = await gR.json().catch(() => ({}));
        setError(d.message || d.error || "שגיאה בטעינת הקבוצות");
        return;
      }
      setGroups(await gR.json());
      if (pR.ok) {
        const arr = await pR.json();
        const map: Record<string, ProfileLite> = {};
        for (const p of arr) map[p.uid] = { uid: p.uid, displayName: p.displayName, email: p.email, avatarId: p.avatarId };
        setProfilesByUid(map);
      }
    } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, [me?.isAdmin]);

  async function createGroup() {
    const name = prompt("שם הקבוצה:");
    if (!name || !name.trim()) return;
    const description = prompt("תיאור קצר (אופציונלי):") || "";
    setBusy(true);
    try {
      const r = await fetch("/api/groups", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error || d.message || "שגיאה ביצירת הקבוצה");
        return;
      }
      const data = await r.json();
      alert(`✓ הקבוצה "${name}" נוצרה!\nקוד הזמנה: ${data.inviteCode}`);
      load();
    } finally { setBusy(false); }
  }

  async function patch(id: string, body: any) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/groups", {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ id, ...body }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error || d.message || "שגיאה");
        return false;
      }
      load();
      return true;
    } finally { setBusy(false); }
  }

  async function deleteGroup(g: GroupRow) {
    if (!confirm(`למחוק את "${g.name}" לצמיתות?\nכל החברויות יוסרו.`)) return;
    if (!confirm("פעולה בלתי הפיכה. להמשיך?")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/groups", {
        method: "DELETE",
        headers: await authHeaders(),
        body: JSON.stringify({ id: g.id }),
      });
      if (!r.ok) { alert("שגיאה במחיקה"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function freezeToggle(g: GroupRow) {
    const isFrozen = g.status === "frozen";
    const next = isFrozen ? "active" : "frozen";
    if (!confirm(`${isFrozen ? "לשחרר" : "להקפיא"} את "${g.name}"?`)) return;
    await patch(g.id, { status: next });
  }

  async function copyInvite(g: GroupRow) {
    const inviteUrl = `${appUrl()}/?invite=${g.inviteCode}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      alert(`✓ הועתק:\n${inviteUrl}`);
    } catch {
      prompt("העתק ידנית:", inviteUrl);
    }
  }

  async function shareWA(g: GroupRow) {
    const inviteUrl = `${appUrl()}/?invite=${g.inviteCode}`;
    const text = [
      `⚽ מונדיאל 2026 — הצטרף לקבוצה שלי!`,
      ``,
      `*${g.name}*`,
      g.description ? g.description : "",
      ``,
      `📲 קוד הזמנה: *${g.inviteCode}*`,
      `🔗 ${inviteUrl}`,
    ].filter(Boolean).join("\n");
    shareToWhatsApp(text);
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let arr = groups.filter(g => {
      if (status !== "all" && (g.status || "active") !== status) return false;
      if (!q) return true;
      return (g.name || "").toLowerCase().includes(q)
          || (g.description || "").toLowerCase().includes(q)
          || (g.inviteCode || "").toLowerCase().includes(q);
    });
    arr = [...arr].sort((a, b) => {
      switch (sort) {
        case "name":    return (a.name || "").localeCompare(b.name || "", "he");
        case "members": return (b.members?.length || 0) - (a.members?.length || 0);
        case "oldest":  return (a.createdAt || 0) - (b.createdAt || 0);
        case "newest":
        default:        return (b.createdAt || 0) - (a.createdAt || 0);
      }
    });
    return arr;
  }, [groups, filter, status, sort]);

  /* Counts per status for filter badges */
  const counts = useMemo(() => {
    const c = { all: groups.length, active: 0, frozen: 0, archive: 0 };
    for (const g of groups) {
      const s = (g.status || "active") as keyof typeof c;
      if (s in c) c[s]++;
    }
    return c;
  }, [groups]);

  if (!me?.isAdmin) return null;

  return (
    <section>
      <div className="admin-bar">
        <h3>👫 ניהול קבוצות</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setShowAllLeaderboards(true)} disabled={busy || groups.length === 0}>
            📊 כל לוחות התוצאות
          </button>
          <button className="btn btn-primary" onClick={createGroup} disabled={busy}>
            ➕ צור קבוצה חדשה
          </button>
        </div>
      </div>

      <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
        ניהול מלא של קבוצות החברים: יצירה, עריכה, הקפאה, מחיקה, ניהול חברים, ושיתוף הזמנות.
      </p>

      {/* Filters bar */}
      <div className="filter-row" style={{ flexWrap: "wrap", marginBottom: 10 }}>
        <input
          type="text"
          placeholder="🔎 חפש לפי שם / תיאור / קוד"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ flex: "1 1 220px", padding: 7, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }}
        />
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
                style={{ padding: 7, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }}>
          <option value="members">מיון: כמות חברים</option>
          <option value="newest">חדשים ביותר</option>
          <option value="oldest">ישנים ביותר</option>
          <option value="name">לפי שם</option>
        </select>
      </div>

      <div className="mc-actions" style={{ flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {([
          { id: "all",     label: "הכול",   color: "transparent" },
          { id: "active",  label: "✓ פעילות", color: "rgba(34,197,94,0.15)" },
          { id: "frozen",  label: "🧊 קפואות", color: "rgba(0,212,255,0.15)" },
          { id: "archive", label: "📦 ארכיון", color: "rgba(167,139,250,0.15)" },
        ] as const).map(s => (
          <button
            key={s.id}
            className={`seg ${status === s.id ? "on" : ""}`}
            style={{ background: status === s.id ? undefined : s.color }}
            onClick={() => setStatus(s.id)}
          >
            {s.label} ({counts[s.id]})
          </button>
        ))}
      </div>

      {error && <p className="pred-msg is-locked">{error}</p>}

      {/* Groups grid */}
      {filtered.length === 0 ? (
        <div className="empty-state">{busy ? "טוען…" : "אין קבוצות תואמות."}</div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 10,
        }}>
          {filtered.map(g => {
            const memberCount = g.members?.length ?? g.memberCount ?? 0;
            const owner = profilesByUid[g.ownerUid];
            const isFrozen = g.status === "frozen";
            const isArchive = g.status === "archive";
            return (
              <div key={g.id} style={{
                background: "var(--bg-card)",
                border: `1px solid ${isFrozen ? "var(--accent-2)" : isArchive ? "var(--purple)" : "var(--border-soft)"}`,
                borderRadius: 12,
                padding: 12,
                opacity: isArchive ? 0.7 : 1,
                position: "relative",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 15 }}>{g.name}</strong>
                    {isFrozen && <span className="chip" style={{ marginInlineStart: 6, fontSize: 10, background: "rgba(0,212,255,0.18)", color: "var(--accent-2)" }}>🧊 קפואה</span>}
                    {isArchive && <span className="chip" style={{ marginInlineStart: 6, fontSize: 10, background: "rgba(167,139,250,0.18)", color: "var(--purple)" }}>📦 ארכיון</span>}
                    {g.description && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{g.description}</div>}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12 }}>
                  <span className="chip chip-soft">👥 {memberCount}</span>
                  <code className="invite-code" style={{ fontSize: 11 }}>{g.inviteCode}</code>
                </div>

                {owner && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11 }}>
                    <AvatarDisplay avatarId={owner.avatarId || "messi"} size={20} />
                    <span className="muted">בעלים: {owner.displayName || g.ownerName}</span>
                  </div>
                )}

                <div className="mc-actions" style={{ marginTop: 10, flexWrap: "wrap", gap: 4 }}>
                  <button className="btn btn-small btn-primary" onClick={() => setEditingId(g.id)} title="עריכה">✏️ ערוך</button>
                  <button className="btn btn-small" onClick={() => copyInvite(g)} title="העתק לינק הזמנה">📋</button>
                  <button className="btn btn-small wa-btn" onClick={() => shareWA(g)} title="שתף בווטסאפ">💬</button>
                  <button className="btn btn-small" onClick={() => freezeToggle(g)} title={isFrozen ? "שחרר" : "הקפא"}
                          style={{ background: isFrozen ? "rgba(0,212,255,0.18)" : "transparent" }}>
                    {isFrozen ? "▶" : "🧊"}
                  </button>
                  <button className="btn btn-small" onClick={() => patch(g.id, { status: isArchive ? "active" : "archive" })}
                          title={isArchive ? "החזר לפעיל" : "העבר לארכיון"}
                          style={{ background: isArchive ? "rgba(167,139,250,0.18)" : "transparent" }}>
                    {isArchive ? "↩" : "📦"}
                  </button>
                  <button className="btn btn-small" onClick={() => deleteGroup(g)}
                          style={{ background: "rgba(239,68,68,0.15)", borderColor: "var(--red)", color: "var(--red)" }}
                          title="מחק לצמיתות">🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editingId && (
        <GroupEditModal
          group={groups.find(g => g.id === editingId)!}
          profilesByUid={profilesByUid}
          onClose={() => setEditingId(null)}
          onChange={() => load()}
          authHeaders={authHeaders}
        />
      )}

      {showAllLeaderboards && (
        <AllLeaderboardsModal
          groups={groups.filter(g => (g.status || "active") !== "archive")}
          onClose={() => setShowAllLeaderboards(false)}
        />
      )}
    </section>
  );
}

/* ===================================================================
 * AllLeaderboardsModal — admin view of every group's leaderboard
 * stacked together, each with its own WhatsApp share button.
 * =================================================================== */
function AllLeaderboardsModal({
  groups, onClose,
}: { groups: GroupRow[]; onClose: () => void }) {
  const [boards, setBoards] = useState<Record<string, LeaderRow[]>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setBusy(true);
      try {
        const out: Record<string, LeaderRow[]> = {};
        await Promise.all(groups.map(async g => {
          try {
            const r = await fetch(`/api/leaderboard?groupId=${g.id}`);
            if (r.ok) out[g.id] = await r.json();
          } catch {}
        }));
        /* Also load global */
        try {
          const r = await fetch(`/api/leaderboard`);
          if (r.ok) out["__global__"] = await r.json();
        } catch {}
        setBoards(out);
      } finally { setBusy(false); }
    })();
  }, [groups]);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" style={{ maxWidth: 760 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <header className="modal-header">
          <h2>📊 כל לוחות התוצאות</h2>
          <div className="muted">{groups.length} קבוצות + לוח גלובלי</div>
        </header>

        {busy && Object.keys(boards).length === 0 && (
          <div className="muted" style={{ marginTop: 14 }}>…טוען</div>
        )}

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Global */}
          {boards["__global__"] && boards["__global__"].length > 0 && (
            <LbCard
              title="🌍 דירוג גלובלי (כל המשתמשים)"
              rows={boards["__global__"]}
              groupName={null}
            />
          )}
          {groups.map(g => {
            const rows = boards[g.id] || [];
            return (
              <LbCard
                key={g.id}
                title={`👫 ${g.name}`}
                rows={rows}
                groupName={g.name}
              />
            );
          })}
        </div>

        <div className="mc-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
}

function LbCard({ title, rows, groupName }: { title: string; rows: LeaderRow[]; groupName: string | null }) {
  return (
    <div style={{
      background: "var(--bg-elev)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: 14 }}>{title}</strong>
        {rows.length > 0 && (
          <button
            className="btn btn-small wa-btn"
            onClick={() => shareToWhatsApp(leaderboardShareText({ rows, groupName, limit: 10 }))}
          >
            💬 שתף
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>אין נתונים עדיין.</div>
      ) : (
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          {rows.map(r => (
            <div key={r.uid} style={{
              display: "grid",
              gridTemplateColumns: "36px auto 1fr auto",
              gap: 8, alignItems: "center",
              padding: "6px 8px",
              borderBottom: "1px solid var(--border-soft)",
              fontSize: 13,
            }}>
              <span style={{ fontWeight: 700, color: "var(--accent)" }}>
                {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`}
              </span>
              <AvatarDisplay avatarId={r.avatarId} size={24} />
              <span>{r.displayName}</span>
              <span style={{ fontWeight: 800 }}>{r.totalPoints} נק׳</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===================================================================
 * GroupEditModal — full group editor with members + invite + analytics
 * =================================================================== */
function GroupEditModal({
  group, profilesByUid, onClose, onChange, authHeaders,
}: {
  group: GroupRow;
  profilesByUid: Record<string, ProfileLite>;
  onClose: () => void;
  onChange: () => void;
  authHeaders: () => Promise<any>;
}) {
  const [tab, setTab] = useState<"info" | "members" | "invite" | "stats">("info");
  const [name, setName] = useState(group.name || "");
  const [description, setDescription] = useState(group.description || "");
  const [welcomeMessage, setWelcomeMessage] = useState(group.welcomeMessage || "");
  const [inviteCode, setInviteCode] = useState(group.inviteCode || "");
  const [maxMembers, setMaxMembers] = useState<number>(group.maxMembers || 0);
  const [isPublic, setIsPublic] = useState<boolean>(group.isPublic ?? true);
  const [busy, setBusy] = useState(false);
  const [memberStats, setMemberStats] = useState<Record<string, { points: number; preds: number; exact: number }>>({});

  /* Compute basic stats per member */
  useEffect(() => {
    if (tab !== "stats") return;
    (async () => {
      setBusy(true);
      try {
        const r = await fetch("/api/match-results");
        const results: Record<string, any> = r.ok ? await r.json() : {};
        const stats: Record<string, { points: number; preds: number; exact: number }> = {};
        for (const m of group.members || []) {
          const pR = await fetch(`/api/predictions?uid=${m.uid}`);
          if (!pR.ok) continue;
          const preds: any[] = await pR.json();
          const t = userTotals(preds, results);
          stats[m.uid] = { points: t.totalPoints, preds: t.predictionsCount, exact: t.exactCount };
        }
        setMemberStats(stats);
      } finally { setBusy(false); }
    })();
  }, [tab, group.id]);

  async function save() {
    setBusy(true);
    try {
      const body: any = {
        id: group.id,
        name: name.trim(),
        description: description.trim(),
        welcomeMessage: welcomeMessage.trim(),
        maxMembers,
        isPublic,
      };
      if (inviteCode.trim() && inviteCode.trim().toUpperCase() !== group.inviteCode) {
        body.inviteCode = inviteCode.trim().toUpperCase();
      }
      const r = await fetch("/api/admin/groups", {
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
    } finally { setBusy(false); }
  }

  async function removeMember(uid: string) {
    const prof = profilesByUid[uid];
    if (!confirm(`להסיר את ${prof?.displayName || uid} מהקבוצה?`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/groups", {
        method: "DELETE",
        headers: await authHeaders(),
        body: JSON.stringify({ id: group.id, removeMemberUid: uid }),
      });
      if (!r.ok) { alert("שגיאה"); return; }
      onChange();
    } finally { setBusy(false); }
  }

  const inviteUrl = `${appUrl()}/?invite=${group.inviteCode}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(inviteUrl)}`;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" style={{ maxWidth: 720 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <header className="modal-header">
          <h2>👫 {group.name}</h2>
          <div className="muted">
            {group.members?.length || 0} חברים · קוד <code className="invite-code">{group.inviteCode}</code>
          </div>
        </header>

        <div className="filter-row" style={{ marginTop: 14 }}>
          {[
            { id: "info",    label: "ℹ️ פרטים" },
            { id: "members", label: `👥 חברים (${group.members?.length || 0})` },
            { id: "invite",  label: "📲 הזמנה" },
            { id: "stats",   label: "📊 סטטיסטיקות" },
          ].map(t => (
            <button key={t.id} className={`seg ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id as any)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ============= INFO TAB ============= */}
        {tab === "info" && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <label>
              <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 700 }}>שם הקבוצה</div>
              <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={60}
                     style={{ width: "100%", padding: 8, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} />
            </label>
            <label>
              <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 700 }}>תיאור</div>
              <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={240}
                        rows={2}
                        style={{ width: "100%", padding: 8, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", resize: "vertical" }} />
            </label>
            <label>
              <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 700 }}>הודעת ברוכים הבאים</div>
              <textarea value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)} maxLength={500}
                        rows={3}
                        placeholder="ההודעה שתופיע למצטרפים חדשים…"
                        style={{ width: "100%", padding: 8, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", resize: "vertical" }} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <label>
                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 700 }}>קוד הזמנה</div>
                <input type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} maxLength={12}
                       style={{ width: "100%", padding: 8, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontFamily: "monospace" }} />
              </label>
              <label>
                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 700 }}>מקסימום חברים</div>
                <input type="number" value={maxMembers} onChange={e => setMaxMembers(Number(e.target.value) || 0)} min={0}
                       placeholder="0 = ללא הגבלה"
                       style={{ width: "100%", padding: 8, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 700 }}>ציבורית?</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 8, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 8, height: 36 }}>
                  <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
                  <span style={{ fontSize: 12 }}>{isPublic ? "🌐 כן" : "🔒 פרטית"}</span>
                </div>
              </label>
            </div>

            <div className="mc-actions" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" onClick={save} disabled={busy}>💾 שמור</button>
              <button className="btn" onClick={onClose}>ביטול</button>
            </div>
          </div>
        )}

        {/* ============= MEMBERS TAB ============= */}
        {tab === "members" && (
          <div style={{ marginTop: 14, maxHeight: 400, overflowY: "auto" }}>
            {(group.members || []).length === 0 ? (
              <div className="empty-state">אין חברים בקבוצה.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(group.members || []).map(m => {
                  const p = profilesByUid[m.uid];
                  const isOwner = m.uid === group.ownerUid || m.role === "owner";
                  return (
                    <div key={m.uid} style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      gap: 10, alignItems: "center",
                      padding: "8px 12px",
                      background: "var(--bg-elev)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                    }}>
                      <AvatarDisplay avatarId={p?.avatarId || "messi"} size={36} />
                      <div>
                        <strong>{p?.displayName || "משתמש"}</strong>
                        {isOwner && <span className="chip chip-strong" style={{ marginInlineStart: 6, fontSize: 10 }}>👑 בעלים</span>}
                        <div className="muted" style={{ fontSize: 11 }}>{p?.email || m.uid.slice(0, 12) + "…"}</div>
                      </div>
                      {!isOwner && (
                        <button className="btn btn-small"
                                onClick={() => removeMember(m.uid)}
                                disabled={busy}
                                style={{ background: "rgba(239,68,68,0.15)", borderColor: "var(--red)", color: "var(--red)" }}>
                          🗑️ הסר
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============= INVITE TAB ============= */}
        {tab === "invite" && (
          <div style={{ marginTop: 14, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
              סרוק את הקוד או שתף את הלינק
            </div>
            <div style={{ background: "#fff", display: "inline-block", padding: 10, borderRadius: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="QR code" width={240} height={240} />
            </div>
            <div style={{ marginTop: 14 }}>
              <code style={{
                display: "block",
                padding: 10,
                background: "var(--bg-elev)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                wordBreak: "break-all",
                fontSize: 12,
                direction: "ltr",
              }}>
                {inviteUrl}
              </code>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
                <button className="btn btn-primary" onClick={async () => {
                  try { await navigator.clipboard.writeText(inviteUrl); alert("✓ הועתק"); }
                  catch { prompt("העתק:", inviteUrl); }
                }}>📋 העתק לינק</button>
                <button className="btn wa-btn" onClick={() => {
                  const text = [
                    `⚽ מונדיאל 2026 — הצטרף לקבוצה שלי!`,
                    ``,
                    `*${group.name}*`,
                    group.description || "",
                    ``,
                    `📲 קוד הזמנה: *${group.inviteCode}*`,
                    `🔗 ${inviteUrl}`,
                  ].filter(Boolean).join("\n");
                  shareToWhatsApp(text);
                }}>💬 שלח בווטסאפ</button>
              </div>
            </div>
          </div>
        )}

        {/* ============= STATS TAB ============= */}
        {tab === "stats" && (
          <div style={{ marginTop: 14 }}>
            {busy ? (
              <div className="muted">…מחשב</div>
            ) : (
              <>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                  gap: 8,
                  marginBottom: 14,
                }}>
                  <Stat label="חברים" value={group.members?.length || 0} icon="👥" />
                  <Stat label="ניחושים" value={Object.values(memberStats).reduce((s, x) => s + x.preds, 0)} icon="🔮" />
                  <Stat label="נקודות" value={Object.values(memberStats).reduce((s, x) => s + x.points, 0)} icon="🏆" />
                  <Stat label="מדויקים" value={Object.values(memberStats).reduce((s, x) => s + x.exact, 0)} icon="🎯" />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h4 style={{ fontSize: 13, margin: 0 }}>👑 חברים מובילים בקבוצה:</h4>
                  {Object.keys(memberStats).length > 0 && (
                    <button
                      className="btn btn-small wa-btn"
                      onClick={() => {
                        const sorted = Object.entries(memberStats)
                          .sort((a, b) => b[1].points - a[1].points)
                          .map(([uid, st], i) => ({
                            uid,
                            displayName: profilesByUid[uid]?.displayName || "—",
                            avatarId: profilesByUid[uid]?.avatarId || "messi",
                            totalPoints: st.points,
                            exactCount: st.exact,
                            resultCount: 0,
                            predictionsCount: st.preds,
                            streak: 0,
                            rank: i + 1,
                          }));
                        shareToWhatsApp(leaderboardShareText({
                          rows: sorted as LeaderRow[],
                          groupName: group.name,
                          limit: 10,
                        }));
                      }}
                    >
                      💬 שתף בווטסאפ
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                  {Object.entries(memberStats)
                    .sort((a, b) => b[1].points - a[1].points)
                    .map(([uid, st], idx) => {
                      const p = profilesByUid[uid];
                      return (
                        <div key={uid} style={{
                          display: "grid",
                          gridTemplateColumns: "30px auto 1fr auto",
                          gap: 8, alignItems: "center",
                          padding: "6px 10px",
                          borderBottom: "1px solid var(--border-soft)",
                          fontSize: 13,
                        }}>
                          <span style={{ fontWeight: 700, color: "var(--accent)" }}>#{idx + 1}</span>
                          <AvatarDisplay avatarId={p?.avatarId || "messi"} size={28} />
                          <span>{p?.displayName || "—"}</span>
                          <span style={{ fontWeight: 700 }}>{st.points} נק׳</span>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div style={{
      background: "var(--bg-elev)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "10px 6px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{icon} {value}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}
