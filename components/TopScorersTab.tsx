"use client";
/* =====================================================================
 * TopScorersTab — "מלך השערים והבישולים"
 *
 * Two live-updating leaderboards (top goal scorers / top assist makers),
 * aggregated server-side from real match data by /api/scorers (polled
 * every 60s, same pattern as StandingsTab/MyTeamsTab).
 *
 * Below the leaderboards: a ONE-TIME pick — each user picks one player
 * they think will end up as the tournament's top scorer, and one for top
 * assists. Once submitted, the pick is permanent (enforced server-side by
 * /api/top-picks) and shown read-only from then on.
 * ===================================================================*/
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { TEAMS } from "@/lib/data";
import { squadFor } from "@/lib/players";
import type { Team } from "@/lib/types";
import type { ScorerEntry } from "@/app/api/scorers/route";

const ALL_TEAMS: Team[] = Object.values(TEAMS).sort((a, b) => a.name.localeCompare(b.name, "he"));

export default function TopScorersTab() {
  const user = useStore(s => s.user);
  const profile = useStore(s => s.profile);
  const liveSquads = useStore(s => s.liveSquads);
  const loadLiveSquads = useStore(s => s.loadLiveSquads);
  const setTopPicks = useStore(s => s.setTopPicks);

  const [topScorers, setTopScorers] = useState<ScorerEntry[]>([]);
  const [topAssists, setTopAssists] = useState<ScorerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const r = await fetch("/api/scorers");
      if (r.ok) {
        const data = await r.json();
        setTopScorers(data.topScorers || []);
        setTopAssists(data.topAssists || []);
      }
    } catch {}
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = setInterval(load, 60000); // near real-time refresh
    return () => clearInterval(id);
  }, []);

  useEffect(() => { loadLiveSquads(); }, [loadLiveSquads]);

  return (
    <section className="topscorers-tab">
      <h2 className="sec-title">⚽🎯 מלך השערים והבישולים</h2>
      <p className="muted" style={{ marginTop: 4, marginBottom: 16, fontSize: 13 }}>
        טבלאות השערים והבישולים מתעדכנות אוטומטית לאחר כל משחק שמסתיים.
        בנוסף, ניתן לבחור פעם אחת בלבד מי לדעתך יהיה מלך השערים ומלך הבישולים של הטורניר — ללא אפשרות לשנות בהמשך.
      </p>

      <div className="topscorers-grid">
        <ScorerTable title="🥇 מלך השערים" countLabel="שערים" rows={topScorers} loading={loading} />
        <ScorerTable title="🎯 מלך הבישולים" countLabel="בישולים" rows={topAssists} loading={loading} />
      </div>

      <TopPicksPanel
        user={user}
        profile={profile}
        liveSquads={liveSquads}
        setTopPicks={setTopPicks}
      />
    </section>
  );
}

/* ---------------------------------------------------------------------
 * Leaderboard table — ranked descending by count, ties broken by name
 * (already sorted server-side by /api/scorers).
 * ------------------------------------------------------------------- */
function ScorerTable({ title, countLabel, rows, loading }: {
  title: string;
  countLabel: string;
  rows: ScorerEntry[];
  loading: boolean;
}) {
  return (
    <div className="stnd-card topscorers-card">
      <header className="stnd-card-head">
        <h3>{title}</h3>
      </header>
      <div className="stnd-table-wrap">
        <table className="stnd-table">
          <thead>
            <tr>
              <th className="stnd-th-pos">#</th>
              <th className="stnd-th-team">שחקן</th>
              <th>נבחרת</th>
              <th className="stnd-th-points">{countLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const team = r.teamCode ? TEAMS[r.teamCode] : null;
              return (
                <tr key={`${r.teamCode || ""}-${r.name}-${i}`} className="stnd-row">
                  <td className="stnd-pos"><span className="stnd-pos-num">{i + 1}</span></td>
                  <td className="stnd-team"><span className="stnd-name">{r.name}</span></td>
                  <td style={{ textAlign: "center" }}>
                    {team ? <>{team.flag} {team.name}</> : "—"}
                  </td>
                  <td style={{ textAlign: "center", fontWeight: 800, color: "var(--accent)" }}>{r.count}</td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 16 }}>
                אין עדיין נתונים — הטבלה תתמלא אוטומטית עם סיום משחקים
              </td></tr>
            )}
            {loading && (
              <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 16 }}>טוען...</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
 * One-time pick panel.
 * ------------------------------------------------------------------- */
