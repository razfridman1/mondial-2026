"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { MATCHES } from "@/lib/data";
import { applyOverride } from "@/lib/utils";
import { effectiveUtc } from "@/lib/sim";
import { PredictionRow, type MatchResult } from "./PredictionRow";

const GRACE_MS = 5 * 60 * 1000;   // show for 5 min after saving
const NEXT_DAYS = 7;               // look ahead window

/* =====================================================================
 * OpenPredictionsTab — upcoming matches the user hasn't predicted yet.
 *
 * Logic:
 *   SHOW  a match when: no prediction exists, OR prediction was just
 *         saved within the last 5 minutes (so the user sees the "saved"
 *         feedback before the row vanishes).
 *   HIDE  a match when: prediction exists AND was saved > 5 min ago
 *         (or existed before this tab was opened).
 * ===================================================================*/
export default function OpenPredictionsTab() {
  const user       = useStore(s => s.user);
  const predictions = useStore(s => s.predictions);
  const overrides  = useStore(s => s.overrides);
  const simConfig  = useStore(s => s.simConfig);

  const [now, setNow]     = useState(() => Date.now());
  const [results, setResults] = useState<Record<string, MatchResult>>({});

  // matchId -> timestamp when user saved a prediction in THIS session
  const [recentlySaved, setRecentlySaved] = useState<Record<string, number>>({});

  // Track which matchIds already had a prediction when the tab mounted,
  // so we never show a 5-min grace for pre-existing predictions.
  const predAtMountRef = useRef<Set<string>>(new Set(Object.keys(predictions)));

  // Clock: tick every 10 s (enough granularity for 5-min grace)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  // Cleanup expired grace entries
  useEffect(() => {
    const expired = Object.entries(recentlySaved)
      .filter(([, ts]) => now - ts >= GRACE_MS)
      .map(([id]) => id);
    if (!expired.length) return;
    setRecentlySaved(prev => {
      const next = { ...prev };
      for (const id of expired) delete next[id];
      return next;
    });
  }, [now, recentlySaved]);

  // Load match results for scoring display
  useEffect(() => {
    let cancelled = false;
    fetch("/api/match-results")
      .then(r => r.ok ? r.json() : {})
      .then(data => { if (!cancelled) setResults(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const openMatches = useMemo(() => {
    const cutoff = now + NEXT_DAYS * 24 * 60 * 60 * 1000;
    const allMatches = MATCHES.map(m => applyOverride(m, overrides[m.id]));
    return allMatches.filter(m => {
      const startMs = new Date(effectiveUtc(m.utc, simConfig)).getTime();
      const lockAt  = startMs - 3 * 60 * 1000;
      // Must not be locked yet
      if (now >= lockAt) return false;
      // Must be within the look-ahead window
      if (startMs > cutoff) return false;
      // Skip placeholder slots
      if (m.homeIsPlaceholder || m.awayIsPlaceholder) return false;
      const hasPred = !!predictions[m.id];
      if (!hasPred) return true;
      // If the prediction existed before this tab was opened — hide it
      if (predAtMountRef.current.has(m.id)) return false;
      // If saved in this session — show during grace period
      const savedAt = recentlySaved[m.id];
      return !!savedAt && (now - savedAt < GRACE_MS);
    });
  }, [resolvedMatches, predictions, recentlySaved, now, simConfig]);

  function handleSaved(matchId: string) {
    // Only grant grace to matches that were unpredicted when tab opened
    if (!predAtMountRef.current.has(matchId)) {
      setRecentlySaved(prev => ({ ...prev, [matchId]: Date.now() }));
    }
  }

  if (!user) {
    return (
      <section className="mypred">
        <div className="empty-state" style={{ padding: "60px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔐</div>
          <div>יש להתחבר כדי לנחש</div>
        </div>
      </section>
    );
  }

  const graceCount = Object.keys(recentlySaved).length;

  return (
    <section className="mypred">
      <div style={{ padding: "12px 16px 4px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 17 }}>✏️ ניחושים פתוחים</span>
        {openMatches.length > 0 && (
          <span className="chip chip-soft">
            {openMatches.length} משחקים ממתינים
          </span>
        )}
        {graceCount > 0 && (
          <span className="chip chip-soft" style={{ color: "var(--green)", fontSize: 12 }}>
            ✅ {graceCount} נשמרו — ייעלמו בעוד כמה דקות
          </span>
        )}
      </div>

      <div className="mypred-list">
        {openMatches.length === 0 ? (
          <div className="empty-state" style={{ padding: "60px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
              מילאת את כל הניחושים לשבוע הקרוב!
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              כשיתווספו משחקים חדשים לטווח של 7 הימים הקרובים — הם יופיעו כאן
            </div>
          </div>
        ) : (
          openMatches.map(m => (
            <PredictionRow
              key={m.id}
              match={m}
              prediction={predictions[m.id]}
              result={results[m.id]}
              now={now}
              onSaved={() => handleSaved(m.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}
