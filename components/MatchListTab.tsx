"use client";
/* =====================================================================
 * MatchListTab — admin-only flat list of ALL tournament matches, sorted
 * by date & time. Plain table rows (not the card grid used elsewhere),
 * for a quick reference / overview.
 * ===================================================================*/
import { useMemo, useState } from "react";
import Link from "next/link";
import { MATCHES, TEAMS, VENUES, STAGES } from "@/lib/data";
import { useStore } from "@/lib/store";
import { formatIsraelDate, formatIsraelTime, matchLiveStatus } from "@/lib/utils";
import { effMatch } from "@/lib/sim";
import { resolveAllStages } from "@/lib/bracket";
import { useOddsMap } from "@/lib/useOddsMap";
import type { StageId } from "@/lib/types";
import MatchModal from "./MatchModal";

const STAGE_ORDER: StageId[] = ["GROUP", "R32", "R16", "QF", "SF", "THIRD", "FINAL"];

export default function MatchListTab() {
  const user = useStore(s => s.user);
  const overrides = useStore(s => s.overrides);
  const simConfig = useStore(s => s.simConfig);
  const matchResults = useStore(s => s.matchResults);
  const oddsMap = useOddsMap();

  const [stageFilter, setStageFilter] = useState<StageId | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const resolved = useMemo(() => resolveAllStages(matchResults), [matchResults]);

  const matches = useMemo(
    () => MATCHES
      .map(m => {
        const eff = effMatch(m, overrides[m.id], simConfig);
        const odds = oddsMap[m.id] || eff.odds;
        if (m.stage === "GROUP") return { ...eff, odds };
        const r = resolved[m.id];
        if (!r) return { ...eff, odds };
        return {
          ...eff,
          odds,
          home: r.home || eff.home,
          away: r.away || eff.away,
          homeIsPlaceholder: !r.home,
          awayIsPlaceholder: !r.away,
        };
      })
      .sort((a, b) => +new Date(a.utc) - +new Date(b.utc)),
    [overrides, simConfig, resolved, oddsMap]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return matches.filter(m => {
      if (stageFilter !== "ALL" && m.stage !== stageFilter) return false;
      if (!q) return true;
      const home = TEAMS[m.home];
      const away = TEAMS[m.away];
      const haystack = [
        m.home, m.away,
        home?.name, home?.nameEn,
        away?.name, away?.nameEn,
        VENUES[m.venue]?.name, VENUES[m.venue]?.city,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [matches, stageFilter, search]);

  if (!user) return (
    <div className="admin-locked">
      <h3>🔒 רשימת משחקים</h3>
      <p className="muted">כניסה דרושה. <Link href="/login" className="btn btn-primary">כניסה</Link></p>
    </div>
  );

  if (!user.isAdmin) return (
    <div className="admin-locked">
      <h3>🔒 רשימת משחקים — Admin בלבד</h3>
      <p className="muted">אין לך הרשאת ניהול. צור קשר עם מנהל המערכת.</p>
    </div>
  );

  return (
    <>
      <div className="admin-bar">
        <h3>📋 רשימת משחקים</h3>
        <div className="muted">{filtered.length} / {matches.length} משחקים</div>
      </div>

      <div className="filter-row" style={{ marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <select className="seg" value={stageFilter} onChange={e => setStageFilter(e.target.value as StageId | "ALL")}>
          <option value="ALL">כל השלבים</option>
          {STAGE_ORDER.map(sid => (
            <option key={sid} value={sid}>{STAGES[sid]?.name || sid}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="🔎 חיפוש נבחרת / אצטדיון..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 160, background: "var(--bg-elev)", color: "var(--text)",
            border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontFamily: "inherit",
          }}
        />
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>תאריך</th>
              <th>שעה</th>
              <th>שלב</th>
              <th>בית</th>
              <th></th>
              <th>חוץ</th>
              <th>אצטדיון</th>
              <th>סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => {
              const home = TEAMS[m.home] || { name: m.home, flag: "❓" } as any;
              const away = TEAMS[m.away] || { name: m.away, flag: "❓" } as any;
              const venue = VENUES[m.venue] || { name: m.venue, city: "" } as any;
              const result = matchResults[m.id];
              const status = result ? "finished" : matchLiveStatus(m as any);
              return (
                <tr key={m.id} onClick={() => setOpenId(m.id)} style={{ cursor: "pointer" }}>
                  <td>{formatIsraelDate(m.utc, { short: true })}</td>
                  <td>{formatIsraelTime(m.utc)}</td>
                  <td>
                    {STAGES[m.stage]?.name || m.stage}
                    {m.group ? ` · ${m.group}` : ""}
                  </td>
                  <td>{home.flag} {home.name}</td>
                  <td className="muted" style={{ textAlign: "center" }}>
                    {result ? <strong>{result.home} : {result.away}</strong> : "—"}
                  </td>
                  <td>{away.name} {away.flag}</td>
                  <td className="muted">{venue.name}{venue.city ? ` · ${venue.city}` : ""}</td>
                  <td>
                    {status === "live"      && <span className="badge badge-live">🔴 חי</span>}
                    {status === "pregame"   && <span className="muted">קדם-משחק</span>}
                    {status === "finished"  && <span className="muted">הסתיים</span>}
                    {status === "scheduled" && <span className="muted">מתוכנן</span>}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 20 }}>לא נמצאו משחקים</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {openId && <MatchModal matchId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
