/* =====================================================================
 * Admin panel: Super-Admin can edit broadcast channels, kickoff times,
 * and override broadcast data per match. Password gate via prompt.
 * Default admin password: mondial2026 (changeable via localStorage)
 * ===================================================================*/

const ADMIN = (() => {
  const { CHANNELS, TEAMS } = window.MONDIAL;
  const U = window.UTILS;
  const S = window.SCHEDULE;
  const DEFAULT_PW = "mondial2026";

  function loginPrompt() {
    const pw = prompt("הזן סיסמת Super Admin:");
    if (pw === null) return false;
    const stored = localStorage.getItem("mondial26.adminPw") || DEFAULT_PW;
    if (pw === stored) {
      U.setAdmin(true);
      alert("התחברת כ-Super Admin.");
      return true;
    }
    alert("סיסמה שגויה.");
    return false;
  }

  function logout() {
    U.setAdmin(false);
    alert("התנתקת ממצב Admin.");
  }

  function render(container, onChange) {
    if (!U.isAdmin()) {
      container.innerHTML = `
        <div class="admin-locked">
          <h3>🔒 ניהול שידורים — Super Admin</h3>
          <p class="muted">כניסה דרושה כדי לערוך שיבוצי שידור, להוסיף ערוצים ולעקוף נתוני שידור.</p>
          <button class="btn btn-primary" data-admin-login>כניסה</button>
        </div>`;
      container.querySelector("[data-admin-login]").addEventListener("click", () => {
        if (loginPrompt()) onChange();
      });
      return;
    }

    const matches = S.allMatches();
    const channelsList = Object.values(CHANNELS);
    const rows = matches.map(m => {
      const home = TEAMS[m.home]?.name || m.home;
      const away = TEAMS[m.away]?.name || m.away;
      const selected = new Set(m.channels || []);
      const opts = channelsList.map(c =>
        `<label class="adm-ch"><input type="checkbox" data-ch="${c.id}" ${selected.has(c.id)?"checked":""}/> ${c.logo} ${c.name}</label>`
      ).join("");
      return `
        <tr data-match-id="${m.id}">
          <td>${U.formatIsraelDate(m.utc,{short:true})}<br><span class="muted">${U.formatIsraelTime(m.utc)}</span></td>
          <td>${home} <span class="muted">נגד</span> ${away}</td>
          <td><input type="datetime-local" data-time value="${toLocalInput(m.utc)}"></td>
          <td class="adm-ch-cell">${opts}</td>
          <td><input type="text" data-studio value="${(m.studioShow||"").replace(/"/g,"&quot;")}" placeholder="תוכנית אולפן"></td>
          <td class="adm-actions">
            <button class="btn btn-small btn-primary" data-save>שמור</button>
            <button class="btn btn-small" data-reset>איפוס</button>
          </td>
        </tr>`;
    }).join("");

    container.innerHTML = `
      <div class="admin-bar">
        <h3>🛠️ ניהול שידורים — Super Admin</h3>
        <div>
          <button class="btn" data-action="add-channel">➕ הוסף ערוץ</button>
          <button class="btn" data-action="change-pw">🔑 שינוי סיסמה</button>
          <button class="btn" data-action="logout">יציאה</button>
        </div>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr><th>תאריך/שעה</th><th>משחק</th><th>שעת שידור (ישראל)</th><th>ערוצים</th><th>אולפן</th><th></th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    container.querySelectorAll("tr[data-match-id]").forEach(tr => {
      const mid = tr.dataset.matchId;
      tr.querySelector("[data-save]").addEventListener("click", () => {
        const time = tr.querySelector("[data-time]").value;
        const studio = tr.querySelector("[data-studio]").value;
        const chs = [...tr.querySelectorAll("[data-ch]:checked")].map(x => x.dataset.ch);
        const utc = fromLocalInput(time);
        U.setOverride(mid, { channels: chs, studioShow: studio, utc });
        onChange();
      });
      tr.querySelector("[data-reset]").addEventListener("click", () => {
        U.clearOverride(mid);
        onChange();
      });
    });

    container.querySelector("[data-action='logout']").addEventListener("click", () => {
      logout(); onChange();
    });
    container.querySelector("[data-action='change-pw']").addEventListener("click", () => {
      const np = prompt("סיסמה חדשה:");
      if (np) { localStorage.setItem("mondial26.adminPw", np); alert("הסיסמה עודכנה."); }
    });
    container.querySelector("[data-action='add-channel']").addEventListener("click", () => {
      const id = prompt("מזהה ערוץ (אנגלית, ללא רווחים):");
      if (!id) return;
      const name = prompt("שם הערוץ בעברית:");
      if (!name) return;
      const type = prompt("סוג (פתוח / כבלים-לוויין / סטרימינג):") || "כבלים/לוויין";
      const logo = prompt("אימוג׳י לוגו (למשל 📺):") || "📺";
      const color = prompt("צבע HEX (למשל #0a4d8c):") || "#444";
      const url = prompt("URL לצפייה:") || "#";
      const custom = JSON.parse(localStorage.getItem("mondial26.customChannels") || "{}");
      custom[id] = { id, name, type, logo, color, url, digital: true };
      localStorage.setItem("mondial26.customChannels", JSON.stringify(custom));
      Object.assign(window.MONDIAL.CHANNELS, custom);
      onChange();
    });
  }

  function toLocalInput(utcIso) {
    // Convert UTC ISO → YYYY-MM-DDTHH:MM in Asia/Jerusalem
    const p = U.israelParts(utcIso);
    return `${p.year}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}T${String(p.hour).padStart(2,"0")}:${String(p.minute).padStart(2,"0")}`;
  }
  function fromLocalInput(local) {
    // Treat as Asia/Jerusalem local → convert to UTC ISO.
    // Israel offset varies; we compute by sampling.
    const [date, time] = local.split("T");
    const [Y,M,D] = date.split("-").map(Number);
    const [h,m] = time.split(":").map(Number);
    // Build a Date in UTC, then determine offset of Israel at that time
    const guess = new Date(Date.UTC(Y, M-1, D, h, m));
    const offset = U.israelOffsetHours(guess.toISOString());
    return new Date(Date.UTC(Y, M-1, D, h - offset, m)).toISOString();
  }

  /* Bootstrap any custom channels into the global registry on load */
  (function loadCustom() {
    try {
      const c = JSON.parse(localStorage.getItem("mondial26.customChannels") || "{}");
      Object.assign(window.MONDIAL.CHANNELS, c);
    } catch {}
  })();

  return { render, loginPrompt, logout };
})();

window.ADMIN = ADMIN;
