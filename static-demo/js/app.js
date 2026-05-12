/* =====================================================================
 * App bootstrap: tab routing, event delegation, countdown ticker,
 * realtime auto-refresh, notice ticker, mobile swipe between days.
 * ===================================================================*/

(function () {
  const U = window.UTILS;
  const S = window.SCHEDULE;
  const F = window.FILTERS;
  const B = window.BROADCASTS;
  const A = window.ADMIN;
  const AI = window.AI_INSIGHTS;

  /* ---------- TAB ROUTER ---------- */
  const TABS = ["schedule", "broadcasts", "bracket", "ai", "admin"];
  function getActiveTab() { return localStorage.getItem("mondial26.tab") || "schedule"; }
  function setActiveTab(t) { localStorage.setItem("mondial26.tab", t); }

  function activateTab(tab) {
    setActiveTab(tab);
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.toggle("on", p.dataset.tab === tab));
    render();
  }

  /* ---------- RENDER ROUTER ---------- */
  function render() {
    const tab = getActiveTab();
    if (tab === "schedule") renderSchedule();
    else if (tab === "broadcasts") renderBroadcasts();
    else if (tab === "bracket") S.renderBracket(document.getElementById("pane-bracket"));
    else if (tab === "ai") AI.render(document.getElementById("pane-ai"));
    else if (tab === "admin") A.render(document.getElementById("pane-admin"), render);
    renderHeaderClock();
  }

  function renderSchedule() {
    const pane = document.getElementById("pane-schedule");
    pane.innerHTML = `
      <div id="filters-box"></div>
      <div class="view-switch">
        <button class="seg" data-view="card">📋 כרטיסים</button>
        <button class="seg" data-view="calendar">📅 לוח שנה</button>
        <button class="seg" data-view="timeline">📜 ציר זמן</button>
      </div>
      <div id="schedule-body"></div>`;
    F.render(document.getElementById("filters-box"), render);
    const view = U.getPrefs().view || "card";
    pane.querySelectorAll(".view-switch .seg").forEach(b => {
      b.classList.toggle("on", b.dataset.view === view);
      b.addEventListener("click", () => { U.setPref("view", b.dataset.view); render(); });
    });
    const body = document.getElementById("schedule-body");
    if (view === "card") S.renderCardView(body);
    else if (view === "calendar") S.renderCalendarView(body);
    else if (view === "timeline") S.renderTimelineView(body);
  }

  function renderBroadcasts() {
    const pane = document.getElementById("pane-broadcasts");
    pane.innerHTML = `
      <section id="bc-hero"></section>
      <section><h2 class="sec-title">🇮🇱 ערוצי השידור</h2><div id="bc-grid"></div></section>
      <section><h2 class="sec-title">📅 לוח שידורים מלא לפי ערוץ</h2><div id="bc-by-channel"></div></section>
      <div id="bc-ticker" class="ticker"></div>`;
    B.renderHero(document.getElementById("bc-hero"));
    B.renderChannelGrid(document.getElementById("bc-grid"));
    B.renderByChannel(document.getElementById("bc-by-channel"));
  }

  /* ---------- HEADER CLOCK + DST badge ---------- */
  function renderHeaderClock() {
    const el = document.getElementById("header-clock");
    if (!el) return;
    const now = new Date();
    const t = U.formatIsraelTime(now.toISOString());
    const d = U.formatIsraelDate(now.toISOString(), { short: true });
    const off = U.israelOffsetHours(now.toISOString());
    el.innerHTML = `
      <span>🕒 ${t}</span>
      <span class="muted">${d}</span>
      <span class="chip chip-soft">שעון ישראל UTC+${off}${off===3?" (DST)":""}</span>`;
  }

  /* ---------- GLOBAL EVENT DELEGATION ---------- */
  document.addEventListener("click", (e) => {
    // Tabs
    const tabBtn = e.target.closest(".tab-btn");
    if (tabBtn) { activateTab(tabBtn.dataset.tab); return; }

    // Match modal
    const openMatch = e.target.closest("[data-action='open-match']");
    if (openMatch) { S.openMatchModal(openMatch.dataset.matchId); return; }

    // Reminder toggle
    const remind = e.target.closest("[data-action='remind']");
    if (remind) {
      const mid = remind.dataset.matchId;
      const key = remind.dataset.key;
      const curr = (U.getReminders()[mid] || {})[key];
      U.setReminder(mid, key, !curr);
      U.ensureNotifPermission();
      remind.classList.toggle("btn-on", !curr);
      return;
    }

    // Favorite team
    const favBtn = e.target.closest("[data-fav]");
    if (favBtn) {
      U.toggleFavTeam(favBtn.dataset.fav);
      render();
      return;
    }

    // Calendar day cell
    const calCell = e.target.closest("[data-day-click]");
    if (calCell) { S.renderCalendarDayPanel(calCell.dataset.dayClick); return; }
  });

  /* ---------- COUNTDOWN TICKER (every second) ---------- */
  setInterval(() => {
    document.querySelectorAll("[data-countdown]").forEach(el => {
      const { d, h, m, s } = U.countdownString(el.dataset.countdown);
      if (d + h + m + s === 0) { el.textContent = "🔴 חי / נגמר"; return; }
      el.textContent = `${String(d).padStart(2,"0")}י׳ ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    });
    renderHeaderClock();
  }, 1000);

  /* ---------- AUTO-REFRESH (every 60s) ---------- */
  setInterval(() => {
    const tab = getActiveTab();
    if (tab === "broadcasts" || tab === "schedule") render();
  }, 60000);

  /* ---------- REALTIME NOTICE TICKER ---------- */
  setInterval(() => {
    const ticker = document.getElementById("bc-ticker");
    if (!ticker) return;
    const note = B.simulateRealtimeNotice();
    if (note) {
      const item = document.createElement("div");
      item.className = "ticker-item";
      item.textContent = note;
      ticker.prepend(item);
      while (ticker.children.length > 5) ticker.lastChild.remove();
    }
  }, 25000);

  /* ---------- MOBILE: swipe between days ---------- */
  let touchStartX = null;
  document.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) < 80) return;
    if (getActiveTab() !== "schedule") return;
    const prefs = U.getPrefs();
    if (!prefs.selectedDay) return;
    const days = [...new Set(S.allMatches().map(m => U.israelDateKey(m.utc)))].sort();
    const idx = days.indexOf(prefs.selectedDay);
    if (idx === -1) return;
    const next = dx > 0 ? idx - 1 : idx + 1;
    if (next < 0 || next >= days.length) return;
    U.setPref("selectedDay", days[next]);
    render();
  }, { passive: true });

  /* ---------- INIT ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    activateTab(getActiveTab());
    U.startReminderEngine(() => S.allMatches());
    U.ensureNotifPermission();
  });
})();
