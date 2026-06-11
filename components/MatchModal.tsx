"use client";
import { useEffect, useState } from "react";
import { TEAMS, VENUES, CHANNELS, STAGES } from "@/lib/data";
import { useStore } from "@/lib/store";
import { formatIsraelDate, formatIsraelTime, oddsToProbabilities } from "@/lib/utils";
import { effMatch } from "@/lib/sim";
import { useOddsMap } from "@/lib/useOddsMap";
import { MATCHES } from "@/lib/data";
import { shareToWhatsApp, matchShareText } from "@/lib/share";
import type { TeamLineup } from "@/lib/lineups";
import Countdown from "./Countdown";
import PredictionForm from "./PredictionForm";
import Pitch from "./Pitch";

interface PreviewEntry { text: string; generatedAt: number; matchUtc: string }
interface SummaryEntry { text: string; generatedAt: number }

export default function MatchModal({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const overrides = useStore(s => s.overrides);
  const simConfig = useStore(s => s.simConfig);
  const matchResults = useStore(s => s.matchResults);
  const predictions = useStore(s => s.predictions);
  const [lineups, setLineups] = useState<{ home: TeamLineup; away: TeamLineup } | null>(null);
  const [lineupSource, setLineupSource] = useState<"not_published" | "live" | "placeholder">("not_published");
  const [preview, setPreview] = useState<PreviewEntry | null>(null);
  const [summary, setSummary] = useState<SummaryEntry | null>(null);

  const hasResult = !!matchResults[matchId];
  const hasPrediction = !!predictions[matchId];

  useEffect(() => {
    let cancelled = false;
    fetch("/api/match-previews")
      .then(r => r.ok ? r.json() : {})
      .then((data: Record<string, PreviewEntry>) => {
        if (!cancelled && data?.[matchId]) setPreview(data[matchId]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [matchId]);

  useEffect(() => {
    if (!hasResult || !hasPrediction) return;
    let cancelled = false;
    fetch("/api/match-summaries")
      .then(r => r.ok ? r.json() : {})
      .then((data: Record<string, SummaryEntry>) => {
        if (!cancelled && data?.[matchId]) setSummary(data[matchId]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [matchId, hasResult, hasPrediction]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/lineups?matchId=${matchId}`);
        if (!r.ok) throw new Error();
        const data = await r.json();
        if (cancelled) return;
        setLineups(data.lineups || null);
        setLineupSource(data.source);
      } catch {
        if (!cancelled) { setLineups(null); setLineupSource("not_published"); }
      }
    })();
    return () => { cancelled = true; };
  }, [matchId]);

  const oddsMap = useOddsMap();
  const base = MATCHES.find(m => m.id === matchId);
  if (!base) return null;
  const eff = effMatch(base, overrides[matchId], simConfig);
  const m = { ...eff, odds: oddsMap[matchId] || eff.odds };
  const home = TEAMS[m.home] || { code: m.home, name: m.home, flag: "❓" };
  const away = TEAMS[m.away] || { code: m.away, name: m.away, flag: "❓" };
  const venue = VENUES[m.venue] || { name: m.venue, city: "", country: "", flag: "", capacity: 0 };
  const stage = STAGES[m.stage];
  const channels = (m.channels || []).map(c => CHANNELS[c]).filter(Boolean);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="סגור">✕</button>
        <header className="modal-header">
          <h2>{home.flag} {home.name} <span className="muted">נגד</span> {away.name} {away.flag}</h2>
          <div className="muted">{stage?.name}{m.group ? ` · בית ${m.group}` : ""}</div>
        </header>
        <section className="modal-section">
          <div className="modal-time">
            <div>📅 {formatIsraelDate(m.utc)}</div>
            <div>🕒 {formatIsraelTime(m.utc)} (שעון ישראל)</div>
            <Countdown utc={m.utc} className="modal-cd" />
          </div>
          <div className="modal-venue">
            🏟️ {venue.name}<br />
            📍 {venue.city}, {venue.country} {venue.flag}<br />
            👥 קיבולת: {venue.capacity ? venue.capacity.toLocaleString("he-IL") : "—"}
          </div>
        </section>
        {summary && (
          <section className="modal-section">
            <h3>📊 סיכום וסטטיסטיקות</h3>
            <p style={{ margin: 0, lineHeight: 1.7, whiteSpace: "pre-line" }}>{summary.text}</p>
          </section>
        )}

        {!summary && preview && (
          <section className="modal-section">
            <h3>🔮 סקירת המשחק</h3>
            <p style={{ margin: 0, lineHeight: 1.7, whiteSpace: "pre-line" }}>{preview.text}</p>
          </section>
        )}

        {(() => {
          const p = oddsToProbabilities(m.odds);
          if (!p) return null;
          return (
            <section className="modal-section">
              <h3>📊 הסתברויות לתוצאה</h3>
              <div className="odds">
                <div className="odd"><span className="odd-k">{home.name}</span><span className="odd-v">{p.home}%</span></div>
                <div className="odd"><span className="odd-k">תיקו</span><span className="odd-v">{p.draw}%</span></div>
                <div className="odd"><span className="odd-k">{away.name}</span><span className="odd-v">{p.away}%</span></div>
              </div>
              <PredictionForm match={m} />
            </section>
          );
        })()}

        {!m.odds && (
          <section className="modal-section">
            <h3>🔮 ניחוש תוצאה</h3>
            <PredictionForm match={m} />
          </section>
        )}

        {!m.homeIsPlaceholder && !m.awayIsPlaceholder && (
          <section className="modal-section">
            <h3>⚽ הרכבים על המגרש
              {lineupSource === "live" && (
                <span className="muted" style={{ fontSize: 12, marginRight: 8 }}>(הרכב רשמי שפורסם)</span>
              )}
            </h3>
            {lineupSource === "live" && lineups ? (
              <Pitch home={lineups.home} away={lineups.away} />
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                ⏳ ההרכבים הרשמיים טרם פורסמו. הם יוצגו כאן ברגע שיתפרסמו רשמית, בדרך כלל כשעה לפני תחילת המשחק.
              </p>
            )}
          </section>
        )}

        <section className="modal-section">
          <h3>📤 שיתוף</h3>
          <div className="mc-actions">
            <button className="btn wa-btn" onClick={() => shareToWhatsApp(matchShareText(m))}>
              💬 שתף בווטסאפ
            </button>
            <button className="btn" onClick={async () => {
              const { openShareCard } = await import("@/lib/share-cards");
              openShareCard("match", { match: m });
            }}>
              📷 שתף בסטורי באינסטה
            </button>
          </div>
        </section>
        <section className="modal-section">
          <h3>📺 שידור בישראל</h3>
          <div className="bc-chips">
            {channels.length ? channels.map(c => (
              <span key={c.id} className="channel-chip channel-big is-static" style={{ ["--ch" as any]: c.color }}>
                <span className="channel-logo">{c.logo}</span><span>{c.name}</span><span className="muted">{c.type}</span>
              </span>
            )) : <span className="muted">טרם נקבע</span>}
          </div>
          {m.studioShow && <p>🎬 {m.studioShow}</p>}
          <p className="muted">קדם-משחק מתחיל {m.preGameMinutes} דק׳ לפני שריקת הפתיחה.</p>
        </section>
      </div>
    </div>
  );
}
