"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import { TEAMS, STAGES } from "@/lib/data";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import { shareToWhatsApp, leaderboardShareText } from "@/lib/share";
import { getUserDoc } from "@/lib/firebase";
import { AVATARS } from "@/lib/avatars";
import { AvatarDisplay } from "./AvatarPicker";
import MatchModal from "./MatchModal";
import type { LeaderRow, ActivityEvent } from "@/lib/types";

interface PredictionCell {
  uid: string;
  displayName: string;
  avatarId: string;
  homeScore: number | null;
  awayScore: number | null;
  predictedWinner?: string | null;
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
  const leftGroups = useStore(s => s.leftGroups);
  const currentGroupId = useStore(s => s.currentGroupId);
  const setCurrentGroup = useStore(s => s.setCurrentGroup);
  const leaveGroup = useStore(s => s.leaveGroup);
  const deleteGroup = useStore(s => s.deleteGroup);
  const rejoinGroup = useStore(s => s.rejoinGroup);

  const refreshGroups = useStore(s => s.refreshGroups);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [openMatch, setOpenMatch] = useState<string | null>(null);
  const [scope, setScope] = useState<"upcoming" | "finished" | "all">("upcoming");
  /* Selected leaderboard view: ALWAYS a specific group id.
   * The user can never see a global / cross-group view — every view
   * is scoped to one of the user's own groups. Initialized from
   * currentGroupId; if none yet, the first group will populate it
   * once `refreshGroups` finishes. */
  const [selectedLb, setSelectedLb] = useState<string>(() => currentGroupId || "");

  /* Admin override: super-admins may additionally view ANY group (even ones
   * they're not a member of) so they appear in the selector below. Regular
   * users still only ever see their own groups. The leaderboard API already
   * permits admins to read any group's board. */
  const [adminGroups, setAdminGroups] = useState<any[]>([]);
  const memberIds = useMemo(() => new Set(groups.map(g => g.id)), [groups]);
  const leaderboardGroups = useMemo(
    () => user?.isAdmin
      ? [...groups, ...adminGroups.filter(ag => !memberIds.has(ag.id))]
      : groups,
    [user?.isAdmin, groups, adminGroups, memberIds]
  );

  /* Keep selectedLb in sync with the user's actual memberships:
   *   - if no group is selected but the user has groups, pick the first
   *   - if the selected group is no longer one of the user's groups, switch
   * Runs on group list changes (initial load, join, leave). */
  useEffect(() => {
    if (leaderboardGroups.length === 0) {
      if (selectedLb !== "") setSelectedLb("");
      return;
    }
    const stillExists = leaderboardGroups.some(g => g.id === selectedLb);
    if (!selectedLb || !stillExists) {
      const next = currentGroupId && leaderboardGroups.some(g => g.id === currentGroupId)
        ? currentGroupId
        : leaderboardGroups[0].id;
      setSelectedLb(next);
      setCurrentGroup(next);
    }
  }, [leaderboardGroups, selectedLb, currentGroupId, setCurrentGroup]);

  useEffect(() => { refreshGroups(); }, [refreshGroups]);

  /* Super-admins: pull the full group list so any group (incl. ones they're
   * not a member of, e.g. "מונדיאל") shows up in the selector. */
  useEffect(() => {
    if (!user?.isAdmin) { setAdminGroups([]); return; }
    (async () => {
      try {
        const fb = getFirebase();
        const tok = fb.auth?.currentUser ? await fb.auth.currentUser.getIdToken() : null;
        if (!tok) return;
        const r = await fetch("/api/admin/groups", { headers: { authorization: `Bearer ${tok}` } });
        if (r.ok) setAdminGroups(await r.json());
      } catch {}
    })();
  }, [user?.isAdmin]);

