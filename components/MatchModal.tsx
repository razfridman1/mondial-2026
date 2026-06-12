"use client";
import { useEffect, useState } from "react";
import { TEAMS, VENUES, CHANNELS, STAGES } from "@/lib/data";
import { useStore } from "@/lib/store";
import { formatIsraelDate, formatIsraelTime, oddsToProbabilities } from "@/lib/utils";
import { effMatch } from "@/lib/sim";
import { useOddsMap } from "@/lib/useOddsMap";
import { MATCHES } from "@/lib/data";
import { shareToWhatsApp, matchShareText } from "@/lib/share";
import { getFirebase } from "@/lib/firebase";
import { scorePrediction } from "@/lib/scoring";
import type { TeamLineup } from "@/lib/lineups";
import Countdown from "./Countdown";
import PredictionForm from "./PredictionForm";
import Pitch from "./Pitch";
import { AvatarDisplay } from "./AvatarPicker";

interface PreviewEntry { text: string; generatedAt: number; matchUtc: string }
interface SummaryEntry { text: string; generatedAt: number }
interface FriendPrediction {
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

export default function MatchModal({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const overrides = useStore(s => s.overrides);
  const simConfig = useStore(s => s.simConfig);
  const matchResults = useStore(s => s.matchResults);
  const predictions = useStore(s => s.predictions);
  const user = useStore(s => s.user);
  const currentGroupId = useStore(s => s.currentGroupId);
  const groups = useStore(s => s.groups);
  const [lineups, setLineups] = useState<{ home: TeamLineup; away: TeamLineup } | null>(null);
  const [lineupSource, setLineupSource] = useState<"not_published" | "live" | "placeholder">("not_published");
  const [preview, setPreview] = useState<PreviewEntry | null>(null);
  const [summary, setSummary] = useState<SummaryEntry | null>(null);
  const [friendPreds, setFriendPreds] = useState<FriendPrediction[] | null>(null);

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

  /* Friends' predictions for finished matches — shown permanently on the
   * match card (never hidden/cleared) so group members can compare guesses
   * once the result is in. Reuses /api/group-predictions, scoped to the
   * currently-selected group. */
  useEffect(() => {
    if (!hasResult || !currentGroupId || !user) { setFriendPreds(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await getFirebase().auth!.currentUser!.getIdToken();
        const r = await fetch(`/api/group-predictions?groupId=${currentGroupId}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!r.ok) throw new Error();
        const data = await r.json();
        const row = (data.rows || []).find((x: any) => x.matchId === matchId);
        if (!cancelled) setFriendPreds(row?.predictions || []);
      } catch {
        if (!cancelled) setFriendPreds(null);
      }
    })();
    return () => { cancelled = true; };
  }, [matchId, hasResult, currentGroupId, user?.uid]);

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
  const currentGroup = groups.find(g => g.id === currentGroupId);

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

        {hasResult && friendPreds && friendPreds.length > 0 && (
          <section className="modal-section">
            <h3>🔮 מה החברים ניחשו{currentGroup ? ` · ${currentGroup.name}` : ""}</h3>
            <div className="fr-preds-grid">
              {friendPreds.map(p => {
                const sc = (p.homeScore != null && p.awayScore != null) ? scorePrediction({
                  predictedHome: p.homeScore, predictedAway: p.awayScore,
                  actualHome: matchResults[matchId].home, actualAway: matchResults[matchId].away,
                  predictedWinner: p.predictedWinner ?? null,
                  actualWinner: matchResults[matchId].winner ?? null,
                  isKnockout: m.stage !== "GROUP",
                }) : null;
                return (
                  <div key={p.uid} className={`fr-pred ${p.isSelf ? "is-self" : ""}`}>
                    <AvatarDisplay avatarId={p.avatarId} size={32} />
                    <div className="fr-pred-name">
                      <div>{p.displayName}</div>
                      {p.isSelf && <span className="chip" style={{ fontSize: 9 }}>אתה</span>}
                    </div>
                    <div className="fr-pred-score">
                      {p.homeScore != null && p.awayScore != null ? (
                        <>
                          <strong>{p.homeScore} : {p.awayScore}</strong>
                          {p.auto && <span title="ניחוש אוטומטי" className="fr-tag">🤖</span>}
                          {sc && <span className="fr-pred-points" style={{ color: sc.points > 0 ? "var(--green)" : "var(--text-muted)" }}>
                            {sc.exact ? "🎯 " : ""}{sc.points} נק׳
                          </span>}
                        </>
                      ) : (
                        <span className="muted">לא ניחש</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
