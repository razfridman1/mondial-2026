"use client";
import { useEffect, useMemo, useState } from "react";
import { MATCHES, TEAMS, STAGES } from "@/lib/data";
import { useStore } from "@/lib/store";
import { israelDateKey, formatIsraelDate, todayKey, tomorrowKey } from "@/lib/utils";

export default function Filters() {
  const prefs = useStore(s => s.prefs);
  const setPref = useStore(s => s.setPref);
  const [advOpen, setAdvOpen] = useState(false);

  const days = useMemo(() => [...new Set(MATCHES.map(m => israelDateKey(m.utc)))].sort(), []);

  // Legacy guard: "live" filter and channel filter were removed — clear leftover values
  useEffect(() => {
    if ((prefs.statusFilter as string) === "live") setPref("statusFilter", "all");
    if (prefs.selectedChannel) setPref("selectedChannel", null);
  }, [prefs.statusFilter, prefs.selectedChannel, setPref]);

  const today = todayKey();
  const tomorrow = tomorrowKey();
  const dayIsToday = prefs.selectedDay === today;
  const dayIsTomorrow = prefs.selectedDay === tomorrow;
  const weekActive = !prefs.selectedDay && prefs.statusFilter === "upcoming";

  const advancedCount =
    (prefs.selectedDay && !dayIsToday && !dayIsTomorrow ? 1 : 0) +
    (prefs.selectedGroup ? 1 : 0) +
    (prefs.selectedStage ? 1 : 0) +
    (prefs.selectedTeam ? 1 : 0);

  function resetAll() {
    setPref("selectedDay", null);
    setPref("selectedGroup", null);
    setPref("selectedStage", null);
    setPref("selectedChannel", null);
    setPref("selectedTeam", null);
    setPref("statusFilter", "all");
  }

  const anyActive =
    advancedCount > 0 ||
    dayIsToday ||
    dayIsTomorrow ||
    weekActive ||
    prefs.statusFilter !== "all";

  return (
    <div className="filters filters-compact">
      <div className="filter-row filter-quick">
        <button
          className={`seg seg-today ${dayIsToday ? "on" : ""}`}
          onClick={() => { setPref("selectedDay", dayIsToday ? null : today); setPref("statusFilter", "all"); }}
        >היום</button>
        <button
          className={`seg ${dayIsTomorrow ? "on" : ""}`}
          onClick={() => { setPref("selectedDay", dayIsTomorrow ? null : tomorrow); setPref("statusFilter", "all"); }}
        >מחר</button>
        <button
          className={`seg ${weekActive ? "on" : ""}`}
          onClick={() => {
            if (weekActive) { setPref("statusFilter", "all"); }
            else { setPref("selectedDay", null); setPref("statusFilter", "upcoming"); }
          }}
        >השבוע</button>
        <button
          className={`seg seg-adv ${advOpen ? "on" : ""}`}
          aria-expanded={advOpen}
          onClick={() => setAdvOpen(v => !v)}
        >
          🔧 סינון{advancedCount > 0 ? <span className="seg-badge">{advancedCount}</span> : null}
        </button>

        {anyActive && (
          <button className="seg seg-reset" onClick={resetAll}>נקה</button>
        )}
      </div>

      {advOpen && (
        <div className="filter-row filter-adv">
          <label className="flt"><span>יום</span>
            <select value={prefs.selectedDay || ""} onChange={e => setPref("selectedDay", e.target.value || null)}>
              <option value="">כל הימים</option>
              {days.map(d => <option key={d} value={d}>{formatIsraelDate(`${d}T12:00:00Z`, { short: true })}</option>)}
            </select>
          </label>
          <label className="flt"><span>בית</span>
            <select value={prefs.selectedGroup || ""} onChange={e => setPref("selectedGroup", e.target.value || null)}>
              <option value="">כל הבתים</option>
              {[..."ABCDEFGHIJKL"].map(g => <option key={g} value={g}>בית {g}</option>)}
            </select>
          </label>
          <label className="flt"><span>שלב</span>
            <select value={prefs.selectedStage || ""} onChange={e => setPref("selectedStage", e.target.value || null)}>
              <option value="">כל השלבים</option>
              {Object.values(STAGES).sort((a,b) => a.order - b.order).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="flt"><span>קבוצה</span>
            <select value={prefs.selectedTeam || ""} onChange={e => setPref("selectedTeam", e.target.value || null)}>
              <option value="">כל הקבוצות</option>
              {Object.values(TEAMS).sort((a,b) => a.name.localeCompare(b.name, "he"))
                .map(t => <option key={t.code} value={t.code}>{t.flag} {t.name}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
