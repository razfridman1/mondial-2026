"use client";
import { useEffect, useMemo, useState } from "react";
import { MATCHES } from "@/lib/data";
import { useStore } from "@/lib/store";
import {
  israelDateKey, formatIsraelDate,
  matchLiveStatus, relativeLabel,
} from "@/lib/utils";
import { effMatch } from "@/lib/sim";
import type { Match } from "@/lib/types";
import MatchCard from "./MatchCard";
import MatchModal from "./MatchModal";
import Filters from "./Filters";

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

  /* Legacy guard: removed views (calendar, timeline) reset to card */
  useEffect(() => {
    const v = prefs.view as string;
    if (v === "calendar" || v === "timeline") setPref("view", "card");
  }, [prefs.view, setPref]);

  const list = useMemo(() => filtered(prefs, overrides, simConfig), [prefs, overrides, simConfig]);

  return (
    <>
      <Filters />
      <div id="schedule-body">
        <CardView list={list} onOpen={setOpenId} />
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


