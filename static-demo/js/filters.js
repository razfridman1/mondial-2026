/* =====================================================================
 * Filters bar: by day, group, stage, channel, team, live/upcoming, favorites.
 * ===================================================================*/

const FILTERS = (() => {
  const { TEAMS, CHANNELS, STAGES } = window.MONDIAL;
  const U = window.UTILS;
  const S = window.SCHEDULE;

  function uniqueSortedDayKeys() {
    const set = new Set(S.allMatches().map(m => U.israelDateKey(m.utc)));
    return [...set].sort();
  }

  function render(container, onChange) {
    const p = U.getPrefs();
    const days = uniqueSortedDayKeys();
    const groups = [..."ABCDEFGHIJKL"];

    const teamOptions = Object.values(TEAMS)
      .sort((a,b) => a.name.localeCompare(b.name, "he"))
      .map(t => `<option value="${t.code}" ${p.selectedTeam===t.code?"selected":""}>${t.flag} ${t.name}</option>`).join("");

    const channelOptions = Object.values(CHANNELS)
      .map(c => `<option value="${c.id}" ${p.selectedChannel===c.id?"selected":""}>${c.logo} ${c.name}</option>`).join("");

    const stageOptions = Object.values(STAGES)
      .sort((a,b)=>a.order-b.order)
      .map(s => `<option value="${s.id}" ${p.selectedStage===s.id?"selected":""}>${s.name}</option>`).join("");

    const dayOptions = days.map(d => {
      const sample = `${d}T12:00:00Z`;
      const label = U.formatIsraelDate(sample, { short: true });
      return `<option value="${d}" ${p.selectedDay===d?"selected":""}>${label}</option>`;
    }).join("");

    const groupOptions = groups.map(g => `<option value="${g}" ${p.selectedGroup===g?"selected":""}>בית ${g}</option>`).join("");

    container.innerHTML = `
      <div class="filters">
        <div class="filter-row">
          <button class="seg ${p.statusFilter==='all'?'on':''}"      data-status="all">הכול</button>
          <button class="seg ${p.statusFilter==='live'?'on':''}"     data-status="live">🔴 שידור חי</button>
          <button class="seg ${p.statusFilter==='upcoming'?'on':''}" data-status="upcoming">⏭️ עתידיים</button>
          <button class="seg seg-fav ${p.showFavOnly?'on':''}"       data-toggle="fav">⭐ מועדפים בלבד</button>
          <button class="seg seg-today"                              data-quick="today">היום</button>
          <button class="seg"                                         data-quick="tomorrow">מחר</button>
          <button class="seg"                                         data-quick="week">השבוע</button>
          <button class="seg seg-reset"                              data-quick="reset">איפוס</button>
        </div>
        <div class="filter-row">
          <label class="flt"><span>יום</span>
            <select data-flt="day"><option value="">כל הימים</option>${dayOptions}</select>
          </label>
          <label class="flt"><span>בית</span>
            <select data-flt="group"><option value="">כל הבתים</option>${groupOptions}</select>
          </label>
          <label class="flt"><span>שלב</span>
            <select data-flt="stage"><option value="">כל השלבים</option>${stageOptions}</select>
          </label>
          <label class="flt"><span>ערוץ</span>
            <select data-flt="channel"><option value="">כל הערוצים</option>${channelOptions}</select>
          </label>
          <label class="flt"><span>קבוצה</span>
            <select data-flt="team"><option value="">כל הקבוצות</option>${teamOptions}</select>
          </label>
        </div>
      </div>`;

    container.querySelectorAll("[data-status]").forEach(b => {
      b.addEventListener("click", () => { U.setPref("statusFilter", b.dataset.status); onChange(); });
    });
    container.querySelector("[data-toggle='fav']").addEventListener("click", () => {
      U.setPref("showFavOnly", !U.getPrefs().showFavOnly); onChange();
    });
    container.querySelectorAll("[data-flt]").forEach(sel => {
      sel.addEventListener("change", () => {
        U.setPref({day:"selectedDay",group:"selectedGroup",stage:"selectedStage",channel:"selectedChannel",team:"selectedTeam"}[sel.dataset.flt], sel.value || null);
        onChange();
      });
    });
    container.querySelectorAll("[data-quick]").forEach(b => {
      b.addEventListener("click", () => {
        const q = b.dataset.quick;
        if (q === "today") { U.setPref("selectedDay", U.todayKey()); U.setPref("statusFilter","all"); }
        if (q === "tomorrow") { U.setPref("selectedDay", U.tomorrowKey()); U.setPref("statusFilter","all"); }
        if (q === "week") {
          U.setPref("selectedDay", null);
          U.setPref("statusFilter","upcoming");
        }
        if (q === "reset") {
          ["selectedDay","selectedGroup","selectedStage","selectedChannel","selectedTeam"].forEach(k => U.setPref(k, null));
          U.setPref("statusFilter","all");
          U.setPref("showFavOnly", false);
        }
        onChange();
      });
    });
  }

  return { render };
})();

window.FILTERS = FILTERS;
