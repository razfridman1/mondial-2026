"use client";
import { useMemo } from "react";
import { MATCHES, TEAMS, CHANNELS, STAGES } from "@/lib/data";
import { useStore } from "@/lib/store";
import { israelDateKey, formatIsraelDate, todayKey, tomorrowKey } from "@/lib/utils";

export default function Filters() {
  const prefs = useStore(s => s.prefs);
  const setPref = useStore(s => s.setPref);

  const days = useMemo(() => [...new Set(MATCHES.map(m => israelDateKey(m.utc)))].sort(), []);

  return (
    <div className="filters">
      <div className="filter-row">
        {(["all","live","upcoming"] as const).map(s => (
          <button key={s} className={`seg ${prefs.statusFilter === s ? "on" : ""}`}
                  onClick={() => setPref("statusFilter", s)}>
            {s === "all" ? "הכול" : s === "live" ? "🔴 שידור חי" : "⏭️ עתידיים"}
          </button>
        ))}
        <button className={`seg seg-fav ${prefs.showFavOnly ? "on" : ""}`}
                onClick={() => setPref("showFavOnly", !prefs.showFavOnly)}>
          ⭐ מועדפים בלבד
        </button>
        <button className="seg seg-today"
                onClick={() => { setPref("selectedDay", todayKey()); setPref("statusFilter", "all"); }}>היום</button>
        <button className="seg"
                onClick={() => { setPref("selectedDay", tomorrowKey()); setPref("statusFilter", "all"); }}>מחר</button>
        <button className="seg"
                onClick={() => { setPref("selectedDay", null); setPref("statusFilter", "upcoming"); }}>השבוע</button>
        <button className="seg seg-reset"
                onClick={() => {
                  setPref("selectedDay", null);
                  setPref("selectedGroup", null);
                  setPref("selectedStage", null);
                  setPref("selectedChannel", null);
                  setPref("selectedTeam", null);
                  setPref("statusFilter", "all");
                  setPref("showFavOnly", false);
                }}>איפוס</button>
      </div>
      <div className="filter-row">
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
        <label className="flt"><span>ערוץ</span>
          <select value={prefs.selectedChannel || ""} onChange={e => setPref("selectedChannel", e.target.value || null)}>
            <option value="">כל הערוצים</option>
            {Object.values(CHANNELS).map(c => <option key={c.id} value={c.id}>{c.logo} {c.name}</option>)}
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
    </div>
  );
}
