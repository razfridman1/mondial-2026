"use client";
/* =====================================================================
 * TopScorersTab — "מלך השערים והבישולים"
 *
 * Two live-updating leaderboards (top goal scorers / top assist makers),
 * aggregated server-side from real match data by /api/scorers (polled
 * every 60s, same pattern as StandingsTab/MyTeamsTab).
 *
 * Below the leaderboards: each user picks one player they think will end
 * up as the tournament's top scorer, and one for top assists. The pick can
 * be changed freely until the group stage is complete (groupStageComplete,
 * enforced server-side by /api/top-picks); after that it's locked and shown
 * read-only.
 * ===================================================================*/
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { groupStageComplete, stageComplete } from "@/lib/bracket";
import { TEAMS } from "@/lib/data";
import { squadFor } from "@/lib/players";
import { openScorersShareCard } from "@/lib/share-cards";
import { AvatarDisplay } from "./AvatarPicker";
import type { Team, TopPick } from "@/lib/types";
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h2 className="sec-title">⚽🎯 מלך השערים והבישולים</h2>
        <button
          className="btn"
          onClick={() => openScorersShareCard(topScorers, topAssists)}
          disabled={loading}
        >
          📤 שתף בוואטסאפ
        </button>
      </div>
      <p className="muted" style={{ marginTop: 4, marginBottom: 16, fontSize: 13 }}>
        טבלאות השערים והבישולים מתעדכנות אוטומטית לאחר כל משחק שמסתיים.
        ניחוש מלך השערים/בישולים ניתן לשינוי עד סיום שלב הבתים. ניחוש זוכת המונדיאל ניתן לשינוי עד תחילת שלב 8 האחרונות.
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
        topAssists={topAssists}
      />

      <AllPicksTable />
    </section>
  );
}

/* ---------------------------------------------------------------------
 * "הניחושים של כולם" — every user's one-time pick, visible to everyone.
 * Once the tournament is over (every match has a result), ✅/❌ marks show
 * who guessed the real top scorer / top assist correctly.
 * ------------------------------------------------------------------- */
interface AllPicksRow {
  uid: string;
  displayName: string;
  avatarId: string;
  topScorerPick: TopPick | null;
  topAssistPick: TopPick | null;
  championPick: { teamCode: string } | null;
  scorerCorrect: boolean | null;
  assistCorrect: boolean | null;
  championCorrect: boolean | null;
}

