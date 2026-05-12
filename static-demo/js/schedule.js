/* =====================================================================
 * Schedule rendering: card view, calendar view, timeline view,
 * filtering, match detail modal, countdown ticker.
 * ===================================================================*/

const SCHEDULE = (() => {
  const { TEAMS, VENUES, CHANNELS, STAGES, MATCHES } = window.MONDIAL;
  const U = window.UTILS;

  /* Resolve team display when placeholder (knockout slots) */
  function teamDisplay(code) {
    if (TEAMS[code]) return TEAMS[code];
    return { code, name: code, nameEn: code, flag: "❓", group: null };
  }

  /* All matches after applying admin overrides */
  function allMatches() {
    return MATCHES.map(U.applyOverride);
  }

  /* Apply current filters and return list */
  function filteredMatches(extraFilters = {}) {
    const p = { ...U.getPrefs(), ...extraFilters };
    const fav = U.getFavTeams();
    return allMatches().filter(m => {
      if (p.selectedDay && U.israelDateKey(m.utc) !== p.selectedDay) return false;
      if (p.selectedStage && m.stage !== p.selectedStage) return false;
      if (p.selectedGroup && m.group !== p.selectedGroup) return false;
      if (p.selectedChannel && !(m.channels || []).includes(p.selectedChannel)) return false;
      if (p.selectedTeam && m.home !== p.selectedTeam && m.away !== p.selectedTeam) return false;
      if (p.showFavOnly && !(fav.has(m.home) || fav.has(m.away))) return false;
      if (p.statusFilter === "live") {
        if (U.matchLiveStatus(m) !== "live" && U.matchLiveStatus(m) !== "pregame") return false;
      } else if (p.statusFilter === "upcoming") {
        if (U.matchLiveStatus(m) === "finished") return false;
      }
      return true;
    }).sort((a, b) => new Date(a.utc) - new Date(b.utc));
  }

  /* ---------- MATCH CARD ---------- */
  function renderMatchCard(m) {
    const home = teamDisplay(m.home);
    const away = teamDisplay(m.away);
    const fav  = U.getFavTeams();
    const reminders = U.getReminders()[m.id] || {};
    const status = U.matchLiveStatus(m);
    const time = U.formatIsraelTime(m.utc);
    const date = U.formatIsraelDate(m.utc, { short: true });
    const venue = VENUES[m.venue] || { name: m.venue, city: "", country: "", flag: "" };
    const stage = STAGES[m.stage] || { name: m.stage };

    const channels = (m.channels || []).map(cid => CHANNELS[cid]).filter(Boolean);
    const channelChips = channels.map(c =>
      `<a class="channel-chip" style="--ch:${c.color}" href="${c.url}" target="_blank" rel="noopener">
        <span class="channel-logo">${c.logo}</span>
        <span>${c.name}</span>
      </a>`
    ).join("");

    const liveBadge = status === "live"
      ? `<span class="badge badge-live">🔴 שידור חי</span>`
      : status === "pregame"
        ? `<span class="badge badge-pregame">קדם-משחק</span>`
        : status === "finished"
          ? `<span class="badge badge-finished">הסתיים</span>`
          : "";

    const rel = U.relativeLabel(m.utc);
    const relChip = rel ? `<span class="chip chip-soft">${rel}</span>` : "";

    // ----- prediction / betting status -----
    const nowMs = Date.now();
    const startMs = new Date(m.utc).getTime();
    const minutesToKick = Math.round((startMs - nowMs) / 60000);
    const bettingLocked = minutesToKick <= 10; // ההימורים נסגרים 10 דק' לפני
    const predictionLocked = minutesToKick <= 5; // ניחושים נסגרים 5 דק' לפני
    const statusChips = `
      <div class="status-chips">
        <span class="status-pill ${predictionLocked ? "pill-locked" : "pill-open"}">
          🔮 ניחוש ${predictionLocked ? "נעול" : "פתוח"}
        </span>
        <span class="status-pill ${bettingLocked ? "pill-locked" : "pill-open"}">
          💰 הימור ${bettingLocked ? "נעול" : "פתוח"}
        </span>
        ${minutesToKick > 0 && minutesToKick <= 60 && !bettingLocked
          ? `<span class="status-pill pill-warn">⚠ הימורים נסגרים בעוד ${Math.max(0, minutesToKick-10)} דק׳</span>`
          : ""}
      </div>`;

    const odds = m.odds ? `
      <div class="odds">
        <div class="odd"><span class="odd-k">1</span><span class="odd-v">${m.odds.home}</span></div>
        <div class="odd"><span class="odd-k">X</span><span class="odd-v">${m.odds.draw}</span></div>
        <div class="odd"><span class="odd-k">2</span><span class="odd-v">${m.odds.away}</span></div>
      </div>` : "";

    const favBtn = (code) => fav.has(code)
      ? `<button class="fav-btn fav-on" data-fav="${code}" title="הסר מהמועדפים">★</button>`
      : `<button class="fav-btn" data-fav="${code}" title="הוסף למועדפים">☆</button>`;

    return `
    <article class="match-card status-${status}" data-match-id="${m.id}">
      <header class="mc-header">
        <div class="mc-stage">
          <span class="chip">${stage.name}${m.group ? ` · בית ${m.group}` : ""}</span>
          ${relChip}
          ${liveBadge}
        </div>
        <div class="mc-time">
          <div class="mc-time-time">${time}</div>
          <div class="mc-time-date">${date}</div>
        </div>
      </header>

      <div class="mc-body">
        <div class="team team-home">
          ${favBtn(home.code)}
          <span class="flag" aria-hidden="true">${home.flag}</span>
          <span class="team-name">${home.name}</span>
        </div>

        <div class="mc-vs">
          <div class="vs-line"></div>
          <div class="vs-cd" data-countdown="${m.utc}">--:--:--</div>
          <div class="vs-label">נגד</div>
        </div>

        <div class="team team-away">
          <span class="team-name">${away.name}</span>
          <span class="flag" aria-hidden="true">${away.flag}</span>
          ${favBtn(away.code)}
        </div>
      </div>

      <div class="mc-venue">
        <span>🏟️ ${venue.name}</span>
        <span>📍 ${venue.city}${venue.country ? ", " + venue.country : ""} ${venue.flag || ""}</span>
      </div>

      <div class="mc-ai">🤖 ${m.aiInsight || ""}</div>

      ${statusChips}

      ${odds}

      <div class="mc-broadcast">
        <div class="bc-label">שידור בישראל:</div>
        <div class="bc-chips">${channelChips || '<span class="muted">טרם נקבע</span>'}</div>
        ${m.studioShow ? `<div class="bc-studio">🎬 ${m.studioShow} · קדם-משחק ${m.preGameMinutes || 30} דק׳ לפני שריקת הפתיחה</div>` : ""}
      </div>

      <div class="mc-actions">
        <button class="btn btn-primary" data-action="open-match" data-match-id="${m.id}">פתח עמוד משחק</button>
        <button class="btn ${reminders.h60 ? "btn-on" : ""}"        data-action="remind"  data-key="h60"        data-match-id="${m.id}">⏰ שעה לפני</button>
        <button class="btn ${reminders.m15 ? "btn-on" : ""}"        data-action="remind"  data-key="m15"        data-match-id="${m.id}">⏰ 15 דק׳</button>
        <button class="btn ${reminders.betsClose ? "btn-on" : ""}"  data-action="remind"  data-key="betsClose"  data-match-id="${m.id}">💰 סגירת הימורים</button>
        <a class="btn btn-watch" href="${channels[0]?.url || "#"}" target="_blank" rel="noopener">
          ${status === "live"    ? "▶ צפה עכשיו"
          : status === "pregame" ? "▶ קדם-משחק חי"
          : status === "finished"? "🎞️ עבור לשיא"
          : "📌 הכן לצפייה"}
        </a>
      </div>
    </article>`;
  }

  /* ---------- VIEW: CARDS (grouped by Israeli day) ---------- */
  function renderCardView(container) {
    const list = filteredMatches();
    if (!list.length) {
      container.innerHTML = `<div class="empty-state">לא נמצאו משחקים תואמים לסינון הנוכחי.</div>`;
      return;
    }
    const byDay = new Map();
    list.forEach(m => {
      const k = U.israelDateKey(m.utc);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(m);
    });
    const html = [...byDay.entries()].map(([dayKey, matches]) => {
      const sample = matches[0];
      const heading = U.formatIsraelDate(sample.utc);
      const rel = U.relativeLabel(sample.utc);
      return `
        <section class="day-section" data-day="${dayKey}">
          <h3 class="day-heading">
            <span>${heading}</span>
            ${rel ? `<span class="chip chip-strong">${rel}</span>` : ""}
            <span class="muted">${matches.length} משחקים</span>
          </h3>
          <div class="card-grid">
            ${matches.map(renderMatchCard).join("")}
          </div>
        </section>`;
    }).join("");
    container.innerHTML = html;
  }

  /* ---------- VIEW: CALENDAR (June-July 2026 grid) ---------- */
  function renderCalendarView(container) {
    const months = [
      { y: 2026, m: 6, name: "יוני 2026" },
      { y: 2026, m: 7, name: "יולי 2026" },
    ];
    const byDay = new Map();
    filteredMatches().forEach(m => {
      const k = U.israelDateKey(m.utc);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(m);
    });
    const today = U.todayKey();

    const html = months.map(({ y, m, name }) => {
      const first = new Date(`${y}-${String(m).padStart(2,"0")}-01T12:00:00`);
      const startDow = first.getDay(); // 0=Sun
      const last = new Date(y, m, 0).getDate();
      const cells = [];
      for (let i = 0; i < startDow; i++) cells.push(`<div class="cal-cell cal-empty"></div>`);
      for (let d = 1; d <= last; d++) {
        const key = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
        const dayMatches = byDay.get(key) || [];
        const isToday = key === today;
        const liveDay = dayMatches.some(x => U.matchLiveStatus(x) === "live");
        cells.push(`
          <button class="cal-cell ${isToday ? "is-today" : ""} ${dayMatches.length ? "has-matches" : ""} ${liveDay ? "is-live" : ""}" data-day-click="${key}">
            <div class="cal-num">${d}</div>
            ${dayMatches.length ? `<div class="cal-count">${dayMatches.length} 🏟️</div>` : ""}
            ${dayMatches.slice(0,2).map(m => {
              const h = TEAMS[m.home]?.flag || "❓";
              const a = TEAMS[m.away]?.flag || "❓";
              return `<div class="cal-mini">${h}-${a}</div>`;
            }).join("")}
            ${dayMatches.length > 2 ? `<div class="cal-mini muted">+${dayMatches.length-2}</div>` : ""}
          </button>`);
      }
      return `
        <div class="cal-month">
          <h3 class="cal-title">${name}</h3>
          <div class="cal-grid">
            <div class="cal-dow">א׳</div><div class="cal-dow">ב׳</div><div class="cal-dow">ג׳</div>
            <div class="cal-dow">ד׳</div><div class="cal-dow">ה׳</div><div class="cal-dow">ו׳</div>
            <div class="cal-dow">ש׳</div>
            ${cells.join("")}
          </div>
        </div>`;
    }).join("");

    container.innerHTML = `
      <div class="cal-wrap">${html}</div>
      <div id="cal-day-panel" class="cal-day-panel"></div>
    `;
  }

  function renderCalendarDayPanel(dayKey) {
    const panel = document.getElementById("cal-day-panel");
    if (!panel) return;
    const list = filteredMatches({ selectedDay: dayKey });
    if (!list.length) {
      panel.innerHTML = `<div class="empty-state">אין משחקים בתאריך זה.</div>`;
      return;
    }
    panel.innerHTML = `
      <h3 class="day-heading">${U.formatIsraelDate(list[0].utc)}</h3>
      <div class="card-grid">${list.map(renderMatchCard).join("")}</div>`;
  }

  /* ---------- VIEW: TIMELINE ---------- */
  function renderTimelineView(container) {
    const list = filteredMatches();
    if (!list.length) {
      container.innerHTML = `<div class="empty-state">לא נמצאו משחקים.</div>`;
      return;
    }
    const html = list.map(m => {
      const home = teamDisplay(m.home);
      const away = teamDisplay(m.away);
      const time = U.formatIsraelTime(m.utc);
      const date = U.formatIsraelDate(m.utc, { short: true });
      const stage = STAGES[m.stage]?.name || m.stage;
      const status = U.matchLiveStatus(m);
      const channels = (m.channels || []).map(cid => CHANNELS[cid]?.name).filter(Boolean).join(" · ");
      return `
        <div class="tl-row status-${status}">
          <div class="tl-time">
            <div class="tl-t">${time}</div>
            <div class="tl-d muted">${date}</div>
          </div>
          <div class="tl-dot"></div>
          <div class="tl-body">
            <div class="tl-teams">
              <span>${home.flag} ${home.name}</span>
              <span class="muted">נגד</span>
              <span>${away.name} ${away.flag}</span>
            </div>
            <div class="tl-meta muted">${stage} ${m.group ? "· בית " + m.group : ""} · ${channels || "—"}</div>
          </div>
          <div class="tl-cd" data-countdown="${m.utc}">--:--:--</div>
          <button class="btn btn-small" data-action="open-match" data-match-id="${m.id}">פתח</button>
        </div>`;
    }).join("");
    container.innerHTML = `<div class="timeline">${html}</div>`;
  }

  /* ---------- BRACKET (knockout integration) ---------- */
  function renderBracket(container) {
    const stages = ["R32","R16","QF","SF","FINAL"];
    const titles = { R32:"שלב 32", R16:"שלב 16", QF:"רבע גמר", SF:"חצי גמר", FINAL:"הגמר" };
    const html = stages.map(s => {
      const list = allMatches().filter(m => m.stage === s);
      return `
        <div class="br-col">
          <h4 class="br-title">${titles[s]}</h4>
          ${list.map(m => `
            <div class="br-match">
              <div class="br-team">${TEAMS[m.home]?.flag || "❓"} ${TEAMS[m.home]?.name || m.home}</div>
              <div class="br-team">${TEAMS[m.away]?.flag || "❓"} ${TEAMS[m.away]?.name || m.away}</div>
              <div class="br-time muted">${U.formatIsraelDate(m.utc, {short:true})} · ${U.formatIsraelTime(m.utc)}</div>
            </div>`).join("")}
        </div>`;
    }).join("");
    container.innerHTML = `<div class="bracket">${html}</div>`;
  }

  /* ---------- MATCH DETAIL MODAL ---------- */
  function openMatchModal(matchId) {
    const m = allMatches().find(x => x.id === matchId);
    if (!m) return;
    const home = teamDisplay(m.home);
    const away = teamDisplay(m.away);
    const venue = VENUES[m.venue] || {};
    const stage = STAGES[m.stage] || {};
    const channels = (m.channels || []).map(cid => CHANNELS[cid]).filter(Boolean);
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <button class="modal-close" aria-label="סגור">✕</button>
        <header class="modal-header">
          <h2>${home.flag} ${home.name} <span class="muted">נגד</span> ${away.name} ${away.flag}</h2>
          <div class="muted">${stage.name} ${m.group ? "· בית " + m.group : ""}</div>
        </header>
        <section class="modal-section">
          <div class="modal-time">
            <div>📅 ${U.formatIsraelDate(m.utc)}</div>
            <div>🕒 ${U.formatIsraelTime(m.utc)} (שעון ישראל)</div>
            <div data-countdown="${m.utc}" class="modal-cd">--:--:--</div>
          </div>
          <div class="modal-venue">
            🏟️ ${venue.name || ""}<br/>
            📍 ${venue.city || ""}, ${venue.country || ""} ${venue.flag || ""}<br/>
            👥 קיבולת: ${venue.capacity ? venue.capacity.toLocaleString("he-IL") : "—"}
          </div>
        </section>
        <section class="modal-section">
          <h3>🤖 תובנת AI</h3>
          <p>${m.aiInsight || ""}</p>
        </section>
        ${m.odds ? `
        <section class="modal-section">
          <h3>📊 יחסי הימורים</h3>
          <div class="odds">
            <div class="odd"><span class="odd-k">${home.name}</span><span class="odd-v">${m.odds.home}</span></div>
            <div class="odd"><span class="odd-k">תיקו</span><span class="odd-v">${m.odds.draw}</span></div>
            <div class="odd"><span class="odd-k">${away.name}</span><span class="odd-v">${m.odds.away}</span></div>
          </div>
        </section>` : ""}
        <section class="modal-section">
          <h3>📺 שידור בישראל</h3>
          <div class="bc-chips">
            ${channels.map(c => `
              <a class="channel-chip channel-big" style="--ch:${c.color}" href="${c.url}" target="_blank" rel="noopener">
                <span class="channel-logo">${c.logo}</span>
                <span>${c.name}</span>
                <span class="muted">${c.type}</span>
              </a>`).join("") || '<span class="muted">טרם נקבע</span>'}
          </div>
          ${m.studioShow ? `<p>🎬 ${m.studioShow}</p>` : ""}
          <p class="muted">קדם-משחק מתחיל ${m.preGameMinutes || 30} דקות לפני שריקת הפתיחה.</p>
        </section>
        <section class="modal-section">
          <h3>⏰ תזכורות</h3>
          <div class="mc-actions">
            <button class="btn" data-action="remind" data-key="h60" data-match-id="${m.id}">⏰ שעה לפני</button>
            <button class="btn" data-action="remind" data-key="m15" data-match-id="${m.id}">⏰ 15 דקות לפני</button>
            <button class="btn" data-action="remind" data-key="betsClose" data-match-id="${m.id}">💰 סגירת הימורים</button>
          </div>
        </section>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.classList.contains("modal-close")) overlay.remove();
    });
  }

  return {
    allMatches, filteredMatches, teamDisplay,
    renderMatchCard, renderCardView, renderCalendarView, renderCalendarDayPanel,
    renderTimelineView, renderBracket, openMatchModal,
  };
})();

window.SCHEDULE = SCHEDULE;
