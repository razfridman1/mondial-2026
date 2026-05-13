"use client";
import { useEffect, useState } from "react";
import { TEAMS, VENUES, CHANNELS, STAGES } from "@/lib/data";
import { useStore } from "@/lib/store";
import { formatIsraelDate, formatIsraelTime, oddsToProbabilities } from "@/lib/utils";
import { effMatch } from "@/lib/sim";
import { MATCHES } from "@/lib/data";
import { shareToWhatsApp, matchShareText } from "@/lib/share";
import { buildMatchLineups, type TeamLineup } from "@/lib/lineups";
import Countdown from "./Countdown";
import PredictionForm from "./PredictionForm";
import Pitch from "./Pitch";

export default function MatchModal({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const overrides = useStore(s => s.overrides);
  const simConfig = useStore(s => s.simConfig);
  const [lineups, setLineups] = useState<{ home: TeamLineup; away: TeamLineup } | null>(null);
  const [lineupSource, setLineupSource] = useState<"default" | "live" | "placeholder">("default");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/lineups?matchId=${matchId}`);
        if (!r.ok) throw new Error();
        const data = await r.json();
        if (cancelled) return;
        if (data.lineups) { setLineups(data.lineups); setLineupSource(data.source); }
      } catch {
        const base = MATCHES.find(x => x.id === matchId);
        if (base && !base.homeIsPlaceholder && !base.awayIsPlaceholder) {
          setLineups(buildMatchLineups(base.home, base.away));
          setLineupSource("default");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [matchId]);

  const base = MATCHES.find(m => m.id === matchId);
  if (!base) return null;
  const m = effMatch(base, overrides[matchId], simConfig);
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

        {!m.homeIsPlaceholder && !m.awayIsPlaceholder && lineups && (
          <section className="modal-section">
            <h3>⚽ הרכבים על המגרש
              <span className="muted" style={{ fontSize: 12, marginRight: 8 }}>
                {lineupSource === "live"    ? "(זמן אמת)"
                 : lineupSource === "default"? "(הרכב ברירת מחדל — יתעדכן ביום המשחק)"
                 :                              ""}
              </span>
            </h3>
            <Pitch home={lineups.home} away={lineups.away} />
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
