"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import { TEAMS, STAGES } from "@/lib/data";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import { shareToWhatsApp, weeklyReminderShareText } from "@/lib/share";
import { openLeaderboardShareCard } from "@/lib/share-cards";
import { getUserDoc } from "@/lib/firebase";
import { AVATARS } from "@/lib/avatars";
import { AvatarDisplay } from "./AvatarPicker";
import MatchModal from "./MatchModal";
import { ScoringLegendModal } from "./ScoringLegend";
import { scorePrediction } from "@/lib/scoring";
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
  result?: { home: number; away: number; winner?: string } | null;
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
  const [scope, setScope] = useState<"upcoming" | "finished" | "all">("all");
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
    const scoped = rows.filter(r => {
      const start = new Date(r.utc).getTime();
      /* Matches with a real result (manual or synced) are always
       * "finished", regardless of their effective kickoff time. */
      const isFinished = !!r.result || start < now;
      if (scope === "upcoming") return !isFinished && start > now - 2 * 60 * 60 * 1000; // upcoming + last 2h
      if (scope === "finished") return isFinished;
      return true;
    });

    /* Reorder so the match happening RIGHT NOW (if any) is shown first,
     * then upcoming matches (soonest first), then past matches in
     * reverse-chronological order — scrolling down reaches older
     * matches. `rows` arrives sorted ascending by kickoff time, so the
     * "past" bucket needs to be reversed to put the most recent finished
     * match closest to the live one. */
    const LIVE_WINDOW_MS = 115 * 60 * 1000;
    const live: MatchRow[] = [];
    const upcoming: MatchRow[] = [];
    const past: MatchRow[] = [];
    for (const r of scoped) {
      const start = new Date(r.utc).getTime();
      const isLiveNow = !r.result && now >= start && now <= start + LIVE_WINDOW_MS;
      if (isLiveNow) live.push(r);
      else if (start > now) upcoming.push(r);
      else past.push(r);
    }
    upcoming.sort((a, b) => new Date(a.utc).getTime() - new Date(b.utc).getTime());
    past.sort((a, b) => new Date(b.utc).getTime() - new Date(a.utc).getTime());
    return [...live, ...upcoming, ...past];
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
          <button className={`seg ${scope === "all" ? "on" : ""}`} onClick={() => setScope("all")}>הכול</button>
          <button className={`seg ${scope === "upcoming" ? "on" : ""}`} onClick={() => setScope("upcoming")}>קרובים</button>
          <button className={`seg ${scope === "finished" ? "on" : ""}`} onClick={() => setScope("finished")}>הסתיימו</button>
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
  const [showScoringKey, setShowScoringKey] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

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
            {rows.length > 0 && (
              <button
                className="btn btn-small wa-btn"
                onClick={() => openLeaderboardShareCard(
                  rows,
                  groupId ? groupName.replace(/^[🌍🏆📊]+\s*/, "") : null,
                )}
                title="שתף את לוח התוצאות כתמונה — נראה כמו האתר"
              >
                💬 שתף טבלה
              </button>
            )}
            {rows.length >= 2 && (
              <button
                className="btn btn-small"
                onClick={() => setShowAnalysis(true)}
                title="השווה ניקוד בין שני חברים"
              >
                📊 ניתוח ניקוד
              </button>
            )}
            <button
              className="btn btn-small"
              onClick={() => setShowScoringKey(true)}
              title="איך מחשבים נקודות?"
            >
              🧮 מפתח ניקוד
            </button>
          </div>
        )}
      </div>
      {open && (
        loading && !rows.length
          ? <div className="muted">…טוען</div>
          : <Leaderboard rows={rows} myUid={myUid} predictionRows={predictionRows} />
      )}
      {showScoringKey && <ScoringLegendModal onClose={() => setShowScoringKey(false)} />}
      {showAnalysis && rows.length >= 2 && (
        <ScoreAnalysisModal rows={rows} myUid={myUid} onClose={() => setShowAnalysis(false)} />
      )}
    </div>
  );
}