  async function load() {
    if (!user) return;
    /* Never fetch without a group scope — there is no global view, and
     * skipping the request prevents the server from accidentally
     * leaking cross-group data if a defense-in-depth check is missed. */
    if (!currentGroupId) {
      setLeaderboard([]); setRows([]); setActivity([]);
      return;
    }
    setLoading(true);
    try {
      const token = await getFirebase().auth!.currentUser!.getIdToken();
      const q = `?groupId=${currentGroupId}`;
      const acQ = `?groupId=${currentGroupId}&limit=30`;
      /* All three endpoints now require the auth header so the server
       * can verify the caller is an active member of the requested
       * group before returning anything. */
      const authHeaders = { authorization: `Bearer ${token}` };
      const [lbR, prR, acR] = await Promise.all([
        fetch(`/api/leaderboard${q}`,        { headers: authHeaders }),
        fetch(`/api/group-predictions${q}`,  { headers: authHeaders }),
        fetch(`/api/activity${acQ}`,         { headers: authHeaders }),
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
    /* Reduced from 30s → 120s to lower Firestore read pressure.
     * Users can press the page refresh button for an immediate update. */
    const id = setInterval(load, 120000);
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

  /* ---- group management (merged in from the old "הקבוצות שלי" tab) ---- */
  async function handleLeave(g: any) {
    if ((g.memberCount || 1) <= 1) { alert("לא ניתן לעזוב את הקבוצה כשאתה החבר היחיד בה"); return; }
    if (!confirm(`האם לעזוב את הקבוצה "${g.name}"?`)) return;
    try { await leaveGroup(g.id); }
    catch (e: any) { alert(`שגיאה: ${e?.message || "לא ניתן לעזוב את הקבוצה"}`); }
  }
  async function handleDelete(g: any) {
    if ((g.memberCount || 1) > 1) { alert("לא ניתן למחוק כאשר יש עוד חברים"); return; }
    if (!confirm(`האם למחוק את הקבוצה "${g.name}"? פעולה זו אינה הפיכה.`)) return;
    try { await deleteGroup(g.id); }
    catch (e: any) {
      const msg = e?.message || "";
      if (/members?|חבר/i.test(msg)) alert("לא ניתן למחוק כאשר יש עוד חברים");
      else alert(`שגיאה: ${msg || "לא ניתן למחוק את הקבוצה"}`);
    }
  }
  async function handleRejoin(groupId: string) {
    try { await rejoinGroup(groupId); }
    catch (e: any) { alert(`שגיאה: ${e?.message || "לא ניתן לחזור"}`); }
  }

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

      {/* Filter row + create-group button. The "🌍 גלובלי" option has
       * been removed entirely — there is no cross-group view at any
       * stage. If the user belongs to several groups they can switch
       * between them here, but each view shows ONLY members of that
       * single group. Selecting a group also updates `currentGroupId`
       * so the per-match predictions section stays in sync. */}
      <div className="fr-lb-filter-row">
        <GroupsSelect
          groups={leaderboardGroups}
          leftGroups={leftGroups}
          selectedId={selectedLb}
          memberIds={memberIds}
          onSelect={(id) => { setSelectedLb(id); setCurrentGroup(id); }}
          onRejoin={handleRejoin}
        />
        <div className="fr-lb-create-wrap">
          <CreateGroupBtn onCreated={refreshGroups} />
        </div>
      </div>

      {leaderboardGroups.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 12 }}>
          עוד לא הצטרפת לקבוצה. צור קבוצה חדשה או הצטרף עם קוד הזמנה כדי לראות
          את לוח התוצאות ואת הניחושים של חברי הקבוצה שלך.
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          {leaderboardGroups
            .filter(g => g.id === selectedLb)
            .map(g => {
              const gAny = (groups.find(x => x.id === g.id) || g) as any;
              const isMember = memberIds.has(g.id);
              return (
                <GroupLeaderboardCard
                  key={g.id}
                  groupId={g.id}
                  groupName={g.name}
                  inviteCode={gAny.inviteCode}
                  myUid={user.uid}
                  memberCount={groupActiveCount(gAny)}
                  adminView={!isMember}
                  isOwner={isMember && gAny.ownerUid === user.uid}
                  onLeave={isMember ? () => handleLeave(gAny) : undefined}
                  onDelete={isMember ? () => handleDelete(gAny) : undefined}
                  predictionRows={g.id === currentGroupId ? rows : []}
                />
              );
            })}
        </div>
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

/* ===================================================================
 * GroupsSelect — dropdown that ONLY selects which group's leaderboard the
 * user is looking at. The per-group action buttons live to the side, in
 * the filter row (see FriendsRanking). Left groups get an inline rejoin.
 * position:fixed so the menu isn't clipped by the filter row.
 * =================================================================== */
/* Accurate active-member count. The stored `memberCount` field on the group
 * doc can drift (it isn't always decremented on leave). When the admin groups
 * endpoint supplies the actual `members` array we count only non-left members;
 * otherwise we fall back to the stored count. */
function groupActiveCount(g: any): number {
  if (Array.isArray(g?.members)) return g.members.filter((m: any) => !m?.left).length;
  return g?.memberCount || 1;
}

function GroupsSelect({
  groups, leftGroups, selectedId, memberIds, onSelect, onRejoin,
}: {
  groups: any[];
  leftGroups: any[];
  selectedId: string;
  memberIds: Set<string>;
  onSelect: (id: string) => void;
  onRejoin: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 260 });
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const current = groups.find(g => g.id === selectedId);

  function reposition() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setCoords({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 240) });
  }
  useEffect(() => {
    if (!open) return;
    reposition();
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onMove() { reposition(); }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  return (
    <div className="groups-dd" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        className="groups-dd-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        👥 {current ? current.name : "בחר קבוצה"}
        <span className="groups-dd-caret">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div
          className="groups-dd-menu"
          role="menu"
          style={{ top: coords.top, left: coords.left, width: coords.width }}
        >
          {groups.length === 0 && leftGroups.length === 0 && (
            <div className="muted" style={{ padding: 12, fontSize: 13 }}>
              עוד לא הצטרפת לקבוצה. צור קבוצה חדשה או הצטרף עם קוד הזמנה.
            </div>
          )}

          {groups.map(g => (
            <button
              key={g.id}
              role="menuitemradio"
              aria-checked={g.id === selectedId}
              className={`groups-dd-item ${g.id === selectedId ? "on" : ""}`}
              onClick={() => { onSelect(g.id); setOpen(false); }}
            >
              <span className="groups-dd-item-name">👥 {g.name}</span>
              {g.id === selectedId && <span className="groups-dd-check">✓</span>}
              {!memberIds.has(g.id) && (
                <span className="chip" style={{ fontSize: 9 }} title="קבוצה שאינך חבר בה — צפייה כאדמין">🛡️ אדמין</span>
              )}
              <span className="muted" style={{ fontSize: 11, marginInlineStart: "auto" }}>
                {groupActiveCount(g)} חברים
              </span>
            </button>
          ))}

          {leftGroups.length > 0 && (
            <>
              <div className="groups-dd-sep">📭 קבוצות שעזבת</div>
              {leftGroups.map(g => (
                <div key={g.id} className="groups-dd-left-row">
                  <span className="groups-dd-item-name" style={{ opacity: 0.8 }}>{g.name}</span>
                  <button
                    className="btn btn-small btn-primary"
                    onClick={() => { onRejoin(g.id); setOpen(false); }}
                  >
                    ↩ חזור
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
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

/* ===================================================================
 * GroupLeaderboardCard — leaderboard for a specific group (or global)
 * with its own fetch + WhatsApp share button.
 * =================================================================== */
function GroupLeaderboardCard({
  groupId, groupName, inviteCode, myUid, predictionRows, collapsed = false,
  memberCount = 1, isOwner = false, onLeave, onDelete, adminView = false,
}: {
  groupId: string | null;
  groupName: string;
  inviteCode?: string;
  myUid: string;
  predictionRows: MatchRow[];
  collapsed?: boolean;
  memberCount?: number;
  isOwner?: boolean;
  onLeave?: () => void;
  onDelete?: () => void;
  adminView?: boolean;
}) {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(!collapsed);

  async function load() {
    /* Same defense as the parent component: never fetch a global
     * leaderboard. If somehow the groupId is missing, render empty. */
    if (!groupId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      /* Server requires an auth token to verify group membership. */
      const fb = getFirebase();
      const tok = fb.auth?.currentUser ? await fb.auth.currentUser.getIdToken() : null;
      const headers: Record<string, string> = tok ? { authorization: `Bearer ${tok}` } : {};
      const q = `?groupId=${groupId}`;
      const r = await fetch(`/api/leaderboard${q}`, { headers });
      if (r.ok) setRows(await r.json());
    } finally { setLoading(false); }
  }
  useEffect(() => { if (open) load(); }, [groupId, open]);
  /* Auto-refresh every 20s when card is open so leaderboards reflect
   * recent prediction / result updates (e.g. from the sim panel). */
  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [groupId, open]);

  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border-soft)",
      borderRadius: 12,
      padding: 12,
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        marginBottom: open ? 10 : 0,
      }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            background: "transparent", border: "none", padding: 0, cursor: "pointer",
            color: "var(--text)", fontSize: 15, fontWeight: 800,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <span>{open ? "▾" : "▸"}</span>
          <span>{groupName}</span>
          {adminView && <span className="chip" style={{ fontSize: 10 }} title="קבוצה שאינך חבר בה — צפייה כאדמין">🛡️ צפייה כאדמין</span>}
          {rows.length > 0 && <span className="chip chip-soft" style={{ fontSize: 11 }}>👥 {rows.length}</span>}
        </button>
        {open && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {inviteCode && (
              <button
                className="btn btn-small wa-btn"
                onClick={() => {
                  const origin = typeof window !== "undefined" ? window.location.origin : "";
                  const url = `${origin}/?invite=${inviteCode}`;
                  const cleanGroupName = groupName.replace(/^[🌍🏆📊]+\s*/, "");
                  const msg =
                    `🏆 הצטרף לקבוצת מונדיאל 2026 שלי "${cleanGroupName}"!\n` +
                    `נחש תוצאות משחקים, התחרה מול חברים על לוח תוצאות חי 🔮\n\n` +
                    `${url}\n\n` +
                    `(או הזן את הקוד ידנית: ${inviteCode})\n\n` +
                    `📲 טיפ: פִּתחו בדפדפן (Chrome/Safari) → תפריט → "הוסף למסך הבית". כך תישארו מחוברים ולא תתבקשו סיסמה שוב.`;
                  shareToWhatsApp(msg);
                }}
                title="הזמן חבר להצטרף לקבוצה בווטסאפ"
              >
                ➕ צרף חבר
              </button>
            )}
            {rows.length > 0 && (
              <button
                className="btn btn-small wa-btn"
                onClick={() => shareToWhatsApp(leaderboardShareText({
                  rows,
                  groupName: groupId ? groupName.replace(/^[🌍🏆📊]+\s*/, "") : null,
                  limit: 10,
                }))}
                title="שתף את לוח התוצאות בווטסאפ"
              >
                💬 שתף טבלה
              </button>
            )}
            {onLeave && (
              <button
                className="btn btn-small"
                disabled={memberCount <= 1}
                title={memberCount <= 1 ? "אין משתמשים נוספים בקבוצה" : "יציאה מהקבוצה"}
                onClick={onLeave}
              >
                🚪 צא מהקבוצה
              </button>
            )}
            {isOwner && onDelete && (
              <button
                className="btn btn-small btn-danger"
                title={memberCount > 1 ? "לא ניתן למחוק כאשר יש עוד חברים" : "מחיקת הקבוצה"}
                onClick={onDelete}
              >
                🗑️ מחק קבוצה
              </button>
            )}
          </div>
        )}
      </div>
      {open && (
        loading && !rows.length
          ? <div className="muted">…טוען</div>
          : <Leaderboard rows={rows} myUid={myUid} predictionRows={predictionRows} />
      )}
    </div>
  );
}

function Leaderboard({ rows, myUid, predictionRows }: { rows: LeaderRow[]; myUid: string; predictionRows: MatchRow[] }) {
  const [openUser, setOpenUser] = useState<LeaderRow | null>(null);
  if (!rows.length) return <div className="empty-state">אין עדיין נתונים — כשיתחילו המשחקים יופיע leaderboard חי.</div>;
  return (
    <>
      <div className="leaderboard">
        {rows.map(r => (
          <div
            key={r.uid}
            role="button"
            tabIndex={0}
            onClick={() => setOpenUser(r)}
            onKeyDown={e => { if (e.key === "Enter") setOpenUser(r); }}
            className={`lb-row lb-row-clickable ${r.rank === 1 ? "is-first" : r.rank === 2 ? "is-second" : r.rank === 3 ? "is-third" : ""} ${r.uid === myUid ? "is-me" : ""}`}
            title="לחץ לפרטים מלאים"
          >
            <div className="lb-rank">#{r.rank}</div>
            <div className="lb-avatar"><AvatarDisplay avatarId={r.avatarId} size={36} /></div>
            <div className="lb-name">
              <div>
                {r.displayName}
                {r.uid === myUid && <span className="chip" style={{ marginInlineStart: 6, fontSize: 9 }}>אתה</span>}
              </div>
              {/* Per-user mini stats (exactCount, streak, resultCount) — removed
               * per design: keep the leaderboard clean. Stats are still available
               * by clicking a user (UserStatsModal). */}
            </div>
            <div className="lb-points">{r.totalPoints}<span className="muted" style={{ fontSize: 11 }}> נק׳</span></div>
          </div>
        ))}
      </div>
      {openUser && (
        <UserStatsModal
          row={openUser}
          isMe={openUser.uid === myUid}
          predictionRows={predictionRows}
          onClose={() => setOpenUser(null)}
        />
      )}
    </>
  );
}

/* ===================================================================
 * UserStatsModal — detailed view of a single user's leaderboard stats
 * =================================================================== */
function UserStatsModal({
  row, isMe, predictionRows, onClose,
}: {
  row: LeaderRow;
  isMe: boolean;
  predictionRows: MatchRow[];
  onClose: () => void;
}) {
  /* Pull every prediction this user made from the group-predictions snapshot */
  const myPreds = useMemo(() => {
    const out: Array<{
      matchId: string; home: string; away: string; utc: string;
      pred: PredictionCell | null;
    }> = [];
    for (const mr of predictionRows) {
      const p = mr.predictions.find(x => x.uid === row.uid);
      if (p) out.push({ matchId: mr.matchId, home: mr.home, away: mr.away, utc: mr.utc, pred: p });
    }
    return out.sort((a, b) => new Date(b.utc).getTime() - new Date(a.utc).getTime());
  }, [predictionRows, row.uid]);

  /* Fetch the public profile doc for extra details (bio, joinedAt, etc.) */
  const [profile, setProfile] = useState<{
    displayName?: string;
    avatarId?: string;
    bio?: string;
    joinedAt?: number;
    managed?: boolean;
  } | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const p = await getUserDoc<any>(`profiles/${row.uid}`);
        if (p) setProfile(p);
      } catch {}
    })();
  }, [row.uid]);

