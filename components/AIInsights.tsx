"use client";
import { useMemo, useState } from "react";
import { MATCHES, TEAMS, CHANNELS } from "@/lib/data";
import { useStore } from "@/lib/store";
import { applyOverride, israelDateKey, todayKey, tomorrowKey, matchLiveStatus, formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import type { Match } from "@/lib/types";
import MatchModal from "./MatchModal";
import SmartInsights from "./SmartInsights";
import RoastEngine from "./RoastEngine";

function spread(o: Match["odds"]): number {
  if (!o) return Infinity;
  return Math.abs(parseFloat(o.home) - parseFloat(o.away));
}

export default function AIInsights() {
  const overrides = useStore(s => s.overrides);
  const favTeams = useStore(s => s.favTeams);
  const matches = useMemo(() => MATCHES.map(m => applyOverride(m, overrides[m.id])), [overrides]);
  const [openId, setOpenId] = useState<string | null>(null);

  const top = useMemo(() => {
    const day = todayKey();
    const todays = matches.filter(m => israelDateKey(m.utc) === day);
    if (todays.length) return todays.sort((a,b) => spread(a.odds) - spread(b.odds))[0];
    const day2 = tomorrowKey();
    return matches.filter(m => israelDateKey(m.utc) === day2)[0] || null;
  }, [matches]);

  const tight = useMemo(() => {
    const arr = matches.filter(m => m.odds && matchLiveStatus(m) !== "finished")
      .sort((a,b) => spread(a.odds) - spread(b.odds));
    return arr[0] || null;
  }, [matches]);

  const upsets = useMemo(() => {
    return matches.filter(m => m.odds && matchLiveStatus(m) !== "finished")
      .sort((a,b) => spread(b.odds) - spread(a.odds)).slice(0, 3);
  }, [matches]);

  const recs = useMemo(() => {
    const arr = matches.filter(m => matchLiveStatus(m) !== "finished");
    arr.sort((a,b) => {
      const af = favTeams.has(a.home) || favTeams.has(a.away) ? 0 : 1;
      const bf = favTeams.has(b.home) || favTeams.has(b.away) ? 0 : 1;
      if (af !== bf) return af - bf;
      return spread(a.odds) - spread(b.odds);
    });
    return arr.slice(0, 5);
  }, [matches, favTeams]);

  return (
    <>
      <div className="ai-grid">
        <SmartInsights />
        <RoastEngine />
        <section className="ai-section">
          <h3>🔥 הכי מעניין היום</h3>
          {top ? <Mini m={top} onOpen={setOpenId} /> : <div className="empty-state">אין משחקים זמינים.</div>}
        </section>
        <section className="ai-section">
          <h3>🎯 המשחק הכי צמוד</h3>
          {tight ? <Mini m={tight} onOpen={setOpenId} /> : <div className="empty-state">אין נתוני יחס.</div>}
        </section>
        <section className="ai-section">
          <h3>💥 פוטנציאל הפתעה</h3>
          <div className="ai-list">{upsets.map(m => <Mini key={m.id} m={m} label="אפסט" onOpen={setOpenId} />)}</div>
        </section>
        <section className="ai-section ai-wide">
          <h3>⭐ ההמלצות שלנו</h3>
          <div className="ai-list ai-list-wide">{recs.map((m, i) => <Mini key={m.id} m={m} label={`#${i+1}`} onOpen={setOpenId} />)}</div>
        </section>
      </div>
      {openId && <MatchModal matchId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function Mini({ m, label, onOpen }: { m: Match; label?: string; onOpen: (id: string) => void }) {
  const home = TEAMS[m.home] || { name: m.home, flag: "❓" };
  const away = TEAMS[m.away] || { name: m.away, flag: "❓" };
  const channels = (m.channels || []).map(c => CHANNELS[c]?.name).filter(Boolean).slice(0, 2).join(" · ");
  return (
    <button className="ai-mini" onClick={() => onOpen(m.id)}>
      {label && <span className="ai-mini-label">{label}</span>}
      <div className="ai-mini-teams">{home.flag} {home.name} <span className="muted">נגד</span> {away.name} {away.flag}</div>
      <div className="muted ai-mini-meta">{formatIsraelDate(m.utc, { short: true })} · {formatIsraelTime(m.utc)} · {channels}</div>
    </button>
  );
}
