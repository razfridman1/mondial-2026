"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import { MATCHES, TEAMS, STAGES, VENUES } from "@/lib/data";
import { applyOverride, formatIsraelDate, formatIsraelTime, matchLiveStatus } from "@/lib/utils";
import { effectiveUtc } from "@/lib/sim";
import { scorePrediction } from "@/lib/scoring";
import { resolveAllStages, stageComplete } from "@/lib/bracket";
import type { StageId, Match, LeaderRow } from "@/lib/types";
import { AvatarDisplay } from "./AvatarPicker";

/* ===================================================================
 * "הניחושים שלי" — central hub for the user's tournament predictions
 * =================================================================== */

const LOCK_MIN = 3;
const STAGE_ORDER: StageId[] = ["GROUP", "R32", "R16", "QF", "SF", "THIRD", "FINAL"];

const LS_STAGE = "mondial26.mypredictions.stage";
const LS_GROUP = "mondial26.mypredictions.groupLetter";

type MatchResult = { home: number; away: number; finishedAt: number };

export default function MyPredictionsTab() {
  const user = useStore(s => s.user);
  const profile = useStore(s => s.profile);
  const predictions = useStore(s => s.predictions);
  const overrides = useStore(s => s.overrides);
  const simConfig = useStore(s => s.simConfig);
  const groups = useStore(s => s.groups);
  const currentGroupId = useStore(s => s.currentGroupId);
  const setCurrentGroup = useStore(s => s.setCurrentGroup);
  const refreshGroups = useStore(s => s.refreshGroups);

  const [stage, setStage] = useState<StageId>("GROUP");
  const [groupLetter, setGroupLetter] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [results, setResults] = useState<Record<string, MatchResult>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [now, setNow] = useState(Date.now());

  /* Restore last position from localStorage on first client mount.
   * Done in useEffect (not useState init) to avoid SSR/CSR hydration mismatch. */
  useEffect(() => {
    try {
      const s = localStorage.getItem(LS_STAGE);
      if (s && STAGE_ORDER.includes(s as StageId)) setStage(s as StageId);
      const g = localStorage.getItem(LS_GROUP);
      if (g) setGroupLetter(g);
    } catch {}
    setRestored(true);
  }, []);

  /* Persist last position whenever stage/group changes (but only after restore). */
  useEffect(() => {
    if (!restored) return;
    try { localStorage.setItem(LS_STAGE, stage); } catch {}
  }, [stage, restored]);
  useEffect(() => {
    if (!restored) return;
    try {
      if (groupLetter) localStorage.setItem(LS_GROUP, groupLetter);
      else localStorage.removeItem(LS_GROUP);
    } catch {}
  }, [groupLetter, restored]);

  useEffect(() => { refreshGroups(); }, [refreshGroups]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  /* Load results + leaderboard */
  async function load() {
    try {
      const [rRes, lbRes] = await Promise.all([
        fetch("/api/match-results"),
        fetch(currentGroupId ? `/api/leaderboard?groupId=${currentGroupId}` : "/api/leaderboard"),
      ]);
      if (rRes.ok) setResults(await rRes.json());
      if (lbRes.ok) setLeaderboard(await lbRes.json());
    } catch {}
  }
  useEffect(() => { load(); }, [currentGroupId, user?.uid]);
  useEffect(() => {
    /* Reduced from 30s → 120s to lower Firestore read pressure. */
    const id = setInterval(load, 120000);
    return () => clearInterval(id);
  }, [currentGroupId]);

  /* Effective matches (with sim overrides), then ENHANCE knockout placeholders
   * with resolved team codes from the bracket — once the previous stage is fully
   * complete (FIFA rule: next stage opens only when all previous-stage results are in). */
  const resolved = useMemo(() => resolveAllStages(results), [results]);

  const matches = useMemo(
    () => MATCHES.map(m => {
      const eff = applyOverride(m, overrides[m.id]);
      const base = { ...eff, utc: effectiveUtc(eff.utc, simConfig) };
      /* For knockouts, if the resolver returned real team codes (i.e. the
       * previous stage has all results), swap placeholders for real codes. */
      if (m.stage !== "GROUP") {
        const r = resolved[m.id];
        if (r) {
          const homeIsReal = !!TEAMS[r.home];
          const awayIsReal = !!TEAMS[r.away];
          if (homeIsReal || awayIsReal) {
            return {
              ...base,
              home: homeIsReal ? r.home : base.home,
              away: awayIsReal ? r.away : base.away,
              homeIsPlaceholder: !homeIsReal,
              awayIsPlaceholder: !awayIsReal,
            };
          }
        }
      }
      return base;
    }),
    [overrides, simConfig, resolved]
  );

  /* Matches grouped by stage */
  const byStage = useMemo(() => {
    const map: Record<StageId, Match[]> = {
      GROUP: [], R32: [], R16: [], QF: [], SF: [], THIRD: [], FINAL: [],
    };
    matches.forEach(m => { map[m.stage].push(m); });
    Object.values(map).forEach(arr => arr.sort((a, b) => +new Date(a.utc) - +new Date(b.utc)));
    return map;
  }, [matches]);

  /* Available (non-placeholder) match count per stage.
   * Now reflects FIFA gating: a knockout stage stays "locked" until the
   * previous stage is fully completed and the resolver has populated real teams. */
  const stageAvail = useMemo(() => {
    const out: Record<StageId, { open: number; total: number; locked: boolean }> = {} as any;
    STAGE_ORDER.forEach(s => {
      const arr = byStage[s] || [];
      const open = arr.filter(m => !m.homeIsPlaceholder && !m.awayIsPlaceholder).length;
      out[s] = { open, total: arr.length, locked: arr.length > 0 && open === 0 };
    });
    return out;
  }, [byStage]);

  /* Currently selected stage matches, optionally filtered by group letter */
  const visibleMatches = useMemo(() => {
    const arr = byStage[stage] || [];
    if (stage === "GROUP" && groupLetter) {
      return arr.filter(m => m.group === groupLetter);
    }
    return arr;
  }, [byStage, stage, groupLetter]);

  /* User stats */
  const myRow = useMemo(
    () => leaderboard.find(r => r.uid === user?.uid),
    [leaderboard, user?.uid]
  );

  const totalAvailable = useMemo(
    () => matches.filter(m => !m.homeIsPlaceholder && !m.awayIsPlaceholder).length,
    [matches]
  );
  const myPredCount = useMemo(() => {
    return matches.filter(m =>
      !m.homeIsPlaceholder && !m.awayIsPlaceholder && predictions[m.id]
    ).length;
  }, [matches, predictions]);
  const completionPct = totalAvailable ? Math.round((myPredCount / totalAvailable) * 100) : 0;

  /* Accuracy: % of FINISHED predictions that earned at least 3 pts */
  const accuracy = useMemo(() => {
    let total = 0, hit = 0;
    Object.values(predictions).forEach(p => {
      const r = results[p.matchId];
      if (!r) return;
      total++;
      const match = MATCHES.find(m => m.id === p.matchId);
      const isKO = match ? match.stage !== "GROUP" : false;
      const sc = scorePrediction({
        predictedHome: p.homeScore, predictedAway: p.awayScore,
        actualHome: r.home, actualAway: r.away,
        predictedWinner: (p as any).predictedWinner ?? null,
        actualWinner:    (r as any).winner ?? null,
        isKnockout: isKO,
      });
      if (sc.points > 0) hit++;
    });
    return { total, hit, pct: total ? Math.round((hit / total) * 100) : 0 };
  }, [predictions, results]);

  /* Gap to #1 in the group leaderboard */
  const gapToFirst = useMemo(() => {
    if (!myRow || !leaderboard.length) return null;
    const top = leaderboard[0];
    if (!top || top.uid === myRow.uid) return 0;
    return top.totalPoints - myRow.totalPoints;
  }, [leaderboard, myRow]);

  /* Auto-select first group letter when stage changes to GROUP.
   * Waits for `restored` so it doesn't overwrite a localStorage-restored letter. */
  useEffect(() => {
    if (!restored) return;
    if (stage !== "GROUP") { setGroupLetter(null); return; }
    if (!groupLetter) {
      const groups = [...new Set((byStage.GROUP || []).map(m => m.group).filter(Boolean))] as string[];
      setGroupLetter(groups[0] || null);
    }
  }, [stage, restored]);

  const groupLetters = useMemo(() => {
    return [...new Set((byStage.GROUP || []).map(m => m.group).filter(Boolean))].sort() as string[];
  }, [byStage.GROUP]);

  /* ---------- Render ---------- */

  if (!user) {
    return (
      <section className="mypred-empty">
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔮</div>
        <h2>הניחושים שלי</h2>
        <p className="muted">היכנס כדי לראות ולנהל את הניחושים שלך לכל הטורניר.</p>
        <Link className="btn btn-primary" href="/login">כניסה</Link>
      </section>
    );
  }

  return (
    <section className="mypred">
      {/* ============ HERO ============ */}
      <div className="mypred-hero">
        <div className="mypred-hero-left">
          <AvatarDisplay avatarId={profile?.avatarId || "messi"} size={64} />
          <div className="mypred-hero-meta">
            <div className="mypred-hero-name">{profile?.displayName || user.email}</div>
            <div className="muted mypred-hero-sub">
              {groups.length > 0 ? (
                <select
                  className="mypred-group-pick"
                  value={currentGroupId || ""}
                  onChange={e => setCurrentGroup(e.target.value || null)}
                >
                  <option value="">🌍 דירוג גלובלי</option>
                  {groups.map(g => <option key={g.id} value={g.id}>👥 {g.name}</option>)}
                </select>
              ) : (
                <span>🌍 דירוג גלובלי</span>
              )}
            </div>
          </div>
        </div>

        <div className="mypred-stats">
          <StatTile icon="🏆" value={myRow?.totalPoints ?? 0} label="נקודות" big />
          <StatTile icon="#"  value={myRow?.rank ? `#${myRow.rank}` : "—"} label="מקום" />
          <StatTile icon="🎯" value={`${accuracy.pct}%`} label={`דיוק (${accuracy.hit}/${accuracy.total})`} />
          <StatTile icon="🔥" value={myRow?.streak ?? 0} label="סטריק" />
          <StatTile icon="🎯" value={myRow?.exactCount ?? 0} label="מדויקים" />
        </div>

        {/* Completion bar */}
        <div className="mypred-progress">
          <div className="mypred-progress-row">
            <span>התקדמות ניחושים</span>
            <strong>{myPredCount}/{totalAvailable} ({completionPct}%)</strong>
          </div>
          <div className="mypred-progress-bar"><div style={{ width: `${completionPct}%` }} /></div>
        </div>

        {gapToFirst !== null && gapToFirst > 0 && (
          <div className="mypred-gap muted">
            ⚡ {gapToFirst} נקודות מהמקום הראשון בקבוצה
          </div>
        )}
      </div>

      {/* ============ MINI LEADERBOARDS — one per group, side by side ============ */}
      {groups.length === 1 && leaderboard.length > 1 && (
        <div className="mypred-mini-lb">
          <h3>🏅 מובילים בקבוצה</h3>
          <div className="mypred-mini-rows">
            {leaderboard.slice(0, 5).map((r, i) => (
              <div key={r.uid} className={`mypred-mini-row ${r.uid === user.uid ? "is-me" : ""}`}>
                <span className={`mypred-mini-rank rank-${i + 1}`}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                <AvatarDisplay avatarId={r.avatarId} size={28} />
                <span className="mypred-mini-name">{r.displayName}{r.uid === user.uid && " (אני)"}</span>
                <span className="mypred-mini-pts">{r.totalPoints}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {groups.length > 1 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 10,
        }}>
          {groups.map(g => (
            <MiniGroupLeaderboard key={g.id} groupId={g.id} groupName={g.name} myUid={user.uid} />
          ))}
        </div>
      )}

      {/* ============ STAGE NAV ============ */}
      <div className="mypred-stage-nav">
        {STAGE_ORDER.map(s => {
          const info = stageAvail[s];
          const isLocked = info.locked;
          /* Diagnostic: count how many previous-stage results are still missing */
          const PREV: Record<string, StageId | null> = {
            GROUP: null, R32: "GROUP", R16: "R32", QF: "R16", SF: "QF", THIRD: "SF", FINAL: "SF",
          };
          const prev = PREV[s];
          let lockReason = "";
          if (isLocked && prev) {
            const prevMatches = MATCHES.filter(m => m.stage === prev);
            const missing = prevMatches.filter(m => !results[m.id]).length;
            lockReason = missing > 0
              ? `חסרות ${missing}/${prevMatches.length} תוצאות ב‑${STAGES[prev].name}`
              : "ממתין לחישוב — נסה לרענן";
          }
          return (
            <button
              key={s}
              className={`mypred-stage-btn ${stage === s ? "on" : ""} ${isLocked ? "locked" : ""}`}
              onClick={() => !isLocked && setStage(s)}
              disabled={isLocked}
              title={isLocked ? `🔒 ${lockReason}` : ""}
            >
              <span className="mypred-stage-name">{STAGES[s].name}</span>
              <span className="mypred-stage-count">
                {isLocked ? "🔒" : `${info.open}`}
              </span>
            </button>
          );
        })}
      </div>

      {/* ============ GROUP LETTER NAV ============ */}
      {stage === "GROUP" && groupLetters.length > 0 && (
        <div className="mypred-groups-nav">
          {groupLetters.map(g => (
            <button
              key={g}
              className={`mypred-group-btn ${groupLetter === g ? "on" : ""}`}
              onClick={() => setGroupLetter(g)}
            >
              בית {g}
            </button>
          ))}
        </div>
      )}

      {/* ============ MATCHES ============ */}
      <div className="mypred-list">
        {visibleMatches.length === 0 ? (
          <div className="empty-state">
            {stageAvail[stage].locked
              ? `🔒 שלב ${STAGES[stage].name} ייפתח כשהקבוצות ייקבעו`
              : "אין משחקים להציג."}
          </div>
        ) : (
          visibleMatches.map(m => (
            <PredictionRow
              key={m.id}
              match={m}
              prediction={predictions[m.id]}
              result={results[m.id]}
              now={now}
              onSaved={() => load()}
            />
          ))
        )}
      </div>
    </section>
  );
}

/* ===================================================================
 * Stat tile
 * =================================================================== */
/* ===================================================================
 * MiniGroupLeaderboard — small leaderboard for a specific group,
 * shown side-by-side with siblings when user is in multiple groups.
 * =================================================================== */
function MiniGroupLeaderboard({
  groupId, groupName, myUid,
}: { groupId: string; groupName: string; myUid: string }) {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [peek, setPeek] = useState<LeaderRow | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/leaderboard?groupId=${groupId}`);
        if (r.ok) setRows(await r.json());
      } finally { setLoading(false); }
    })();
  }, [groupId]);

  const myRow = rows.find(r => r.uid === myUid);

  return (
    <div className="mypred-mini-lb" style={{ minWidth: 0 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span>🏅 {groupName}</span>
        {myRow?.rank && (
          <span className="chip chip-soft" style={{ fontSize: 11 }}>
            אתה #{myRow.rank}
          </span>
        )}
      </h3>
      {loading && !rows.length ? (
        <div className="muted" style={{ fontSize: 12 }}>…טוען</div>
      ) : rows.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>אין נתונים עדיין.</div>
      ) : (
        <div className="mypred-mini-rows">
          {rows.slice(0, 5).map((r, i) => (
            <div
              key={r.uid}
              className={`mypred-mini-row ${r.uid === myUid ? "is-me" : ""}`}
              onClick={() => setPeek(r)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter") setPeek(r); }}
              style={{ cursor: "pointer" }}
              title="לחץ לפרטים מלאים"
            >
              <span className={`mypred-mini-rank rank-${i + 1}`}>
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
              </span>
              <AvatarDisplay avatarId={r.avatarId} size={28} />
              <span className="mypred-mini-name">{r.displayName}{r.uid === myUid && " (אני)"}</span>
              <span className="mypred-mini-pts">{r.totalPoints}</span>
            </div>
          ))}
        </div>
      )}
      {peek && <ProfilePeekModal row={peek} isMe={peek.uid === myUid} onClose={() => setPeek(null)} />}
    </div>
  );
}

/* ===================================================================
 * ProfilePeekModal — quick user details (name, avatar, joined, stats)
 * triggered from the mini leaderboards.
 * =================================================================== */
function ProfilePeekModal({
  row, isMe, onClose,
}: { row: LeaderRow; isMe: boolean; onClose: () => void }) {
  const [profile, setProfile] = useState<any>(null);
  useEffect(() => {
    (async () => {
      try {
        const { getUserDoc } = await import("@/lib/firebase");
        const p = await getUserDoc<any>(`profiles/${row.uid}`);
        if (p) setProfile(p);
      } catch {}
    })();
  }, [row.uid]);

  const { AVATARS } = require("@/lib/avatars");
  const avatarInfo = AVATARS.find((a: any) => a.id === (profile?.avatarId || row.avatarId));
  const accuracyPct = row.predictionsCount > 0
    ? Math.round((row.resultCount / row.predictionsCount) * 100)
    : 0;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" style={{ maxWidth: 480 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <header className="modal-header" style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <AvatarDisplay avatarId={row.avatarId} size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>
              {row.displayName}
              {isMe && <span className="chip chip-strong" style={{ marginInlineStart: 6, fontSize: 10 }}>אתה</span>}
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
              }}>"{profile.bio}"</div>
            )}
          </div>
        </header>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
          gap: 8, marginTop: 16,
        }}>
          <StatTile icon="🏆" value={row.totalPoints} label="נקודות" big />
          <StatTile icon="📊" value={`${accuracyPct}%`} label="דיוק" />
          <StatTile icon="🎯" value={row.exactCount} label="מדויקים" />
          <StatTile icon="🔥" value={row.streak} label="סטריק" />
          <StatTile icon="✅" value={`${row.resultCount}/${row.predictionsCount}`} label="תוצאות" />
        </div>

        <div className="mc-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
}

function StatTile({ icon, value, label, big = false }: { icon: string; value: any; label: string; big?: boolean }) {
  return (
    <div className={`mypred-stat ${big ? "is-big" : ""}`}>
      <div className="mypred-stat-top">
        <span className="mypred-stat-icon">{icon}</span>
        <span className="mypred-stat-val">{value}</span>
      </div>
      <div className="mypred-stat-lbl">{label}</div>
    </div>
  );
}

/* ===================================================================
 * Single match prediction row — inline score input with autosave
 * =================================================================== */
function PredictionRow({
  match, prediction, result, now, onSaved,
}: {
  match: Match;
  prediction: any;
  result: MatchResult | undefined;
  now: number;
  onSaved: () => void;
}) {
  const setPrediction = useStore(s => s.setPrediction);
  const home = TEAMS[match.home] || { code: match.home, name: match.home, flag: "❓" };
  const away = TEAMS[match.away] || { code: match.away, name: match.away, flag: "❓" };
  const venue = VENUES[match.venue] || { name: "" };
  const isPlaceholder = match.homeIsPlaceholder || match.awayIsPlaceholder;
  const status = matchLiveStatus(match);
  const startMs = new Date(match.utc).getTime();
  const lockAt = startMs - LOCK_MIN * 60 * 1000;
  const locked = now >= lockAt;
  const minsToLock = Math.max(0, Math.floor((lockAt - now) / 60000));

  const [h, setH] = useState<string>(prediction?.homeScore != null ? String(prediction.homeScore) : "");
  const [a, setA] = useState<string>(prediction?.awayScore != null ? String(prediction.awayScore) : "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (prediction) {
      setH(String(prediction.homeScore));
      setA(String(prediction.awayScore));
    }
  }, [prediction?.homeScore, prediction?.awayScore]);

  async function save(newH: string, newA: string) {
    const hi = parseInt(newH, 10);
    const ai = parseInt(newA, 10);
    if (Number.isNaN(hi) || Number.isNaN(ai) || hi < 0 || ai < 0 || hi > 20 || ai > 20) return;
    if (prediction && hi === prediction.homeScore && ai === prediction.awayScore) return;
    setSaveState("saving");
    setErrMsg(null);
    try {
      await setPrediction(match.id, hi, ai, false);
      setSaveState("saved");
      onSaved();
      setTimeout(() => setSaveState("idle"), 1500);
    } catch (e: any) {
      setSaveState("error");
      setErrMsg(e.message || "שגיאה");
    }
  }

  /* Debounced autosave when both inputs are valid */
  useEffect(() => {
    if (locked || isPlaceholder) return;
    if (h === "" || a === "") return;
    if (prediction && Number(h) === prediction.homeScore && Number(a) === prediction.awayScore) return;
    const id = setTimeout(() => save(h, a), 700);
    return () => clearTimeout(id);
  }, [h, a]);

  /* Score breakdown if match finished */
  const score = useMemo(() => {
    if (!result || !prediction) return null;
    const isKO = match.stage !== "GROUP";
    return scorePrediction({
      predictedHome: prediction.homeScore,
      predictedAway: prediction.awayScore,
      actualHome: result.home, actualAway: result.away,
      predictedWinner: (prediction as any).predictedWinner ?? null,
      actualWinner:    (result as any).winner ?? null,
      isKnockout: isKO,
    });
  }, [result, prediction, match.stage]);

  /* ----- placeholder match ----- */
  if (isPlaceholder) {
    return (
      <div className="mypred-row mypred-row-locked">
        <div className="mypred-row-head">
          <span className="muted">{formatIsraelDate(match.utc, { short: true })} · {formatIsraelTime(match.utc)}</span>
          <span className="chip chip-soft">{STAGES[match.stage].name}</span>
        </div>
        <div className="mypred-row-teams muted" style={{ textAlign: "center", padding: "16px 0" }}>
          🔒 ימולא לאחר סיום השלב הקודם
        </div>
      </div>
    );
  }

  /* ----- finished match — show result + score breakdown ----- */
  if (result) {
    const hitClass = score && score.points > 0 ? "is-hit" : prediction ? "is-miss" : "is-noPred";
    return (
      <div className={`mypred-row mypred-row-finished ${hitClass}`}>
        <div className="mypred-row-head">
          <span className="muted">{formatIsraelDate(match.utc, { short: true })} · {formatIsraelTime(match.utc)}</span>
          <span className="badge badge-finished">הסתיים</span>
        </div>
        <div className="mypred-row-teams">
          <div className="mypred-team">
            <span className="flag">{home.flag}</span>
            <span className="team-name">{home.name}</span>
          </div>
          <div className="mypred-score-final">
            <strong>{result.home}</strong>
            <span className="mypred-dash">:</span>
            <strong>{result.away}</strong>
          </div>
          <div className="mypred-team mypred-team-away">
            <span className="team-name">{away.name}</span>
            <span className="flag">{away.flag}</span>
          </div>
        </div>
        {prediction ? (
          <div className="mypred-result-row">
            <span className="mypred-result-label">
              {prediction.auto ? "🤖 ניחוש אוטומטי:" : "🔮 ניחשת:"}
            </span>
            <span className="mypred-result-pred">{prediction.homeScore} : {prediction.awayScore}</span>
            <span className={`mypred-result-pts ${score!.points > 0 ? "pos" : "zero"}`}>
              ניקוד: {score!.points}
            </span>
            <span className="mypred-result-tag">
              {score!.exact
                ? "🎯 פגיעה + תוצאה"
                : score!.resultCorrect
                  ? (score!.diffCorrect ? "✅ פגיעה + הפרש שערים" : "✅ פגיעה")
                  : "❌ פספוס"}
            </span>
          </div>
        ) : (
          <div className="mypred-result-row muted">לא הוזן ניחוש למשחק הזה</div>
        )}
      </div>
    );
  }

  /* ----- upcoming / live / pregame match — show inline input ----- */
  return (
    <div className={`mypred-row ${locked ? "mypred-row-locked" : ""} ${status === "live" ? "mypred-row-live" : ""}`}>
      <div className="mypred-row-head">
        <span className="muted">{formatIsraelDate(match.utc, { short: true })} · {formatIsraelTime(match.utc)}</span>
        {status === "live"    && <span className="badge badge-live">🔴 שידור חי</span>}
        {status === "pregame" && <span className="badge badge-pregame">קדם-משחק</span>}
        {!locked && minsToLock <= 60 && minsToLock > 0 && (
          <span className="chip chip-strong">⚠ נעילה בעוד {minsToLock} דק׳</span>
        )}
        {match.group && <span className="chip chip-soft">בית {match.group}</span>}
        {venue.name && <span className="muted" style={{ fontSize: 11 }}>🏟️ {venue.name}</span>}
      </div>

      <div className="mypred-row-teams">
        <div className="mypred-team">
          <span className="flag">{home.flag}</span>
          <span className="team-name">{home.name}</span>
        </div>

        <div className="mypred-score-input">
          <input
            type="number" inputMode="numeric" min={0} max={20}
            value={h}
            disabled={locked}
            onChange={e => setH(e.target.value)}
            aria-label={`שערי ${home.name}`}
          />
          <span className="mypred-dash">:</span>
          <input
            type="number" inputMode="numeric" min={0} max={20}
            value={a}
            disabled={locked}
            onChange={e => setA(e.target.value)}
            aria-label={`שערי ${away.name}`}
          />
        </div>

        <div className="mypred-team mypred-team-away">
          <span className="team-name">{away.name}</span>
          <span className="flag">{away.flag}</span>
        </div>
      </div>

      <div className="mypred-row-foot">
        {locked ? (
          <span className="pred-msg is-locked" style={{ margin: 0 }}>
            🔒 נעול{prediction ? ` · נשמר: ${prediction.homeScore}:${prediction.awayScore}` : " · לא הוזן"}
            {prediction?.auto && " 🤖"}
          </span>
        ) : (
          <>
            {saveState === "saving" && <span className="mypred-save-state">💾 שומר…</span>}
            {saveState === "saved"  && <span className="mypred-save-state is-ok">✓ נשמר</span>}
            {saveState === "error"  && <span className="mypred-save-state is-err">⚠ {errMsg}</span>}
            {saveState === "idle"   && prediction && (
              <span className="muted mypred-save-state">ניתן לעדכן עד {LOCK_MIN} דק׳ לפני הפתיחה</span>
            )}
            {saveState === "idle"   && !prediction && (h === "" || a === "") && (
              <span className="muted mypred-save-state">הזן ניחוש — נשמר אוטומטית</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
