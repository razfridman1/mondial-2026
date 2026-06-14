"use client";
/* =====================================================================
 * FriendsPredictionsTab — "ניחושי חברים"
 *
 * Shows a single table where rows are matches (past + live only) and
 * columns are the members of the selected group. Each cell shows that
 * member's prediction, the actual result, and the points they scored.
 * ===================================================================*/
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import { TEAMS, STAGES } from "@/lib/data";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import { AvatarDisplay } from "./AvatarPicker";
import { scorePrediction } from "@/lib/scoring";

interface PredictionCell {
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
interface MatchRow {
  matchId: string;
  home: string;
  away: string;
  utc: string;
  stage: string;
  group: string | null;
  visible: boolean;
  result?: { home: number; away: number; winner?: string } | null;
  predictions: PredictionCell[];
}
interface Member {
  uid: string;
  displayName: string;
  avatarId: string;
}

const LIVE_WINDOW_MS = 115 * 60 * 1000;

export default function FriendsPredictionsTab() {
  const user = useStore(s => s.user);
  const groups = useStore(s => s.groups);
  const currentGroupId = useStore(s => s.currentGroupId);

  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => currentGroupId || "");
  useEffect(() => {
    if (!selectedGroupId && currentGroupId) setSelectedGroupId(currentGroupId);
  }, [currentGroupId, selectedGroupId]);
  /* If the selected group is no longer one the user belongs to, fall back
   * to the first available group. */
  useEffect(() => {
    if (groups.length === 0) return;
    if (!groups.some(g => g.id === selectedGroupId)) {
      setSelectedGroupId(currentGroupId && groups.some(g => g.id === currentGroupId) ? currentGroupId : groups[0].id);
    }
  }, [groups, selectedGroupId, currentGroupId]);

