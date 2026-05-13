"use client";
import { useEffect, useMemo, useState } from "react";
import { MATCHES, TEAMS, CHANNELS, STAGES } from "@/lib/data";
import { useStore } from "@/lib/store";
import {
  israelDateKey, formatIsraelDate, formatIsraelTime,
  matchLiveStatus, relativeLabel,
} from "@/lib/utils";
import { effMatch } from "@/lib/sim";
import type { Match } from "@/lib/types";
import MatchCard from "./MatchCard";
import MatchModal from "./MatchModal";
import Filters from "./Filters";
import Countdown from "./Countdown";

function filtered(prefs: any, overrides: any, simConfig: any): Match[] {
  return MATCHES.map(m => effMatch(m, overrides[m.id], simConfig))
    .filter(m => {
      if (prefs.selectedDay && israelDateKey(m.utc) !== prefs.selectedDay) return false;
      if (prefs.selectedStage && m.stage !== prefs.selectedStage) return false;
      if (prefs.selectedGroup && m.group !== prefs.selectedGroup) return false;
      if (prefs.selectedChannel && !(m.channels || []).includes(prefs.selectedChannel)) return false;
      if (prefs.selectedTeam && m.home !== prefs.selectedTeam && m.away !== prefs.selectedTeam) return false;
      const st = matchLiveStatus(m);
      if (prefs.statusFilter === "live" && st !== "live" && st !== "pregame") return false;
      if (prefs.statusFilter === "upcoming" && st === "finished") return false;
      return true;
    })
    .sort((a, b) => +new Date(a.utc) - +new Date(b.utc));
}

export default function Schedule() {
  const prefs = useStore(s => s.prefs);
  const setPref = useStore(s => s.setPref);
  const overrides = useStore(s => s.overrides);
  const simConfig = useStore(s => s.simConfig);
  const [openId, setOpenId] = useState<string | null>(null);

  /* Legacy guard: calendar view was removed — reset any leftover value */
  useEffect(() => {
    if ((prefs.view as string) === "calendar") setPref("view", "card");
  }, [prefs.view, setPref]);

  const list = useMemo(() => filtered(prefs, overrides, simConfig), [prefs, overrides, simConfig]);

  return (
    <>
      <Filters />
      <div className="view-switch">
        {(["card","timeline"] as const).map(v => (
          <button key={v} className={`seg ${prefs.view === v ? "on" : ""}`} onClick={() => setPref("view", v)}>
            {v === "card" ? "⚽ משחקים" : "📜 ציר זמן"}
          </button>
        ))}
      </div>
      <div id="schedule-body">
        {prefs.view === "card"     && <CardView list={list}     onOpen={setOpenId} />}
        {prefs.view === "timeline" && <TimelineView list={list} onOpen={setOpenId} />}
      </div>
      {openId && <MatchModal matchId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function CardView({ list, onOpen }: { list: Match[]; onOpen: (id: string) => void }) {
  if (!list.length) return <div className="empty-state">לא נמצאו משחקים תואמים לסינון.</div>;
  const byDay = new Map<string, Match[]>();
  list.forEach(m => {
    const k = israelDateKey(m.utc);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(m);
  });
  return (
    <>
      {[...byDay.entries()].map(([day, matches]) => (
        <section key={day} className="day-section">
          <h3 className="day-heading">
            <span>{formatIsraelDate(matches[0].utc)}</span>
            {relativeLabel(matches[0].utc) && <span className="chip chip-strong">{relativeLabel(matches[0].utc)}</span>}
            <span className="muted">{matches.length} משחקים</span>
          </h3>
          <div className="card-grid">
            {matches.map(m => <MatchCard key={m.id} match={m} onOpen={onOpen} />)}
          </div>
        </section>
      ))}
    </>
  );
}

function TimelineView({ list, onOpen }: { list: Match[]; onOpen: (id: string) => void }) {
  if (!list.length) return <div className="empty-state">לא נמצאו משחקים.</div>;
  return (
    <div className="timeline">
      {list.map(m => {
        const home = TEAMS[m.home] || { name: m.home, flag: "❓" };
        const away = TEAMS[m.away] || { name: m.away, flag: "❓" };
        const channels = (m.channels || []).map(c => CHANNELS[c]?.name).filter(Boolean).join(" · ");
        const status = matchLiveStatus(m);
        return (
          <div key={m.id} className={`tl-row status-${status}`}>
            <div className="tl-time">
              <div className="tl-t">{formatIsraelTime(m.utc)}</div>
              <div className="tl-d muted">{formatIsraelDate(m.utc, { short: true })}</div>
            </div>
            <div className="tl-dot"></div>
            <div className="tl-body">
              <div className="tl-teams">
                <span>{home.flag} {home.name}</span> <span className="muted">נגד</span> <span>{away.name} {away.flag}</span>
              </div>
              <div className="tl-meta muted">
                {STAGES[m.stage]?.name}{m.group ? ` · בית ${m.group}` : ""} · {channels || "—"}
              </div>
            </div>
            <Countdown utc={m.utc} className="tl-cd" />
            <button className="btn btn-small" onClick={() => onOpen(m.id)}>פתח</button>
          </div>
        );
      })}
    </div>
  );
}