function TopPicksPanel({ user, profile, liveSquads, setTopPicks }: {
  user: ReturnType<typeof useStore.getState>["user"];
  profile: ReturnType<typeof useStore.getState>["profile"];
  liveSquads: Record<string, import("@/lib/players").Player[]>;
  setTopPicks: ReturnType<typeof useStore.getState>["setTopPicks"];
}) {
  const [scorerTeam, setScorerTeam] = useState("");
  const [scorerPlayer, setScorerPlayer] = useState("");
  const [assistTeam, setAssistTeam] = useState("");
  const [assistPlayer, setAssistPlayer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scorerSquad = useMemo(() => scorerTeam ? squadFor(scorerTeam, liveSquads) : [], [scorerTeam, liveSquads]);
  const assistSquad = useMemo(() => assistTeam ? squadFor(assistTeam, liveSquads) : [], [assistTeam, liveSquads]);

  if (!user) {
    return (
      <div className="topscorers-pick-panel">
        <h3>🔮 הניחוש שלי</h3>
        <p className="muted">היכנס כדי לבחור (פעם אחת בלבד) מי יהיה מלך השערים ומלך הבישולים של הטורניר.</p>
        <Link className="btn btn-primary" href="/login">כניסה</Link>
      </div>
    );
  }

  const existingScorer = profile?.topScorerPick;
  const existingAssist = profile?.topAssistPick;

  if (existingScorer && existingAssist) {
    const scorerTeamInfo = TEAMS[existingScorer.teamCode];
    const assistTeamInfo = TEAMS[existingAssist.teamCode];
    return (
      <div className="topscorers-pick-panel">
        <h3>🔮 הניחוש שלי (חד-פעמי — לא ניתן לשנות)</h3>
        <div className="topscorers-pick-result">
          <div>
            <span className="muted">מלך השערים: </span>
            <strong>{existingScorer.playerName}</strong>
            {scorerTeamInfo && <span> ({scorerTeamInfo.flag} {scorerTeamInfo.name})</span>}
          </div>
          <div>
            <span className="muted">מלך הבישולים: </span>
            <strong>{existingAssist.playerName}</strong>
            {assistTeamInfo && <span> ({assistTeamInfo.flag} {assistTeamInfo.name})</span>}
          </div>
        </div>
      </div>
    );
  }

  async function submit() {
    if (!scorerTeam || !scorerPlayer || !assistTeam || !assistPlayer) {
      setError("יש לבחור נבחרת ושחקן עבור שני הניחושים");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setTopPicks(
        { teamCode: scorerTeam, playerName: scorerPlayer },
        { teamCode: assistTeam, playerName: assistPlayer },
      );
    } catch (e: any) {
      setError(e.message || "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="topscorers-pick-panel">
      <h3>🔮 הניחוש שלי</h3>
      <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        בחירה חד-פעמית — לאחר השליחה לא ניתן לשנות.
      </p>
      <div className="topscorers-pick-form">
        <div className="topscorers-pick-row">
          <span className="topscorers-pick-label">מלך השערים:</span>
          <select value={scorerTeam} onChange={e => { setScorerTeam(e.target.value); setScorerPlayer(""); }}>
            <option value="">בחר נבחרת</option>
            {ALL_TEAMS.map(t => <option key={t.code} value={t.code}>{t.flag} {t.name}</option>)}
          </select>
          <select value={scorerPlayer} onChange={e => setScorerPlayer(e.target.value)} disabled={!scorerTeam}>
            <option value="">בחר שחקן</option>
            {scorerSquad.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </div>
        <div className="topscorers-pick-row">
          <span className="topscorers-pick-label">מלך הבישולים:</span>
          <select value={assistTeam} onChange={e => { setAssistTeam(e.target.value); setAssistPlayer(""); }}>
            <option value="">בחר נבחרת</option>
            {ALL_TEAMS.map(t => <option key={t.code} value={t.code}>{t.flag} {t.name}</option>)}
          </select>
          <select value={assistPlayer} onChange={e => setAssistPlayer(e.target.value)} disabled={!assistTeam}>
            <option value="">בחר שחקן</option>
            {assistSquad.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? "שומר..." : "שלח ניחוש (חד-פעמי)"}
        </button>
      </div>
    </div>
  );
}
