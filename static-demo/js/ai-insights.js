/* =====================================================================
 * AI Schedule Insights:
 *   - מה הכי מעניין היום
 *   - המשחק הכי צמוד (lowest spread of odds)
 *   - upset potential (ביגדוד שווה מול חלש לכאורה)
 *   - top matches recommendations (5 משחקים מומלצים)
 * ===================================================================*/

const AI_INSIGHTS = (() => {
  const { TEAMS, CHANNELS } = window.MONDIAL;
  const U = window.UTILS;
  const S = window.SCHEDULE;

  function spreadFromOdds(o) {
    if (!o) return Infinity;
    return Math.abs(parseFloat(o.home) - parseFloat(o.away));
  }

  function pickTopOfToday() {
    const today = U.todayKey();
    const list = S.allMatches().filter(m => U.israelDateKey(m.utc) === today);
    if (!list.length) {
      // Pick from tomorrow
      const tk = U.tomorrowKey();
      const tomList = S.allMatches().filter(m => U.israelDateKey(m.utc) === tk);
      return tomList[0] || null;
    }
    list.sort((a,b) => (a.odds ? spreadFromOdds(a.odds) : 99) - (b.odds ? spreadFromOdds(b.odds) : 99));
    return list[0];
  }

  function tightestMatch() {
    const list = S.allMatches().filter(m => m.odds && U.matchLiveStatus(m) !== "finished");
    list.sort((a,b)=> spreadFromOdds(a.odds) - spreadFromOdds(b.odds));
    return list[0];
  }

  function upsetCandidates(n = 3) {
    const list = S.allMatches().filter(m => m.odds && U.matchLiveStatus(m) !== "finished");
    // Upset = big odds spread; pick where weaker side is poised to surprise
    list.sort((a,b) => spreadFromOdds(b.odds) - spreadFromOdds(a.odds));
    return list.slice(0, n);
  }

  function topRecommendations(n = 5) {
    const list = S.allMatches().filter(m => U.matchLiveStatus(m) !== "finished");
    const fav = U.getFavTeams();
    list.sort((a,b) => {
      const af = (fav.has(a.home) || fav.has(a.away)) ? 0 : 1;
      const bf = (fav.has(b.home) || fav.has(b.away)) ? 0 : 1;
      if (af !== bf) return af - bf;
      const sa = a.odds ? spreadFromOdds(a.odds) : 5;
      const sb = b.odds ? spreadFromOdds(b.odds) : 5;
      return sa - sb;
    });
    return list.slice(0, n);
  }

  function miniCard(m, label) {
    const home = TEAMS[m.home] || { name: m.home, flag: "❓" };
    const away = TEAMS[m.away] || { name: m.away, flag: "❓" };
    const channels = (m.channels || []).map(cid => CHANNELS[cid]?.name).filter(Boolean).slice(0,2).join(" · ");
    return `
      <button class="ai-mini" data-action="open-match" data-match-id="${m.id}">
        ${label ? `<span class="ai-mini-label">${label}</span>` : ""}
        <div class="ai-mini-teams">${home.flag} ${home.name} <span class="muted">נגד</span> ${away.name} ${away.flag}</div>
        <div class="muted ai-mini-meta">${U.formatIsraelDate(m.utc,{short:true})} · ${U.formatIsraelTime(m.utc)} · ${channels || ""}</div>
        ${m.aiInsight ? `<div class="ai-mini-text">🤖 ${m.aiInsight}</div>` : ""}
      </button>`;
  }

  function render(container) {
    const top = pickTopOfToday();
    const tight = tightestMatch();
    const upsets = upsetCandidates(3);
    const recs = topRecommendations(5);

    container.innerHTML = `
      <div class="ai-grid">
        <section class="ai-section">
          <h3>🔥 הכי מעניין היום</h3>
          ${top ? miniCard(top) : `<div class="empty-state">אין משחקים זמינים.</div>`}
        </section>
        <section class="ai-section">
          <h3>🎯 המשחק הכי צמוד</h3>
          ${tight ? miniCard(tight) : `<div class="empty-state">אין נתוני יחס.</div>`}
        </section>
        <section class="ai-section">
          <h3>💥 פוטנציאל הפתעה</h3>
          <div class="ai-list">${upsets.map(m => miniCard(m, "אפסט")).join("") || `<div class="empty-state">—</div>`}</div>
        </section>
        <section class="ai-section ai-wide">
          <h3>⭐ ההמלצות שלנו</h3>
          <div class="ai-list ai-list-wide">${recs.map((m,i) => miniCard(m, `#${i+1}`)).join("") || `<div class="empty-state">—</div>`}</div>
        </section>
      </div>`;
  }

  return { render };
})();

window.AI_INSIGHTS = AI_INSIGHTS;