  const avatarInfo = AVATARS.find(a => a.id === (profile?.avatarId || row.avatarId));

  const accuracyPct = row.predictionsCount > 0
    ? Math.round((row.resultCount / row.predictionsCount) * 100)
    : 0;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" style={{ maxWidth: 620 }}>
        <button className="modal-close" onClick={onClose} aria-label="סגור">✕</button>

        <header className="modal-header" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <AvatarDisplay avatarId={row.avatarId} size={80} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>
              {row.displayName}
              {isMe && <span className="chip chip-strong" style={{ marginInlineStart: 8, fontSize: 11 }}>אתה</span>}
              {profile?.managed && <span className="chip" style={{ marginInlineStart: 6, fontSize: 10 }}>חשבון פנימי</span>}
            </h2>
            <div className="muted" style={{ marginTop: 4 }}>
              מקום <strong style={{ color: "var(--accent)" }}>#{row.rank}</strong> · {row.totalPoints} נקודות
            </div>
            {avatarInfo && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {avatarInfo.flag} <strong>{avatarInfo.name}</strong> · {avatarInfo.era}
                {avatarInfo.signature && <> · <em>{avatarInfo.signature}</em></>}
              </div>
            )}
            {profile?.joinedAt && (
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                📅 חבר מאז {new Date(profile.joinedAt).toLocaleDateString("he-IL")}
              </div>
            )}
            {profile?.bio && (
              <div style={{
                marginTop: 6, padding: "6px 10px",
                background: "var(--bg-elev)", borderRadius: 8,
                fontSize: 12, fontStyle: "italic",
              }}>
                "{profile.bio}"
              </div>
            )}
          </div>
        </header>

        {/* Stat tiles */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
          marginTop: 16,
        }}>
          <StatTile
            icon="🏆"
            value={row.totalPoints}
            label="סך נקודות"
            tooltip="סך כל הנקודות שצברת מניחושים, כולל בונוסי סטריק."
            big
          />
          <StatTile
            icon="📊"
            value={`${accuracyPct}%`}
            label={`דיוק (${row.resultCount}/${row.predictionsCount})`}
            tooltip="אחוז הניחושים שבהם ניחשת נכון מי מנצח (או תיקו) מתוך כלל הניחושים שכבר הסתיימו."
          />
          <StatTile
            icon="🎯"
            value={row.exactCount}
            label="מדויקים"
            tooltip="ניחושים שבהם פגעת בתוצאה המדויקת של המשחק — אותם שערים בדיוק לכל קבוצה. שווה 7 נקודות למשחק (כפול ממשחק עם תוצאה נכונה בלבד)."
          />
          <StatTile
            icon="🔥"
            value={row.streak}
            label="סטריק"
            tooltip="הרצף הארוך ביותר של ניחושים נכונים ברצף. כל ניחוש נכון בתוך רצף שווה נקודת בונוס נוספת. הרצף נשבר כשמפספסים."
          />
          <StatTile
            icon="✅"
            value={row.resultCount}
            label="תוצאות נכונות"
            tooltip="ניחושים שבהם ניחשת נכון מי ניצח (או תיקו), גם אם לא פגעת בתוצאה המדויקת. שווה 3 נקודות (או 4 אם גם הפרש השערים מדויק; בתיקו אין בונוס הפרש)."
          />
          <StatTile
            icon="📝"
            value={row.predictionsCount}
            label="סך הניחושים"
            tooltip="כל הניחושים ששמרת עד עתה (כולל אלו שעוד לא הסתיימו)."
          />
        </div>

        {/* Explanation of scoring */}
        <details style={{
          marginTop: 16, padding: 10,
          background: "var(--bg-elev)",
          border: "1px solid var(--border-soft)",
          borderRadius: 10,
          fontSize: 12, lineHeight: 1.7,
        }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>💡 איך נצברות נקודות?</summary>
          <div style={{ marginTop: 8 }}>
            <strong>שלב הבתים:</strong><br/>
            • 🎯 <strong>פגיעה + תוצאה</strong> (3:1 — 3:1): <strong>7 נק׳</strong><br/>
            • ✅ <strong>פגיעה + הפרש שערים</strong> (3:1 — 2:0): <strong>4 נק׳</strong><br/>
            • ✅ <strong>פגיעה</strong> (3:1 — 4:2): <strong>3 נק׳</strong><br/>
            • 🤝 <strong>תיקו</strong> (1:1 — 2:2): <strong>3 נק׳</strong> (אין בונוס הפרש שערים בתיקו)<br/>
            • ❌ <strong>פספוס</strong> (3:1 — 1:2): <strong>0 נק׳</strong> (וסטריק נשבר)<br/>
            <br/>
            <strong>שלב הנוקאאוט (אין תיקו — חובה לבחור מי תעלה):</strong><br/>
            • 🎯 <strong>מנצחת + תוצאת 90 דק׳ מדויקת</strong>: <strong>8 נק׳</strong><br/>
            • ✅ <strong>מנצחת + הפרש שערים נכון</strong>: <strong>5 נק׳</strong><br/>
            • ✅ <strong>מנצחת בלבד</strong>: <strong>3 נק׳</strong><br/>
            • ❌ <strong>מנצחת לא נכונה</strong>: <strong>0 נק׳</strong><br/>
            • 🔥 <strong>בונוס סטריק</strong>: כל ניחוש נכון ברצף = +1 נק׳ נוספת
          </div>
        </details>

        {/* Recent predictions */}
        {myPreds.length > 0 && (
          <>
            <h3 className="sec-title" style={{ marginTop: 18, fontSize: 14 }}>
              🔮 ניחושים אחרונים ({myPreds.length})
            </h3>
            <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {myPreds.slice(0, 20).map(p => {
                const home = TEAMS[p.home] || { name: p.home, flag: "❓" };
                const away = TEAMS[p.away] || { name: p.away, flag: "❓" };
                return (
                  <div key={p.matchId} style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto 1fr",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    background: "var(--bg-elev)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}>
                    <span style={{ textAlign: "start" }}>
                      {home.flag} {home.name}
                    </span>
                    <span style={{ fontWeight: 800, color: p.pred?.hidden ? "var(--text-muted)" : "var(--accent)" }}>
                      {p.pred?.hidden
                        ? "🔒"
                        : `${p.pred?.homeScore} : ${p.pred?.awayScore}`}
                    </span>
                    <span style={{ textAlign: "end" }}>
                      {away.name} {away.flag}
                    </span>
                  </div>
                );
              })}
              {myPreds.length > 20 && (
                <div className="muted" style={{ fontSize: 11, textAlign: "center", padding: 6 }}>
                  + עוד {myPreds.length - 20} ניחושים…
                </div>
              )}
            </div>
          </>
        )}

        <div className="mc-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  icon, value, label, tooltip, big = false,
}: { icon: string; value: any; label: string; tooltip: string; big?: boolean }) {
  return (
    <div
      title={tooltip}
      style={{
        background: big ? "linear-gradient(135deg, var(--primary), var(--primary-2))" : "var(--bg-elev)",
        color: big ? "#fff" : "var(--text)",
        border: `1px solid ${big ? "var(--primary)" : "var(--border)"}`,
        borderRadius: 12,
        padding: "10px 12px",
        textAlign: "center",
        cursor: "help",
        position: "relative",
      }}
    >
      <div style={{ fontSize: 12, opacity: big ? 0.9 : 0.7 }}>{icon} {label}</div>
      <div style={{ fontSize: big ? 28 : 22, fontWeight: 900, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
        {value}
      </div>
      <div style={{
        position: "absolute", top: 4, insetInlineEnd: 6,
        fontSize: 10, color: big ? "rgba(255,255,255,0.6)" : "var(--text-muted)",
      }} aria-hidden>ⓘ</div>
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
  /* Admins see all predictions unredacted (server marks `hidden: false` on them),
   * so if nothing is hidden treat the row as visible regardless of timing. */
  const allRevealed = row.predictions.every(p => !p.hidden);
  const visibleNow = row.visible || msToVisibility <= 0 || allRevealed;
  const fmtCountdown = () => {
    const total = Math.max(0, Math.floor(msToVisibility / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}ש׳ ${m}ד׳`;
    return `${m}ד׳ ${String(s).padStart(2, "0")}ש׳`;
  };

  const isKnockout = row.stage !== "GROUP";
  const stageLabel = (STAGES as any)[row.stage]?.name || row.stage;

  return (
    <div className="fr-match-block">
      <header className="fr-match-header" onClick={onOpen} style={{ cursor: "pointer" }}>
        <div className="fr-teams">
          <span className="chip chip-stage" style={{ marginInlineEnd: 8 }}>
            {stageLabel}{row.group ? ` · בית ${row.group}` : ""}
          </span>
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
        {row.predictions.map(p => {
          /* Render the predicted winner for KO matches (real team code → flag+name). */
          const winnerTeam = p.predictedWinner ? (TEAMS as any)[p.predictedWinner] : null;
          return (
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
                    {p.auto && <span title="ניחוש אוטומטי" className="fr-tag">🤖</span>}
                    {isKnockout && p.predictedWinner && (
                      <span className="fr-pred-winner" title="הקבוצה שעולה לדעתו">
                        ⚽ {winnerTeam?.flag || ""} {winnerTeam?.name || p.predictedWinner}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        {!row.predictions.length && (
          <div className="muted" style={{ padding: 8 }}>טרם נחתמו ניחושים.</div>
        )}
      </div>
    </div>
  );
}
