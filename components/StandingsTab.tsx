"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { MATCHES, STAGES } from "@/lib/data";
import {
  computeGroupStandings,
  listGroupLetters,
  listKnockoutMatches,
  type TeamStanding,
  type MatchResult,
  type KnockoutMatchView,
} from "@/lib/standings";
import { applyOverride, formatIsraelDate, formatIsraelTime, matchLiveStatus } from "@/lib/utils";
import { effectiveUtc } from "@/lib/sim";
import type { StageId } from "@/lib/types";
import MatchModal from "./MatchModal";

const STAGE_ORDER: StageId[] = ["GROUP", "R32", "R16", "QF", "SF", "THIRD", "FINAL"];

/* ===================================================================
 * StandingsTab — Enterprise-grade tournament standings & knockout view
 * =================================================================== */
export default function StandingsTab() {
  const overrides = useStore(s => s.overrides);
  const simConfig = useStore(s => s.simConfig);

  const [stage, setStage] = useState<StageId>("GROUP");
  const [results, setResults] = useState<Record<string, MatchResult>>({});
  const [now, setNow] = useState(Date.now());
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /* Load match results from server */
  async function load() {
    try {
      const r = await fetch("/api/match-results");
      if (r.ok) setResults(await r.json());
    } catch {}
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = setInterval(load, 60000);  /* live realtime refresh */
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  /* Stage filter: count of matches per stage */
  const stageCounts = useMemo(() => {
    const out: Record<StageId, { total: number; finished: number }> = {} as any;
    for (const s of STAGE_ORDER) {
      const ms = MATCHES.filter(m => m.stage === s);
      out[s] = { total: ms.length, finished: ms.filter(m => results[m.id]).length };
    }
    return out;
  }, [results]);

  const groupLetters = useMemo(() => listGroupLetters(), []);

  return (
    <section className="standings">
      <h2 className="sec-title">📊 טבלאות</h2>
      <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
        טבלאות הבתים ושלבי הנוקאאוט מתעדכנות אוטומטית מתוצאות המשחקים.
      </p>

      {/* Stage filter */}
      <div className="stnd-stage-nav">
        {STAGE_ORDER.map(s => {
          const c = stageCounts[s];
          return (
            <button
              key={s}
              className={`stnd-stage-btn ${stage === s ? "on" : ""}`}
              onClick={() => setStage(s)}
            >
              <span>{STAGES[s].name}</span>
              <span className="stnd-stage-meta">
                {c.finished}/{c.total}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="muted" style={{ padding: 20 }}>טוען נתונים…</div>
      ) : stage === "GROUP" ? (
        <div className="stnd-groups-grid">
          {groupLetters.map(letter => (
            <GroupCard
              key={letter}
              letter={letter}
              results={results}
              now={now}
              onOpenMatch={(id) => setOpenMatchId(id)}
            />
          ))}
        </div>
      ) : (
        <KnockoutView
          stage={stage}
          results={results}
          onOpenMatch={(id) => setOpenMatchId(id)}
        />
      )}

      {openMatchId && (
        <MatchModal matchId={openMatchId} onClose={() => setOpenMatchId(null)} />
      )}
    </section>
  );
}

/* ===================================================================
 * GroupCard — single group's standings table
 * =================================================================== */
function GroupCard({
  letter, results, now, onOpenMatch,
}: {
  letter: string;
  results: Record<string, MatchResult>;
  now: number;
  onOpenMatch: (id: string) => void;
}) {
  const standings = useMemo(() => computeGroupStandings(letter, results), [letter, results]);

  /* Are any matches live? */
  const hasLive = useMemo(() => {
    const groupMatches = MATCHES.filter(m => m.stage === "GROUP" && m.group === letter);
    return groupMatches.some(m => matchLiveStatus(m) === "live");
  }, [letter, now]);

  return (
    <div className={`stnd-card ${hasLive ? "is-live" : ""}`}>
      <header className="stnd-card-head">
        <h3>בית {letter}</h3>
        {hasLive && <span className="stnd-live-badge">🔴 LIVE</span>}
      </header>

      <div className="stnd-table-wrap">
        <table className="stnd-table">
          <thead>
            <tr>
              <th className="stnd-th-pos">#</th>
              <th className="stnd-th-team">נבחרת</th>
              <th className="stnd-th-matches">משחקים</th>
              <th className="stnd-th-goals">שערים</th>
              <th className="stnd-th-points">נק׳</th>
            </tr>
          </thead>
          <tbody>
            {standings.map(s => (
              <StandingRow key={s.teamCode} s={s} onOpenMatch={onOpenMatch} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StandingRow({
  s, onOpenMatch,
}: {
  s: TeamStanding;
  onOpenMatch: (id: string) => void;
}) {
  const qualClass =
    s.qualificationStatus === "qualified"   ? "qual-q"  :
    s.qualificationStatus === "third-place" ? "qual-3"  :
    s.qualificationStatus === "eliminated"  ? "qual-e"  : "qual-p";

  const movement =
    s.previousPosition && s.previousPosition !== s.position
      ? (s.previousPosition > s.position ? "up" : "down")
      : null;

  return (
    <tr className={`stnd-row ${qualClass} ${s.position === 1 ? "is-leader" : ""}`}>
      <td className="stnd-pos">
        <div className={`stnd-pos-bar ${qualClass}`} />
        <span className="stnd-pos-num">{s.position}</span>
        {movement === "up"   && <span className="stnd-arrow up" title="עלייה במיקום">▲</span>}
        {movement === "down" && <span className="stnd-arrow down" title="ירידה במיקום">▼</span>}
      </td>
      <td className="stnd-team">
        <span className="stnd-flag">{s.teamFlag}</span>
        <span className="stnd-name">{s.teamName}</span>
      </td>
      <td className="stnd-matches">
        <div className="stnd-chips">
          {s.matches.map(c => (
            <MatchChip key={c.matchId} c={c} onClick={() => onOpenMatch(c.matchId)} />
          ))}
        </div>
      </td>
      <td className="stnd-goals">
        <div className="stnd-goals-main">{s.goalsFor}:{s.goalsAgainst}</div>
        <div className={`stnd-goals-diff ${s.goalDifference > 0 ? "pos" : s.goalDifference < 0 ? "neg" : ""}`}>
          {s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}
        </div>
      </td>
      <td className="stnd-points">
        <strong>{s.points}</strong>
      </td>
    </tr>
  );
}

/* ===================================================================
 * MatchChip — mini visual for a single match in a team's row
 * =================================================================== */
function MatchChip({ c, onClick }: { c: any; onClick: () => void }) {
  if (!c.finished) {
    return (
      <button
        className="stnd-chip stnd-chip-upcoming"
        onClick={onClick}
        title={`עתידי נגד ${c.opponentName}`}
      >
        <span className="stnd-chip-flag">{c.opponentFlag}</span>
        <span className="stnd-chip-result">—</span>
      </button>
    );
  }
  const cls =
    c.result === "W" ? "stnd-chip-w" :
    c.result === "D" ? "stnd-chip-d" :
                       "stnd-chip-l";
  return (
    <button
      className={`stnd-chip ${cls}`}
      onClick={onClick}
      title={`${c.result === "W" ? "ניצחון" : c.result === "D" ? "תיקו" : "הפסד"} ${c.scoreFor}:${c.scoreAgainst} נגד ${c.opponentName}`}
    >
      <span className="stnd-chip-flag">{c.opponentFlag}</span>
      <span className="stnd-chip-result">{c.scoreFor}:{c.scoreAgainst}</span>
    </button>
  );
}

/* ===================================================================
 * KnockoutView — bracket-style match cards for R32 / R16 / QF / SF / FINAL / THIRD
 * =================================================================== */
function KnockoutView({
  stage, results, onOpenMatch,
}: {
  stage: StageId;
  results: Record<string, MatchResult>;
  onOpenMatch: (id: string) => void;
}) {
  const matches = useMemo(() => listKnockoutMatches(stage, results), [stage, results]);

  if (matches.length === 0) {
    return <div className="empty-state">אין משחקים בשלב הזה.</div>;
  }

  const allPlaceholder = matches.every(m => m.homeIsPlaceholder && m.awayIsPlaceholder);

  return (
    <div>
      {allPlaceholder && (
        <div style={{
          padding: 12, marginBottom: 14,
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.3)",
          borderRadius: 10, fontSize: 13,
        }}>
          ⏳ <strong>השלב יתעדכן</strong> אחרי שייקבעו הקבוצות מהשלב הקודם.
        </div>
      )}

      <div className="knockout-grid">
        {matches.map(m => (
          <KnockoutMatchCard key={m.matchId} m={m} onClick={() => onOpenMatch(m.matchId)} />
        ))}
      </div>
    </div>
  );
}

function KnockoutMatchCard({
  m, onClick,
}: {
  m: KnockoutMatchView;
  onClick: () => void;
}) {
  const ph = m.homeIsPlaceholder || m.awayIsPlaceholder;
  return (
    <button
      className={`knockout-card ${ph ? "is-placeholder" : ""} ${m.finished ? "is-finished" : ""}`}
      onClick={onClick}
      title="לחץ לפרטי המשחק"
    >
      <div className="knockout-card-time">
        {formatIsraelDate(m.utc, { short: true })} · {formatIsraelTime(m.utc)}
      </div>
      <div className={`knockout-team ${m.result === "home" ? "is-winner" : ""}`}>
        <span className="knockout-flag">{m.homeFlag}</span>
        <span className="knockout-name">{m.homeName}</span>
        {m.finished && <span className="knockout-score">{m.homeScore}</span>}
      </div>
      <div className={`knockout-team ${m.result === "away" ? "is-winner" : ""}`}>
        <span className="knockout-flag">{m.awayFlag}</span>
        <span className="knockout-name">{m.awayName}</span>
        {m.finished && <span className="knockout-score">{m.awayScore}</span>}
      </div>
      {!m.finished && !ph && (
        <div className="knockout-status">⏰ עתידי</div>
      )}
      {ph && (
        <div className="knockout-status">⏳ ימולא אחרי השלב הקודם</div>
      )}
    </button>
  );
}