function Leaderboard({ rows, myUid, predictionRows }: { rows: LeaderRow[]; myUid: string; predictionRows: MatchRow[] }) {
  const [openUser, setOpenUser] = useState<LeaderRow | null>(null);
  if (!rows.length) return <div className="empty-state">אין עדיין נתונים — כשיתחילו המשחקים יופיע leaderboard חי.</div>;
  return (
    <>
      <div className="leaderboard" style={{ overflowX: "auto" }}>
        {/* Header row */}
        <div className="lb-header-row">
          <div></div>
          <div></div>
          <div>שם</div>
          <div className="lb-stat-col">📊<br/>דיוק</div>
          <div className="lb-stat-col">🎯<br/>מדויקים</div>
          <div className="lb-stat-col">⚽<br/>הפרש</div>
          <div className="lb-stat-col">🔥<br/>סטריק</div>
          <div className="lb-stat-col">✅<br/>נכונות</div>
          <div style={{ textAlign: "center" }}>🏆<br/>נק׳</div>
        </div>
        {rows.map(r => {
          const accuracyPct = r.finishedCount > 0
            ? Math.round((r.resultCount / r.finishedCount) * 100)
            : 0;
          return (
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
            <div className="lb-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <div>
                {r.displayName}
                {r.uid === myUid && <span className="chip" style={{ marginInlineStart: 6, fontSize: 9 }}>אתה</span>}
              </div>
            </div>
            <div className="lb-stat-col">{accuracyPct}%</div>
            <div className="lb-stat-col">{r.exactCount}</div>
            <div className="lb-stat-col">{r.differentialCount}</div>
            <div className="lb-stat-col">{r.streak}</div>
            <div className="lb-stat-col">{r.resultCount}</div>
            <div className="lb-points">{r.totalPoints}<span className="muted" style={{ fontSize: 11 }}> נק׳</span></div>
          </div>
          );
        })}
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
  /* Pull every prediction this user made from the group-predictions snapshot.
   * Finished matches (with a real result) are shown first — most recent
   * first — so you can immediately see how the user did, followed by
   * upcoming/unresolved predictions (soonest first). */
  const myPreds = useMemo(() => {
    const out: Array<{
      matchId: string; home: string; away: string; utc: string;
      result?: { home: number; away: number; winner?: string } | null;
      isKnockout: boolean;
      pred: PredictionCell | null;
    }> = [];
    for (const mr of predictionRows) {
      const p = mr.predictions.find(x => x.uid === row.uid);
      if (p) out.push({
        matchId: mr.matchId, home: mr.home, away: mr.away, utc: mr.utc,
        result: mr.result, isKnockout: mr.stage !== "GROUP", pred: p,
      });
    }
    const now = Date.now();
    const finished: typeof out = [];
    const upcoming: typeof out = [];
    for (const item of out) {
      const isFinished = !!item.result || new Date(item.utc).getTime() < now;
      (isFinished ? finished : upcoming).push(item);
    }
    finished.sort((a, b) => new Date(b.utc).getTime() - new Date(a.utc).getTime());
    upcoming.sort((a, b) => new Date(a.utc).getTime() - new Date(b.utc).getTime());
    return [...finished, ...upcoming];
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

  const accuracyPct = row.finishedCount > 0
    ? Math.round((row.resultCount / row.finishedCount) * 100)
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
            label={`דיוק (${row.resultCount}/${row.finishedCount})`}
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
            tooltip="הרצף הארוך ביותר של ניחושים נכונים ברצף. החל מהניחוש השני ברצף, כל ניחוש נכון נוסף שווה נקודת בונוס נוספת. הרצף נשבר כשמפספסים."
          />
          <StatTile
            icon="✅"
            value={row.resultCount}
            label="תוצאות נכונות"
            tooltip="ניחושים שבהם ניחשת נכון מי ניצח (או תיקו), גם אם לא פגעת בתוצאה המדויקת. שווה 3 נקודות (או 4 אם גם הפרש השערים מדויק; בתיקו אין בונוס הפרש)."
          />
          <StatTile
            icon="📝"
            value={row.finishedCount}
            label="סך הניחושים"
            tooltip="הניחושים שלך למשחקים שכבר הסתיימו."
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
            • 🔥 <strong>בונוס סטריק</strong>: החל מהניחוש השני ברצף, כל ניחוש נכון נוסף ברצף = +1 נק׳ בונוס
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
                const sc = (p.result && !p.pred?.hidden && p.pred?.homeScore != null && p.pred?.awayScore != null)
                  ? scorePrediction({
                      predictedHome: p.pred.homeScore, predictedAway: p.pred.awayScore,
                      actualHome: p.result.home, actualAway: p.result.away,
                      predictedWinner: p.pred.predictedWinner ?? null,
                      actualWinner: p.result.winner ?? null,
                      isKnockout: p.isKnockout,
                    })
                  : null;
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
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <span style={{ fontWeight: 800, color: p.pred?.hidden ? "var(--text-muted)" : "var(--accent)" }}>
                        {p.pred?.hidden
                          ? "🔒"
                          : `${p.pred?.homeScore} : ${p.pred?.awayScore}`}
                      </span>
                      {p.result && (
                        <span className="muted" style={{ fontSize: 10 }}>
                          תוצאה: {p.result.home} : {p.result.away}
                        </span>
                      )}
                      {sc && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: sc.points > 0 ? "var(--green)" : "var(--text-muted)" }}>
                          {sc.exact ? "🎯 " : ""}{sc.points} נק׳
                        </span>
                      )}
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

/* ===================================================================
 * ScoreAnalysisModal — compare two group members' scoring breakdown
 * =================================================================== */
function ScoreAnalysisModal({
  rows, myUid, onClose,
}: { rows: LeaderRow[]; myUid: string; onClose: () => void }) {
  const [uidA, setUidA] = useState(myUid || rows[0]?.uid || "");
  const [uidB, setUidB] = useState(rows.find(r => r.uid !== uidA)?.uid || "");

  const rowA = rows.find(r => r.uid === uidA) ?? null;
  const rowB = rows.find(r => r.uid === uidB) ?? null;

  const analysis = useMemo(() => {
    if (!rowA || !rowB || rowA.uid === rowB.uid) return null;

    const ptsDiff = rowA.totalPoints - rowB.totalPoints;
    const leader  = ptsDiff >= 0 ? rowA : rowB;
    const trailer = ptsDiff >= 0 ? rowB : rowA;
    const absDiff = Math.abs(ptsDiff);

    const accA = rowA.finishedCount > 0 ? Math.round(rowA.resultCount / rowA.finishedCount * 100) : 0;
    const accB = rowB.finishedCount > 0 ? Math.round(rowB.resultCount / rowB.finishedCount * 100) : 0;

    // Accurate point breakdown per user
    // Group: exact=7, diff=4, plain=3 | KO: exact=8, diff=5, plain=3
    // We approximate group prices (≈7/4/3) — small error only for KO matches
    function calcBreakdown(r: LeaderRow) {
      const plainCorrect = r.resultCount - r.exactCount - (r.differentialCount ?? 0);
      const exactPts  = r.exactCount * 7;
      const diffPts   = (r.differentialCount ?? 0) * 4;
      const plainPts  = plainCorrect * 3;
      const basePts   = exactPts + diffPts + plainPts;
      // streakPts includes streak bonus + any admin bonus awards (absorbed together)
      const streakPts = Math.max(0, r.totalPoints - basePts);
      return { exactPts, diffPts, plainPts, basePts, streakPts, plainCorrect };
    }
    const bdA = calcBreakdown(rowA!);
    const bdB = calcBreakdown(rowB!);

    const diffs = {
      exact:    rowA.exactCount - rowB.exactCount,
      diff:     (rowA.differentialCount ?? 0) - (rowB.differentialCount ?? 0),
      result:   rowA.resultCount - rowB.resultCount,
      streak:   rowA.streak - rowB.streak,
      finished: rowA.finishedCount - rowB.finishedCount,
      exactPts: bdA.exactPts - bdB.exactPts,
      diffPts:  bdA.diffPts  - bdB.diffPts,
      plainPts: bdA.plainPts - bdB.plainPts,
      streakPts:bdA.streakPts- bdB.streakPts,
    };

    const insights: { icon: string; text: string; adv: "a" | "b" | "tie" }[] = [];

    if (diffs.exact !== 0) {
      const who = diffs.exact > 0 ? rowA.displayName : rowB.displayName;
      const adv: "a"|"b" = diffs.exact > 0 ? "a" : "b";
      insights.push({ icon: "🎯", adv,
        text: `ל-${who} יש ${Math.abs(diffs.exact)} פגיעות מדויקות יותר — מוסיף ${Math.abs(diffs.exactPts)} נק׳` });
    }

    if (diffs.diff !== 0) {
      const who = diffs.diff > 0 ? rowA.displayName : rowB.displayName;
      const adv: "a"|"b" = diffs.diff > 0 ? "a" : "b";
      insights.push({ icon: "⚽", adv,
        text: `ל-${who} יש ${Math.abs(diffs.diff)} ניחושים יותר עם הפרש שערים נכון — מוסיף ${Math.abs(diffs.diffPts)} נק׳` });
    }

    if (diffs.plainPts !== 0) {
      const who = diffs.plainPts > 0 ? rowA.displayName : rowB.displayName;
      const adv: "a"|"b" = diffs.plainPts > 0 ? "a" : "b";
      const n = Math.abs(Math.round(diffs.plainPts / 3));
      insights.push({ icon: "✅", adv,
        text: `ל-${who} יש ${n} תוצאות נכונות יותר (ללא בונוסים) — מוסיף ${Math.abs(diffs.plainPts)} נק׳` });
    }

    if (diffs.streakPts !== 0) {
      const who = diffs.streakPts > 0 ? rowA.displayName : rowB.displayName;
      const adv: "a"|"b" = diffs.streakPts > 0 ? "a" : "b";
      insights.push({ icon: "🔥", adv,
        text: `ל-${who} בונוס סטריק גבוה יותר לאורך הטורניר — מוסיף ${Math.abs(diffs.streakPts)} נק׳` });
    }

    if (insights.length === 0 && absDiff === 0) {
      insights.push({ icon: "🤝", adv: "tie", text: "שני החברים עם אותו ניקוד מדויק!" });
    } else if (insights.length === 0) {
      insights.push({ icon: "💡", adv: "tie", text: "כל הנתונים זהים — ייתכן הפרש קטן מבונוסי שלב נוקאאוט (8/5 נק׳ במקום 7/4)" });
    }

    return { leader, trailer, absDiff, ptsDiff, diffs, bdA, bdB, accA, accB, insights, rowA, rowB };
  }, [rowA, rowB]);

  const selectStyle: React.CSSProperties = {
    background: "var(--bg-elev)", border: "1px solid var(--border)",
    color: "var(--text)", borderRadius: 8, padding: "6px 10px",
    fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0,
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" style={{ maxWidth: 560 }}>
        <button className="modal-close" onClick={onClose} aria-label="סגור">✕</button>
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>📊 ניתוח ניקוד</h2>

        {/* Selectors */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
          <select style={selectStyle} value={uidA} onChange={e => setUidA(e.target.value)}>
            {rows.map(r => <option key={r.uid} value={r.uid}>{r.displayName} (#{r.rank})</option>)}
          </select>
          <span style={{ fontWeight: 900, fontSize: 18, color: "var(--text-muted)", flexShrink: 0 }}>מול</span>
          <select style={selectStyle} value={uidB} onChange={e => setUidB(e.target.value)}>
            {rows.filter(r => r.uid !== uidA).map(r => <option key={r.uid} value={r.uid}>{r.displayName} (#{r.rank})</option>)}
          </select>
        </div>

        {analysis && rowA && rowB ? (
          <>
            {/* Points banner */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr auto 1fr",
              gap: 12, alignItems: "center", marginBottom: 20,
              background: "var(--bg-elev)", borderRadius: 12, padding: "14px 16px",
            }}>
              <div style={{ textAlign: "center" }}>
                <AvatarDisplay avatarId={rowA.avatarId} size={44} />
                <div style={{ fontWeight: 800, marginTop: 4, fontSize: 14 }}>{rowA.displayName}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "var(--accent)", marginTop: 2 }}>{rowA.totalPoints}</div>
                <div className="muted" style={{ fontSize: 11 }}>נק׳ · מקום #{rowA.rank}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                {analysis.absDiff === 0 ? (
                  <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text-muted)" }}>שוויון</div>
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>הפרש</div>
                    <div style={{
                      fontSize: 22, fontWeight: 900,
                      color: analysis.ptsDiff >= 0 ? "var(--green)" : "var(--red)",
                    }}>
                      {analysis.ptsDiff > 0 ? "+" : ""}{analysis.ptsDiff}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>נק׳</div>
                  </>
                )}
              </div>
              <div style={{ textAlign: "center" }}>
                <AvatarDisplay avatarId={rowB.avatarId} size={44} />
                <div style={{ fontWeight: 800, marginTop: 4, fontSize: 14 }}>{rowB.displayName}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "var(--accent)", marginTop: 2 }}>{rowB.totalPoints}</div>
                <div className="muted" style={{ fontSize: 11 }}>נק׳ · מקום #{rowB.rank}</div>
              </div>
            </div>

            {/* Stat comparison table */}
            <div style={{ marginBottom: 16 }}>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 80px 80px 80px",
                gap: 8, padding: "6px 10px",
                fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
                borderBottom: "1px solid var(--border-soft)",
              }}>
                <div>קטגוריה</div>
                <div style={{ textAlign: "center" }}>{rowA.displayName.split(" ")[0]}</div>
                <div style={{ textAlign: "center" }}>{rowB.displayName.split(" ")[0]}</div>
                <div style={{ textAlign: "center" }}>הפרש</div>
              </div>
              {[
                { label: "🎯 מדויקים",          a: rowA.exactCount,             b: rowB.exactCount,             suffix: "", pts: true,  ptsA: analysis.bdA.exactPts,   ptsB: analysis.bdB.exactPts  },
                { label: "⚽ הפרש שערים",        a: rowA.differentialCount ?? 0, b: rowB.differentialCount ?? 0, suffix: "", pts: true,  ptsA: analysis.bdA.diffPts,    ptsB: analysis.bdB.diffPts   },
                { label: "✅ תוצאות נכונות",     a: rowA.resultCount - rowA.exactCount - (rowA.differentialCount ?? 0), b: rowB.resultCount - rowB.exactCount - (rowB.differentialCount ?? 0), suffix: "", pts: true, ptsA: analysis.bdA.plainPts, ptsB: analysis.bdB.plainPts },
                { label: "🔥 בונוס סטריק",       a: analysis.bdA.streakPts,      b: analysis.bdB.streakPts,      suffix: " נק׳", pts: false },
                { label: "📊 דיוק",              a: analysis.accA,               b: analysis.accB,               suffix: "%",    pts: false },
                { label: "🏆 סך נקודות",         a: rowA.totalPoints,            b: rowB.totalPoints,            suffix: "",     pts: false },
              ].map(({ label, a, b, suffix, pts, ptsA, ptsB }) => {
                const diff = a - b;
                const ptsDiff2 = pts && ptsA !== undefined && ptsB !== undefined ? ptsA - ptsB : null;
                return (
                  <div key={label} style={{
                    display: "grid", gridTemplateColumns: "1fr 80px 80px 80px",
                    gap: 8, padding: "8px 10px",
                    borderBottom: "1px solid var(--border-soft)",
                    fontSize: 13,
                  }}>
                    <div style={{ fontWeight: 600 }}>{label}</div>
                    <div style={{ textAlign: "center", fontWeight: 800, color: diff > 0 ? "var(--green)" : "var(--text)" }}>
                      {a}{suffix}
                      {pts && ptsA !== undefined && <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>{ptsA} נק׳</div>}
                    </div>
                    <div style={{ textAlign: "center", fontWeight: 800, color: diff < 0 ? "var(--green)" : "var(--text)" }}>
                      {b}{suffix}
                      {pts && ptsB !== undefined && <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>{ptsB} נק׳</div>}
                    </div>
                    <div style={{
                      textAlign: "center", fontWeight: 800,
                      color: diff > 0 ? "var(--green)" : diff < 0 ? "var(--red)" : "var(--text-muted)",
                    }}>
                      {diff === 0 ? "—" : diff > 0 ? `+${diff}${suffix}` : `${diff}${suffix}`}
                      {ptsDiff2 !== null && ptsDiff2 !== 0 && (
                        <div style={{ fontSize: 10, color: ptsDiff2 > 0 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                          {ptsDiff2 > 0 ? `+${ptsDiff2}` : ptsDiff2} נק׳
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Insight bullets */}
            <div style={{
              background: "var(--bg-elev)", borderRadius: 10,
              padding: "12px 14px", fontSize: 13, lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>💡 מה מסביר את ההפרש?</div>
              {analysis.insights.map((ins, i) => (
                <div key={i} style={{ marginBottom: 6, display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ flexShrink: 0 }}>{ins.icon}</span>
                  <span style={{
                    color: ins.adv === "a" ? "var(--green)" : ins.adv === "b" ? "var(--red)" : "var(--text-muted)",
                  }}>{ins.text}</span>
                </div>
              ))}
            </div>
          </>
        ) : rowA?.uid === rowB?.uid ? (
          <div className="empty-state">בחר שני חברים שונים להשוואה</div>
        ) : (
          <div className="empty-state">בחר שני חברים להשוואה</div>
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
  const visibleNow = row.visible || msToVisibility <= 0 || allRevealed || !!row.result;
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
          const sc = (row.result && p.homeScore != null && p.awayScore != null)
            ? scorePrediction({
                predictedHome: p.homeScore, predictedAway: p.awayScore,
                actualHome: row.result.home, actualAway: row.result.away,
                predictedWinner: p.predictedWinner ?? null,
                actualWinner: row.result.winner ?? null,
                isKnockout,
              })
            : null;
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
                    {sc && (
                      <span className="fr-pred-points" style={{ color: sc.points > 0 ? "var(--green)" : "var(--text-muted)" }}>
                        {sc.exact ? "🎯 " : ""}{sc.points} נק׳
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
      {row.result && (
        <div className="muted" style={{ fontSize: 12, padding: "0 8px 8px" }}>

          ⚽ תוצאה סופית: {row.result.home} : {row.result.away}
        </div>
      )}
    </div>
  );
}