function AllPicksTable() {
  const groups = useStore(s => s.groups);
  const currentGroupId = useStore(s => s.currentGroupId);
  const [data, setData] = useState<{ finished: boolean; rows: AllPicksRow[] } | null>(null);

  /* If the user belongs to multiple groups, let them pick which group's
   * picks to view (defaults to their currently-selected group). Users in
   * 0-1 groups never see the selector — single group, or global view. */
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => currentGroupId || "");
  useEffect(() => {
    if (currentGroupId && !selectedGroupId) setSelectedGroupId(currentGroupId);
  }, [currentGroupId, selectedGroupId]);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const q = selectedGroupId ? `?groupId=${selectedGroupId}` : "";
        const r = await fetch(`/api/top-picks/all${q}`);
        if (r.ok) {
          const j = await r.json();
          if (alive) setData(j);
        }
      } catch {}
    }
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [selectedGroupId]);

  return (
    <div className="stnd-card topscorers-card topscorers-allpicks" style={{ marginTop: 16 }}>
      <header className="stnd-card-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h3>👥 הניחושים של כולם</h3>
        {groups.length > 1 && (
          <select
            value={selectedGroupId}
            onChange={e => setSelectedGroupId(e.target.value)}
            style={{ fontSize: 12 }}
          >
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
      </header>
      {data?.finished && (
        <p className="muted" style={{ fontSize: 13, margin: "0 0 8px" }}>
          🏁 הטורניר הסתיים — מי שניחש נכון מסומן ב-✅
        </p>
      )}
      <div className="stnd-table-wrap">
        <table className="stnd-table">
          <thead>
            <tr>
              <th className="stnd-th-team">משתמש</th>
              <th>🥇 מלך השערים</th>
              <th>🎯 מלך הבישולים</th>
              <th>🏆 זוכה</th>
            </tr>
          </thead>
          <tbody>
            {data === null && (
              <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 16 }}>טוען...</td></tr>
            )}
            {data !== null && data.rows.length === 0 && (
              <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 16 }}>
                עדיין אין ניחושים — היו הראשונים לבחור!
              </td></tr>
            )}
            {data?.rows.map(row => {
              const scorerTeam = row.topScorerPick ? TEAMS[row.topScorerPick.teamCode] : null;
              const assistTeam = row.topAssistPick ? TEAMS[row.topAssistPick.teamCode] : null;
              return (
                <tr key={row.uid} className="stnd-row">
                  <td className="stnd-team">
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <AvatarDisplay avatarId={row.avatarId} size={28} />
                      <span className="stnd-name">{row.displayName}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {row.topScorerPick ? (
                      <>
                        {row.topScorerPick.playerName}
                        {scorerTeam && <> ({scorerTeam.flag} {scorerTeam.name})</>}
                        {data.finished && (row.scorerCorrect ? " ✅" : " ❌")}
                      </>
                    ) : "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {row.topAssistPick ? (
                      <>
                        {row.topAssistPick.playerName}
                        {assistTeam && <> ({assistTeam.flag} {assistTeam.name})</>}
                        {data.finished && (row.assistCorrect ? " ✅" : " ❌")}
                      </>
                    ) : "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {row.championPick ? (
                      <>
                        {(() => { const t = TEAMS[row.championPick.teamCode]; return t ? <>{t.flag} {t.name}</> : row.championPick.teamCode; })()}
                        {data.finished && (row.championCorrect ? " ✅" : " ❌")}
                      </>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
function TopPicksPanel({ user, profile, liveSquads, setTopPicks, topAssists }: {
  user: ReturnType<typeof useStore.getState>["user"];
  profile: ReturnType<typeof useStore.getState>["profile"];
  liveSquads: Record<string, import("@/lib/players").Player[]>;
  setTopPicks: ReturnType<typeof useStore.getState>["setTopPicks"];
  topAssists: import("@/app/api/scorers/route").ScorerEntry[];
}) {
  const matchResults = useStore(s => s.matchResults);
  const SCORER_DEADLINE = new Date("2026-06-29T23:59:59+03:00").getTime();
  const locked = Date.now() > SCORER_DEADLINE && groupStageComplete(matchResults);
  const championLocked = stageComplete("R16", matchResults);

  const [scorerTeam, setScorerTeam] = useState("");
  const [scorerPlayer, setScorerPlayer] = useState("");
  const [assistTeam, setAssistTeam] = useState("");
  const [assistPlayer, setAssistPlayer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const existingScorer = profile?.topScorerPick;
  const existingAssist = profile?.topAssistPick;
  const existingChampion = (profile as any)?.championPick;

  const [championTeam, setChampionTeam] = useState(existingChampion?.teamCode || "");

  /* Pre-fill the form with the user's current pick once the profile loads,
   * so editing shows what's already saved. */
  useEffect(() => {
    if (existingScorer) { setScorerTeam(existingScorer.teamCode); setScorerPlayer(existingScorer.playerName); }
    if (existingAssist) { setAssistTeam(existingAssist.teamCode); setAssistPlayer(existingAssist.playerName); }
    if (existingChampion) setChampionTeam(existingChampion.teamCode);
  }, [existingScorer?.teamCode, existingScorer?.playerName, existingAssist?.teamCode, existingAssist?.playerName, existingChampion?.teamCode]);

  const scorerSquad = useMemo(() => scorerTeam ? squadFor(scorerTeam, liveSquads) : [], [scorerTeam, liveSquads]);
  const assistSquad = useMemo(() => assistTeam ? squadFor(assistTeam, liveSquads) : [], [assistTeam, liveSquads]);

  if (!user) {
    return (
      <div className="topscorers-pick-panel">
        <h3>🔮 הניחוש שלי</h3>
        <p className="muted">היכנס כדי לבחור מי יהיה מלך השערים ומלך הבישולים של הטורניר. אפשר להחליף את הבחירה כל עוד שלב הבתים לא הסתיים.</p>
        <Link className="btn btn-primary" href="/login">כניסה</Link>
      </div>
    );
  }

  const scorerTeamInfo = existingScorer ? TEAMS[existingScorer.teamCode] : null;
  const assistTeamInfo = existingAssist ? TEAMS[existingAssist.teamCode] : null;
  const championTeamInfo = existingChampion ? TEAMS[existingChampion.teamCode] : null;

  /* Both scorer/assist AND champion locked — full read-only */
  if (locked && championLocked) {
    return (
      <div className="topscorers-pick-panel">
        <h3>🔮 הניחוש שלי (נעול)</h3>
        <div className="topscorers-pick-result">
          {existingScorer ? (
            <div><span className="muted">מלך השערים: </span><strong>{existingScorer.playerName}</strong>{scorerTeamInfo && <span> ({scorerTeamInfo.flag} {scorerTeamInfo.name})</span>}</div>
          ) : <div className="muted">לא נבחר מלך שערים.</div>}
          {existingAssist ? (
            <div><span className="muted">מלך הבישולים: </span><strong>{existingAssist.playerName}</strong>{assistTeamInfo && <span> ({assistTeamInfo.flag} {assistTeamInfo.name})</span>}</div>
          ) : <div className="muted">לא נבחר מלך בישולים.</div>}
          {existingChampion ? (
            <div><span className="muted">זוכת המונדיאל: </span><strong>{championTeamInfo?.name || existingChampion.teamCode}</strong>{championTeamInfo && <span> {championTeamInfo.flag}</span>}</div>
          ) : <div className="muted">לא נבחרה זוכה.</div>}
        </div>
      </div>
    );
  }

  /* Scorer/assist locked, champion still open */
  if (locked) {
    return (
      <div className="topscorers-pick-panel">
        <h3>🔮 הניחוש שלי</h3>
        <div className="topscorers-pick-result" style={{ marginBottom: 12 }}>
          {existingScorer ? (
            <div><span className="muted">מלך השערים (נעול): </span><strong>{existingScorer.playerName}</strong>{scorerTeamInfo && <span> ({scorerTeamInfo.flag} {scorerTeamInfo.name})</span>}</div>
          ) : <div className="muted">מלך השערים — לא נבחר (נעול).</div>}
          {existingAssist ? (
            <div><span className="muted">מלך הבישולים (נעול): </span><strong>{existingAssist.playerName}</strong>{assistTeamInfo && <span> ({assistTeamInfo.flag} {assistTeamInfo.name})</span>}</div>
          ) : <div className="muted">מלך הבישולים — לא נבחר (נעול).</div>}
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          ניחוש זוכת המונדיאל ניתן לשינוי עד סיום שלב 8 האחרונות.
        </p>
        <div className="topscorers-pick-form">
          <div className="topscorers-pick-row">
            <span className="topscorers-pick-label">🏆 זוכת המונדיאל:</span>
            <select value={championTeam} onChange={e => { setChampionTeam(e.target.value); setSaved(false); }}>
              <option value="">בחר נבחרת</option>
              {ALL_TEAMS.map(t => <option key={t.code} value={t.code}>{t.flag} {t.name}</option>)}
            </select>
          </div>
          {error && <div className="error-text">{error}</div>}
          {saved && !error && <div className="muted" style={{ fontSize: 12 }}>✅ הניחוש נשמר</div>}
          <button className="btn btn-primary" onClick={submitChampion} disabled={saving}>
            {saving ? "שומר..." : existingChampion ? "עדכן ניחוש זוכה" : "שלח ניחוש זוכה"}
          </button>
        </div>
      </div>
    );
  }

  const hasExisting = !!(existingScorer && existingAssist);

  async function submit() {
    if (!scorerTeam || !scorerPlayer || !assistTeam || !assistPlayer) {
      setError("יש לבחור נבחרת ושחקן עבור שני הניחושים");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await setTopPicks(
        { teamCode: scorerTeam, playerName: scorerPlayer },
        { teamCode: assistTeam, playerName: assistPlayer },
        championTeam ? { teamCode: championTeam } : undefined,
      );
      setSaved(true);
    } catch (e: any) {
      setError(e.message || "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  async function submitChampion() {
    if (!championTeam) { setError("יש לבחור נבחרת"); return; }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await setTopPicks(
        existingScorer || { teamCode: "", playerName: "" },
        existingAssist || { teamCode: "", playerName: "" },
        { teamCode: championTeam },
      );
      setSaved(true);
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
        ניתן לבחור ולהחליף את הבחירה כל עוד שלב הבתים לא הסתיים. לאחר סיום שלב הבתים הבחירה תינעל.
      </p>
      <div className="topscorers-pick-form">
        <div className="topscorers-pick-row">
          <span className="topscorers-pick-label">מלך השערים:</span>
          <select value={scorerTeam} onChange={e => { setScorerTeam(e.target.value); setScorerPlayer(""); setSaved(false); }}>
            <option value="">בחר נבחרת</option>
            {ALL_TEAMS.map(t => <option key={t.code} value={t.code}>{t.flag} {t.name}</option>)}
          </select>
          <select value={scorerPlayer} onChange={e => { setScorerPlayer(e.target.value); setSaved(false); }} disabled={!scorerTeam}>
            <option value="">בחר שחקן</option>
            {scorerSquad.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </div>
        <div className="topscorers-pick-row">
          <span className="topscorers-pick-label">מלך הבישולים:</span>
          <select value={assistTeam} onChange={e => { setAssistTeam(e.target.value); setAssistPlayer(""); setSaved(false); }}>
            <option value="">בחר נבחרת</option>
            {ALL_TEAMS.map(t => <option key={t.code} value={t.code}>{t.flag} {t.name}</option>)}
          </select>
          <select value={assistPlayer} onChange={e => { setAssistPlayer(e.target.value); setSaved(false); }} disabled={!assistTeam}>
            <option value="">בחר שחקן</option>
            {assistSquad.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </div>
        <div className="topscorers-pick-row">
          <span className="topscorers-pick-label">🏆 זוכת המונדיאל:</span>
          <select value={championTeam} onChange={e => { setChampionTeam(e.target.value); setSaved(false); }}>
            <option value="">בחר נבחרת (אופציונלי עד 8 האחרונות)</option>
            {ALL_TEAMS.map(t => <option key={t.code} value={t.code}>{t.flag} {t.name}</option>)}
          </select>
        </div>
        {error && <div className="error-text">{error}</div>}
        {saved && !error && <div className="muted" style={{ fontSize: 12 }}>✅ הניחוש נשמר</div>}
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? "שומר..." : hasExisting ? "עדכן ניחוש" : "שלח ניחוש"}
        </button>
      </div>
    </div>
  );
}