  const [members, setMembers] = useState<Member[]>([]);
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!user || !selectedGroupId) { setMembers([]); setRows([]); return; }
    setLoading(true);
    try {
      const token = await getFirebase().auth!.currentUser!.getIdToken();
      const r = await fetch(`/api/group-predictions?groupId=${selectedGroupId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const data = await r.json();
        setMembers(data.members || []);
        setRows(data.rows || []);
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [user?.uid, selectedGroupId]);
  useEffect(() => {
    const id = setInterval(load, 120000);
    return () => clearInterval(id);
  }, [selectedGroupId]);

  /* Only past matches (have a result, or kickoff already passed) and
   * matches currently live. Upcoming matches are excluded entirely. */
  const filtered = useMemo(() => {
    const now = Date.now();
    const live: MatchRow[] = [];
    const past: MatchRow[] = [];
    for (const r of rows) {
      const start = new Date(r.utc).getTime();
      const hasResult = !!r.result;
      const isLive = !hasResult && now >= start && now <= start + LIVE_WINDOW_MS;
      if (isLive) live.push(r);
      else if (hasResult || start < now) past.push(r);
    }
    past.sort((a, b) => new Date(b.utc).getTime() - new Date(a.utc).getTime());
    return [...live, ...past];
  }, [rows]);

  /* Success rate per member: % of FINISHED matches where they scored any
   * points (exact / correct result+diff / correct result), out of ALL
   * finished matches — recomputed whenever a match's result comes in. */
  const successRates = useMemo(() => {
    const finished = rows.filter(r => !!r.result);
    const map: Record<string, { hits: number; total: number }> = {};
    for (const m of members) map[m.uid] = { hits: 0, total: finished.length };
    for (const row of finished) {
      const isKnockout = row.stage !== "GROUP";
      for (const p of row.predictions) {
        if (!map[p.uid]) continue;
        if (p.hidden || p.homeScore == null || p.awayScore == null) continue;
        const sc = scorePrediction({
          predictedHome: p.homeScore, predictedAway: p.awayScore,
          actualHome: row.result!.home, actualAway: row.result!.away,
          predictedWinner: p.predictedWinner ?? null,
          actualWinner: row.result!.winner ?? null,
          isKnockout,
        });
        if (sc.points > 0) map[p.uid].hits++;
      }
    }
    return map;
  }, [rows, members]);

  if (!user) {
    return (
      <section>
        <h2 className="sec-title">🔮 ניחושי חברים</h2>
        <p className="muted">היכנס כדי לראות את ניחושי החברים שלך בקבוצה.</p>
        <Link className="btn btn-primary" href="/login">כניסה</Link>
      </section>
    );
  }

  if (groups.length === 0) {
    return (
      <section>
        <h2 className="sec-title">🔮 ניחושי חברים</h2>
        <p className="muted">עדיין לא הצטרפת לקבוצה. הצטרף לקבוצה כדי לראות את ניחושי החברים שלך.</p>
      </section>
    );
  }

  return (
    <section>
      <div className="stnd-card" style={{ marginTop: 8 }}>
        <header className="stnd-card-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h3>🔮 ניחושי חברים</h3>
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
        <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
          טבלת הניחושים של כל חברי הקבוצה למשחקים שהתחילו או הסתיימו.
        </p>

        <div className="fp-table-wrap">
          <table className="fp-table">
            <thead>
              <tr>
                <th className="fp-th-match">משחק</th>
                {members.map(m => {
                  const sr = successRates[m.uid];
                  const pct = sr && sr.total > 0 ? Math.round((sr.hits / sr.total) * 100) : null;
                  return (
                    <th key={m.uid}>
                      <div className="fp-member-head">
                        {pct !== null && <div className="fp-member-rate">{pct}% הצלחה</div>}
                        <AvatarDisplay avatarId={m.avatarId} size={26} />
                        <span>{m.displayName}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={members.length + 1} className="muted" style={{ textAlign: "center", padding: 16 }}>טוען...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={members.length + 1} className="muted" style={{ textAlign: "center", padding: 16 }}>
                  אין עדיין משחקים שהתחילו או הסתיימו.
                </td></tr>
              )}
              {filtered.map(row => {
                const home = TEAMS[row.home] || { name: row.home, flag: "❓" };
                const away = TEAMS[row.away] || { name: row.away, flag: "❓" };
                const stageLabel = (STAGES as any)[row.stage]?.name || row.stage;
                const isKnockout = row.stage !== "GROUP";
                const predByUid = new Map(row.predictions.map(p => [p.uid, p]));
                return (
                  <tr key={row.matchId} className="stnd-row">
                    <td className="fp-td-match">
                      <div className="fp-match-teams">
                        <span>{home.flag}</span>
                        <span>{home.name}</span>
                        <span className="muted">-</span>
                        <span>{away.flag}</span>
                        <span>{away.name}</span>
                      </div>
                      <div className="fp-match-meta">
                        <span className="chip chip-stage" style={{ marginInlineEnd: 6 }}>{stageLabel}</span>
                        {formatIsraelDate(row.utc, { short: true })} · {formatIsraelTime(row.utc)}
                        {row.result && <> · ⚽ {row.result.home}:{row.result.away}</>}
                      </div>
                    </td>
                    {members.map(m => {
                      const p = predByUid.get(m.uid);
                      if (!p) {
                        return <td key={m.uid}><span className="fp-cell-empty">לא ניחש</span></td>;
                      }
                      if (p.hidden) {
                        return <td key={m.uid}><span className="fp-cell-locked" title="ניחוש מוסתר">🔒</span></td>;
                      }
                      const sc = (row.result && p.homeScore != null && p.awayScore != null)
                        ? scorePrediction({
                            predictedHome: p.homeScore, predictedAway: p.awayScore,
                            actualHome: row.result.home, actualAway: row.result.away,
                            predictedWinner: p.predictedWinner ?? null,
                            actualWinner: row.result.winner ?? null,
                            isKnockout,
                          })
                        : null;
                      const winnerTeam = p.predictedWinner ? (TEAMS as any)[p.predictedWinner] : null;
                      return (
                        <td key={m.uid}>
                          <div className="fp-cell">
                            <div className="fp-cell-pred">
                              {p.homeScore} : {p.awayScore}
                              {p.auto && <span title="ניחוש אוטומטי"> 🤖</span>}
                            </div>
                            {isKnockout && p.predictedWinner && (
                              <div className="fp-cell-result">⚽ {winnerTeam?.flag || ""} {winnerTeam?.name || p.predictedWinner}</div>
                            )}
                            {row.result && (
                              <div className="fp-cell-result">תוצאה: {row.result.home}:{row.result.away}</div>
                            )}
                            {sc && (
                              <div className="fp-cell-points" style={{ color: sc.points > 0 ? "var(--green)" : "var(--text-muted)" }}>
                                {sc.exact ? "🎯 " : ""}ניקוד: {sc.points}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
