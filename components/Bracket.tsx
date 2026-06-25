"use client";
/* ================================================================
 * Bracket.tsx — LIVE knockout bracket driven by TheSportsDB API.
 *
 * Data layer : /api/bracket (server-side, 2-min cache)
 * UI layer   : this component
 *
 * STRICT: only renders what the API returns.
 * No hardcoded bracket structure. No resolveAllStages. No MATCHES.
 * Missing slots → "לא זמין עדיין" (Not available yet).
 * ================================================================ */

import { useEffect, useState, useCallback } from "react";
import { TEAMS } from "@/lib/data";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import type { BracketData, BracketMatch, BracketRound } from "@/app/api/bracket/route";

// ---- Status helpers ----------------------------------------------

function isFinished(status: string) {
  return ["FT", "AET", "AP"].includes(status.toUpperCase());
}
function isLive(status: string) {
  return ["1H", "HT", "2H", "ET", "P", "BT"].includes(status.toUpperCase());
}
function statusLabel(status: string): string {
  switch (status.toUpperCase()) {
    case "1H": return "מחצית 1";
    case "HT": return "הפסקה";
    case "2H": return "מחצית 2";
    case "ET": return "הארכה";
    case "P":  return "פנדלים";
    case "FT":
    case "AET":
    case "AP": return "הסתיים";
    default:   return "";
  }
}

// ---- Sub-components ---------------------------------------------

function TeamRow({
  teamName,
  teamCode,
  score,
  isWinner,
}: {
  teamName: string | null;
  teamCode: string | null;
  score: number | null;
  isWinner: boolean;
}) {
  const team = teamCode ? TEAMS[teamCode] : null;
  const flag  = team?.flag ?? (teamCode ? "🏳" : "❓");
  const name  = team?.name ?? teamName ?? "לא זמין עדיין";
  const tbd   = !teamName;

  return (
    <div className={`brv-team-row${isWinner ? " brv-winner-row" : ""}${tbd ? " brv-tbd" : ""}`}>
      <span className="brv-flag">{flag}</span>
      <span className="brv-name">{name}</span>
      {score !== null && (
        <span className={`brv-score${isWinner ? " brv-score-win" : ""}`}>{score}</span>
      )}
    </div>
  );
}

function MatchCard({ match }: { match: BracketMatch }) {
  const done  = isFinished(match.status);
  const live  = isLive(match.status);
  const label = statusLabel(match.status);

  // Determine winner
  let homeWins = false;
  let awayWins = false;
  if (done && match.homeScore !== null && match.awayScore !== null) {
    homeWins = match.homeScore > match.awayScore;
    awayWins = match.awayScore > match.homeScore;
  }

  // Date/time display (treat TSDB timestamp as UTC)
  let dateStr = "";
  let timeStr = "";
  if (match.timestamp) {
    const utc = match.timestamp.endsWith("Z")
      ? match.timestamp
      : match.timestamp + "Z";
    try {
      dateStr = formatIsraelDate(utc, { short: true });
      timeStr = formatIsraelTime(utc);
    } catch {
      dateStr = match.timestamp.slice(0, 10);
    }
  }

  const noData = !match.homeTeam && !match.awayTeam;

  return (
    <div className={`brv-match${done ? " brv-match-done" : live ? " brv-match-live" : ""}`}>
      {/* Status badge */}
      {live && (
        <div className="brv-badge brv-badge-live">
          <span className="mt-live-dot" aria-hidden /> {label}
        </div>
      )}
      {done && <div className="brv-badge brv-badge-done">{label}</div>}
      {!live && !done && match.status === "NS" && label === "" && null}

      {noData ? (
        <div className="brv-not-available">לא זמין עדיין</div>
      ) : (
        <div className="brv-teams">
          <TeamRow
            teamName={match.homeTeam}
            teamCode={match.homeCode}
            score={match.homeScore}
            isWinner={homeWins}
          />
          <TeamRow
            teamName={match.awayTeam}
            teamCode={match.awayCode}
            score={match.awayScore}
            isWinner={awayWins}
          />
        </div>
      )}

      {/* Date / venue meta */}
      <div className="brv-meta">
        {dateStr && (
          <span className="brv-meta-date">
            {dateStr}{timeStr ? ` · ${timeStr}` : ""}
          </span>
        )}
        {(match.venue || match.city) && (
          <span className="brv-meta-venue">
            🏟 {[match.venue, match.city].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}

// Group matches into pairs for bracket arms
function groupIntoPairs<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
}

function RoundColumn({ round, isLast }: { round: BracketRound; isLast: boolean }) {
  const pairs = groupIntoPairs(round.matches);

  return (
    <div className={`brv-col${isLast ? " brv-col-last" : ""}`}>
      <h4 className="brv-col-title">{round.title}</h4>
      <div className="brv-pairs">
        {pairs.map((pair, pi) => (
          <div key={pi} className={`brv-pair${!isLast && pair.length === 2 ? " brv-pair-connectable" : ""}`}>
            {pair.map((m, mi) => (
              <MatchCard key={m.idEvent ?? `${pi}-${mi}`} match={m} />
            ))}
            {/* If odd match in last pair, show empty slot */}
            {pair.length === 1 && round.matches.length % 2 === 1 && (
              <div className="brv-match brv-match-empty">
                <div className="brv-not-available">לא זמין עדיין</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Main component ---------------------------------------------

const REFRESH_INTERVAL = 60 * 1000; // re-fetch every 60s

export default function Bracket() {
  const [data, setData]     = useState<BracketData | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/bracket", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: BracketData = await res.json();
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [load]);

  // --- Loading ---
  if (loading) {
    return (
      <div className="brv-state">
        <div className="brv-spinner" aria-label="טוען..." />
        <p>טוען שלב נוקאאוט...</p>
      </div>
    );
  }

  // --- Error ---
  if (error) {
    return (
      <div className="brv-state brv-state-error">
        <p>⚠️ {error}</p>
        <button className="brv-retry-btn" onClick={load}>נסה שוב</button>
      </div>
    );
  }

  // --- No data yet ---
  if (!data || data.rounds.length === 0) {
    return (
      <div className="brv-state">
        <p className="brv-empty-title">🏆 שלב הנוקאאוט</p>
        <p className="muted">
          {!data
            ? "לא ניתן לטעון נתונים מה-API"
            : "משחקי שלב הנוקאאוט טרם פורסמו ב-API"}
        </p>
        <p className="muted" style={{ fontSize: 12 }}>
          {data
            ? "הנתונים יעודכנו אוטומטית ברגע שיפורסמו"
            : "ודא ש-FOOTBALL_API_KEY ו-FOOTBALL_API_URL מוגדרים ב-Vercel"}
        </p>
      </div>
    );
  }

  // --- Bracket ---
  return (
    <div className="brv-root" dir="rtl">
      <div className="brv-scroll">
        {data.rounds.map((round, idx) => (
          <RoundColumn
            key={round.name}
            round={round}
            isLast={idx === data.rounds.length - 1}
          />
        ))}
      </div>
      <p className="brv-footer muted">
        מקור: {(data as any).source ?? "API"} · עודכן {new Date(data.fetchedAt).toLocaleTimeString("he-IL")}
      </p>
    </div>
  );
}
