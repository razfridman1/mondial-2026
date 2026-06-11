"use client";
/* =====================================================================
 * PlayerCard — modal opened by clicking a player in TeamDossier's
 * "כל השחקנים לפי מיקומים" squad list.
 *
 * For "live" players (id "${teamCode}_${footballDataPersonId}") fetches
 * /api/players/[id], which pulls bio + current-season stats + recent
 * matches from football-data.org (cached server-side). For curated
 * (hand-written) players we already have everything we need locally —
 * no fetch needed.
 * ===================================================================*/
import { useEffect, useState } from "react";
import { teamCodeFromApiName } from "@/lib/team-name-mapper";
import { TEAMS } from "@/lib/data";
import { formatIsraelDate } from "@/lib/utils";
import type { Player } from "@/lib/players";
import type { PersonProfile, PersonSeasonStats } from "@/lib/football-data-api";

const POS_LABEL: Record<string, string> = {
  GK: "🧤 שוער",
  DEF: "🛡️ מגן",
  MID: "⚙️ קשר",
  FWD: "🎯 חלוץ",
};

function flagFor(nationality: string | undefined | null): string {
  const code = teamCodeFromApiName(nationality || "");
  return (code && TEAMS[code]?.flag) || "🌍";
}

function ageFromDob(dob: string | undefined | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const ref = new Date("2026-06-11T00:00:00Z");
  let age = ref.getUTCFullYear() - d.getUTCFullYear();
  const m = ref.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

interface ApiResponse {
  ok: boolean;
  live?: boolean;
  profile?: PersonProfile | null;
  stats?: PersonSeasonStats | null;
  source?: string;
  error?: string;
}

export default function PlayerCard({ player, onClose }: { player: Player; onClose: () => void }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!player.live) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`/api/players/${encodeURIComponent(player.id)}`)
      .then(r => r.json())
      .then((d: ApiResponse) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setErr("שגיאה בטעינת המידע"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [player.id, player.live]);

  const profile = data?.profile;
  const stats = data?.stats;

  const name = player.name; // Hebrew (curated) or English (live)
  const club = profile?.currentTeam?.name || player.club;
  const jersey = profile?.shirtNumber ?? player.jersey;
  const nationality = profile?.nationality;
  const age = ageFromDob(profile?.dateOfBirth) ?? (player.age > 0 ? player.age : null);
  const position = profile?.position;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal player-card-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="סגור">✕</button>

        <div className="player-card-head">
          {profile?.currentTeam?.crest && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.currentTeam.crest} alt="" className="player-card-crest" />
          )}
          <div>
            <h2 className="player-card-name">
              {jersey != null && <span className="player-card-jersey">#{jersey}</span>}
              {name}
              {player.captain && <span title="קפטן" className="dossier-cap"> (C)</span>}
            </h2>
            <div className="muted player-card-sub">
              {POS_LABEL[player.position] || player.position}
              {position ? ` · ${position}` : ""}
              {age != null ? ` · גיל ${age}` : ""}
              {nationality ? ` · ${flagFor(nationality)} ${nationality}` : ""}
            </div>
          </div>
        </div>

        {/* ---------- Club ---------- */}
        <div className="modal-section">
          <h3>🏟️ קבוצה נוכחית</h3>
          {club ? (
            <div>
              <div style={{ fontWeight: 700 }}>{club}</div>
              {profile?.currentTeam?.venue && (
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>אצטדיון: {profile.currentTeam.venue}</div>
              )}
              {profile?.currentTeam?.competitions?.length ? (
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  משחק כרגע ב: {profile.currentTeam.competitions.join(", ")}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="muted">לא ידוע</div>
          )}
        </div>

        {player.description && (
          <div className="modal-section">
            <h3>📝 קצת עליו</h3>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{player.description}</p>
          </div>
        )}

        {/* ---------- Live-only sections ---------- */}
        {player.live && (
          <>
            {loading && (
              <div className="modal-section muted">⏳ טוען נתוני עונה...</div>
            )}
            {!loading && err && (
              <div className="modal-section muted">{err}</div>
            )}
            {!loading && !err && data && !data.ok && (
              <div className="modal-section muted">
                המידע המורחב על השחקן אינו זמין כרגע.
              </div>
            )}
            {!loading && stats && (
              <div className="modal-section">
                <h3>📊 העונה הנוכחית</h3>
                <div className="player-card-stats">
                  <div className="player-card-stat"><strong>{stats.matches}</strong><span className="muted">משחקים</span></div>
                  <div className="player-card-stat"><strong>{stats.goals}</strong><span className="muted">⚽ שערים</span></div>
                  <div className="player-card-stat"><strong>{stats.assists}</strong><span className="muted">🅰️ בישולים</span></div>
                  <div className="player-card-stat"><strong>{stats.minutes}</strong><span className="muted">דקות</span></div>
                  {stats.yellowCards > 0 && (
                    <div className="player-card-stat"><strong>{stats.yellowCards}</strong><span className="muted">🟨 צהובים</span></div>
                  )}
                  {stats.redCards > 0 && (
                    <div className="player-card-stat"><strong>{stats.redCards}</strong><span className="muted">🟥 אדומים</span></div>
                  )}
                </div>
              </div>
            )}
            {!loading && stats?.recent?.length ? (
              <div className="modal-section">
                <h3>📅 משחקים אחרונים</h3>
                <div className="player-card-matches">
                  {stats.recent.map((m, i) => (
                    <div key={i} className="player-card-match">
                      <span className="muted player-card-match-date">{formatIsraelDate(m.date, { short: true })}</span>
                      <span className="player-card-match-teams">{m.home} {m.score} {m.away}</span>
                      <span className="muted player-card-match-comp">{m.competition}</span>
                      {m.scored && <span title="הבקיע">⚽</span>}
                      {m.assisted && <span title="בישל">🅰️</span>}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        {!player.live && (
          <p className="muted dossier-note" style={{ marginTop: 4 }}>
            מידע מורחב (סטטיסטיקות עונה, משחקים אחרונים) זמין כרגע עבור שחקנים שמגיעים מהנתונים הרשמיים בלבד.
          </p>
        )}
      </div>
    </div>
  );
}
