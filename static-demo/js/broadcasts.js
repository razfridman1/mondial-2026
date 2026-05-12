/* =====================================================================
 * Broadcasts tab: lists every Israeli channel airing every match,
 * grouped by channel and by day, with live status, pre-game windows
 * and a "now & next" hero. Includes simulated realtime updates.
 * ===================================================================*/

const BROADCASTS = (() => {
  const { TEAMS, CHANNELS, VENUES, STAGES } = window.MONDIAL;
  const U = window.UTILS;
  const S = window.SCHEDULE;

  function nowAndNext() {
    const matches = S.allMatches().sort((a,b) => new Date(a.utc) - new Date(b.utc));
    const now = Date.now();
    let live = null, next = null;
    for (const m of matches) {
      const status = U.matchLiveStatus(m);
      if ((status === "live" || status === "pregame") && !live) live = m;
      if (status === "upcoming" && !next) next = m;
      if (live && next) break;
    }
    return { live, next };
  }

  function renderHero(container) {
    const { live, next } = nowAndNext();
    const liveHtml = live ? renderBigCard(live, "🔴 משודר עכשיו") : `
      <div class="hero-empty">
        <h3>אין שידור חי כרגע</h3>
        <p class="muted">המשחק הבא יתחיל בקרוב.</p>
      </div>`;
    const nextHtml = next ? renderBigCard(next, "⏭️ המשחק הבא") : "";
    container.innerHTML = `<div class="hero-grid">${liveHtml}${nextHtml}</div>`;
  }

  function renderBigCard(m, badge) {
    const home = TEAMS[m.home] || { name: m.home, flag: "❓" };
    const away = TEAMS[m.away] || { name: m.away, flag: "❓" };
    const channels = (m.channels || []).map(cid => CHANNELS[cid]).filter(Boolean);
    const venue = VENUES[m.venue] || {};
    return `
      <article class="hero-card">
        <div class="hero-badge">${badge}</div>
        <div class="hero-teams">
          <div class="hero-team"><span class="hero-flag">${home.flag}</span><div>${home.name}</div></div>
          <div class="hero-vs">
            <div class="hero-time">${U.formatIsraelTime(m.utc)}</div>
            <div class="hero-date muted">${U.formatIsraelDate(m.utc, {short:true})}</div>
            <div data-countdown="${m.utc}" class="hero-cd">--:--:--</div>
          </div>
          <div class="hero-team"><span class="hero-flag">${away.flag}</span><div>${away.name}</div></div>
        </div>
        <div class="hero-venue muted">🏟️ ${venue.name || ""} · ${venue.city || ""} ${venue.flag || ""}</div>
        <div class="bc-chips">
          ${channels.map(c => `
            <a class="channel-chip channel-big" style="--ch:${c.color}" href="${c.url}" target="_blank" rel="noopener">
              <span class="channel-logo">${c.logo}</span><span>${c.name}</span>
            </a>`).join("")}
        </div>
        <button class="btn btn-primary" data-action="open-match" data-match-id="${m.id}">פתח עמוד משחק</button>
      </article>`;
  }

  /* By channel — list every match the channel broadcasts */
  function renderByChannel(container) {
    const matches = S.allMatches();
    const channels = Object.values(CHANNELS);
    const html = channels.map(c => {
      const cMatches = matches.filter(m => (m.channels || []).includes(c.id))
        .sort((a,b)=> new Date(a.utc)-new Date(b.utc));
      return `
        <details class="ch-section" style="--ch:${c.color}" ${cMatches.length ? "open" : ""}>
          <summary>
            <span class="ch-logo">${c.logo}</span>
            <a href="${c.url}" target="_blank" rel="noopener" class="ch-name">${c.name}</a>
            <span class="muted">${c.type}</span>
            <span class="chip chip-strong">${cMatches.length} משחקים</span>
          </summary>
          <div class="ch-list">
            ${cMatches.map(m => {
              const home = TEAMS[m.home] || { name: m.home, flag: "❓" };
              const away = TEAMS[m.away] || { name: m.away, flag: "❓" };
              const status = U.matchLiveStatus(m);
              return `
                <button class="ch-row status-${status}" data-action="open-match" data-match-id="${m.id}">
                  <div class="ch-row-time">
                    <div class="ch-t">${U.formatIsraelTime(m.utc)}</div>
                    <div class="ch-d muted">${U.formatIsraelDate(m.utc, {short:true})}</div>
                  </div>
                  <div class="ch-row-teams">
                    <span>${home.flag} ${home.name}</span>
                    <span class="muted">נגד</span>
                    <span>${away.name} ${away.flag}</span>
                  </div>
                  <div class="ch-row-stage muted">${STAGES[m.stage]?.name || ""}${m.group ? " · בית " + m.group : ""}</div>
                  <div class="ch-row-cd" data-countdown="${m.utc}">--:--:--</div>
                  ${status === "live" ? `<span class="badge badge-live">🔴 חי</span>` : ""}
                </button>`;
            }).join("")}
          </div>
        </details>`;
    }).join("");
    container.innerHTML = html;
  }

  /* Channel grid summary */
  function renderChannelGrid(container) {
    const matches = S.allMatches();
    const html = Object.values(CHANNELS).map(c => {
      const cMatches = matches.filter(m => (m.channels || []).includes(c.id));
      const nextC = cMatches.filter(m => new Date(m.utc) > new Date()).sort((a,b)=>new Date(a.utc)-new Date(b.utc))[0];
      return `
        <a class="ch-card" style="--ch:${c.color}" href="${c.url}" target="_blank" rel="noopener">
          <div class="ch-card-head">
            <span class="ch-logo">${c.logo}</span>
            <span class="ch-card-name">${c.name}</span>
          </div>
          <div class="ch-card-type muted">${c.type}</div>
          <div class="ch-card-count">${cMatches.length}</div>
          <div class="ch-card-label muted">משחקים</div>
          ${nextC ? `<div class="ch-card-next muted">הבא: ${U.formatIsraelTime(nextC.utc)} · ${U.formatIsraelDate(nextC.utc, {short:true})}</div>` : ""}
        </a>`;
    }).join("");
    container.innerHTML = `<div class="ch-grid">${html}</div>`;
  }

  /* Simulate realtime broadcast tweaks (delays, channel additions) */
  function simulateRealtimeNotice() {
    const matches = S.allMatches();
    const upcoming = matches.filter(m => U.matchLiveStatus(m) === "upcoming");
    if (!upcoming.length) return null;
    const m = upcoming[Math.floor(Math.random() * Math.min(upcoming.length, 5))];
    const home = TEAMS[m.home]?.name || m.home;
    const away = TEAMS[m.away]?.name || m.away;
    const samples = [
      `📡 עדכון: ${home} - ${away} ישודר גם בערוץ ספורט 5+`,
      `⏱️ עדכון: שריקת הפתיחה ל-${home} - ${away} עשויה להידחות ב-5 דקות`,
      `🎙️ פרשנות: שינוי בצוות השידור למשחק ${home} - ${away}`,
      `📺 כאן 11 הוסיפו תוכנית אולפן מורחבת לפני ${home} - ${away}`,
    ];
    return samples[Math.floor(Math.random() * samples.length)];
  }

  return { renderHero, renderByChannel, renderChannelGrid, simulateRealtimeNotice };
})();

window.BROADCASTS = BROADCASTS;
