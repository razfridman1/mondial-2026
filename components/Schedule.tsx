"use client";
import { useMemo, useState } from "react";
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

function filtered(prefs: any, favTeams: Set<string>, overrides: any, simConfig: any): Match[] {
  return MATCHES.map(m => effMatch(m, overrides[m.id], simConfig))
    .filter(m => {
      if (prefs.selectedDay && israelDateKey(m.utc) !== prefs.selectedDay) return false;
      if (prefs.selectedStage && m.stage !== prefs.selectedStage) return false;
      if (prefs.selectedGroup && m.group !== prefs.selectedGroup) return false;
      if (prefs.selectedChannel && !(m.channels || []).includes(prefs.selectedChannel)) return false;
      if (prefs.selectedTeam && m.home !== prefs.selectedTeam && m.away !== prefs.selectedTeam) return false;
      if (prefs.showFavOnly && !(favTeams.has(m.home) || favTeams.has(m.away))) return false;
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
  const favTeams = useStore(s => s.favTeams);
  const overrides = useStore(s => s.overrides);
  const simConfig = useStore(s => s.simConfig);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useMemo(() => filtered(prefs, favTeams, overrides, simConfig), [prefs, favTeams, overrides, simConfig]);

  return (
    <>
      <Filters />
      <div className="view-switch">
        {(["card","calendar","timeline"] as const).map(v => (
          <button key={v} className={`seg ${prefs.view === v ? "on" : ""}`} onClick={() => setPref("view", v)}>
            {v === "card" ? "⚽ משחקים" : v === "calendar" ? "📅 לוח שנה" : "📜 ציר זמן"}
          </button>
        ))}
      </div>
      <div id="schedule-body">
        {prefs.view === "card"     && <CardView list={list}     onOpen={setOpenId} />}
        {prefs.view === "calendar" && <CalendarView list={list} onOpen={setOpenId} />}
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

function CalendarView({ list, onOpen }: { list: Match[]; onOpen: (id: string) => void }) {
  const byDay = new Map<string, Match[]>();
  list.forEach(m => {
    const k = israelDateKey(m.utc);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(m);
  });
  const months = [
    { y: 2026, m: 6, name: "יוני 2026" },
    { y: 2026, m: 7, name: "יולי 2026" },
  ];
  const [selectedDay, setSelectedDay] = useStateLocal();
  return (
    <>
      <div className="cal-wrap">
        {months.map(({ y, m, name }) => {
          const first = new Date(`${y}-${String(m).padStart(2,"0")}-01T12:00:00`);
          const startDow = first.getDay();
          const last = new Date(y, m, 0).getDate();
          const cells: React.ReactNode[] = [];
          for (let i = 0; i < startDow; i++) cells.push(<div key={`e${i}`} className="cal-cell cal-empty" />);
          for (let d = 1; d <= last; d++) {
            const key = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
            const dayMatches = byDay.get(key) || [];
            const liveDay = dayMatches.some(x => matchLiveStatus(x) === "live");
            cells.push(
              <button key={key} className={`cal-cell ${dayMatches.length ? "has-matches" : ""} ${liveDay ? "is-live" : ""}`}
                      onClick={() => setSelectedDay(key)}>
                <div className="cal-num">{d}</div>
                {dayMatches.length > 0 && <div className="cal-count">{dayMatches.length} 🏟️</div>}
                {dayMatches.slice(0, 2).map(m => (
                  <div key={m.id} className="cal-mini">
                    {(TEAMS[m.home]?.flag || "❓")}-{(TEAMS[m.away]?.flag || "❓")}
                  </div>
                ))}
                {dayMatches.length > 2 && <div className="cal-mini muted">+{dayMatches.length - 2}</div>}
              </button>
            );
          }
          return (
            <div key={name} className="cal-month">
              <h3 className="cal-title">{name}</h3>
              <div className="cal-grid">
                <div className="cal-dow">א׳</div><div className="cal-dow">ב׳</div><div className="cal-dow">ג׳</div>
                <div className="cal-dow">ד׳</div><div className="cal-dow">ה׳</div><div className="cal-dow">ו׳</div>
                <div className="cal-dow">ש׳</div>
                {cells}
              </div>
            </div>
          );
        })}
      </div>
      <div className="cal-day-panel">
        {selectedDay && (() => {
          const matches = byDay.get(selectedDay) || [];
          if (!matches.length) return <div className="empty-state">אין משחקים בתאריך זה.</div>;
          return (
            <>
              <h3 className="day-heading">{formatIsraelDate(matches[0].utc)}</h3>
              <div className="card-grid">
                {matches.map(m => <MatchCard key={m.id} match={m} onOpen={onOpen} />)}
              </div>
            </>
          );
        })()}
      </div>
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

/* tiny local state helper */
import { useState as _useState } from "react";
function useStateLocal() {
  return _useState<string | null>(null);
}
