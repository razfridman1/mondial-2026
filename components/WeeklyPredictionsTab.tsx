"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import { MATCHES, TEAMS } from "@/lib/data";
import { applyOverride, israelDateKey, HEB_MONTHS } from "@/lib/utils";
import { effectiveUtc } from "@/lib/sim";
import { resolveAllStages, resolvePlaceholder } from "@/lib/bracket";
import { PredictionRow, type MatchResult } from "./PredictionRow";

async function adminAuthHeaders() {
  const token = await getFirebase().auth!.currentUser!.getIdToken();
  return { "content-type": "application/json", authorization: `Bearer ${token}` };
}

const NEXT_WEEK_REMIND_KEY = "mondial26.weekpred.remind_dismissed";

/* =====================================================================
 * WeeklyPredictionsTab — fill predictions for the current week only.
 * Weeks are Mon–Sun in Israel time. Navigate with ← / → arrows.
 * ===================================================================*/

/** Returns an array of 7 date strings "YYYY-MM-DD" (Israel time) for
 *  the Mon–Sun week that is `weekOffset` weeks from the current week. */
function getWeekDates(weekOffset: number): string[] {
  // Anchor: today in Israel timezone
  const todayStr = israelDateKey(new Date().toISOString());
  const [y, m, d] = todayStr.split("-").map(Number);
  // Local Date object (no TZ needed — we just need day-of-week arithmetic)
  const today = new Date(y, m - 1, d);
  const dow = today.getDay(); // 0=Sun, 1=Mon, …
  // Offset to Monday: if Sunday (0) → -6, else → 1-dow
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMon + weekOffset * 7);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    dates.push(
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
    );
  }
  return dates;
}

function formatWeekLabel(dates: string[]): string {
  const [sy, sm, sd] = dates[0].split("-").map(Number);
  const [ey, em, ed] = dates[6].split("-").map(Number);
  const startStr = `${sd} ${HEB_MONTHS[sm - 1]}`;
  const endStr = sy === ey
    ? `${ed} ${HEB_MONTHS[em - 1]}`
    : `${ed} ${HEB_MONTHS[em - 1]} ${ey}`;
  return `${startStr} – ${endStr}`;
}

export default function WeeklyPredictionsTab() {
  const user = useStore(s => s.user);
  const predictions = useStore(s => s.predictions);
  const overrides = useStore(s => s.overrides);
  const simConfig = useStore(s => s.simConfig);

  const isAdmin = !!(user as any)?.isAdmin;

  const [weekOffset, setWeekOffset] = useState(0);
  const [results, setResults] = useState<Record<string, MatchResult>>({});
  const [now, setNow] = useState(Date.now());
  const [reminderDismissed, setReminderDismissed] = useState(() => {
    try { return localStorage.getItem(NEXT_WEEK_REMIND_KEY) === "1"; } catch { return false; }
  });

  /* ---------------- Super-admin: bypass lock + edit any user's week ---------------- */
  const [allProfiles, setAllProfiles] = useState<{ uid: string; displayName?: string; email?: string }[]>([]);
  const [targetUid, setTargetUid] = useState<string>("");
  const [adminPreds, setAdminPreds] = useState<Record<string, any>>({});

  useEffect(() => {
    if (isAdmin && user?.uid && !targetUid) setTargetUid(user.uid);
  }, [isAdmin, user?.uid]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const r = await fetch("/api/admin/profiles", { headers: await adminAuthHeaders() });
        if (r.ok) setAllProfiles(await r.json());
      } catch {}
    })();
  }, [isAdmin]);

  async function loadAdminPreds(uid: string) {
    if (!isAdmin || !uid) return;
    try {
      const r = await fetch(`/api/admin/predictions?uid=${encodeURIComponent(uid)}`, { headers: await adminAuthHeaders() });
      if (r.ok) {
        const arr = await r.json();
        const map: Record<string, any> = {};
        for (const p of arr) map[p.matchId] = p;
        setAdminPreds(map);
      }
    } catch {}
  }
  useEffect(() => { if (isAdmin && targetUid) loadAdminPreds(targetUid); }, [isAdmin, targetUid]);

  async function saveAdminPrediction(matchId: string, home: number, away: number, winner?: string) {
    const r = await fetch("/api/admin/predictions", {
      method: "POST", headers: await adminAuthHeaders(),
      body: JSON.stringify({ uid: targetUid, matchId, homeScore: home, awayScore: away, ...(winner ? { predictedWinner: winner } : {}) }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.message || d.error || "שגיאה בשמירה");
    }
    await loadAdminPreds(targetUid);
  }
  async function clearAdminPrediction(matchId: string) {
    await fetch("/api/admin/predictions", {
      method: "DELETE", headers: await adminAuthHeaders(),
      body: JSON.stringify({ id: `${targetUid}_${matchId}` }),
    });
    await loadAdminPreds(targetUid);
  }

  /* Effective predictions map used for rendering: admins view/edit
   * `targetUid`'s picks (defaults to themselves); everyone else sees their
   * own live-synced store predictions as before. */
  const effectivePredictions = isAdmin ? adminPreds : predictions;

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const weekLabel = useMemo(() => formatWeekLabel(weekDates), [weekDates]);

  const relLabel =
    weekOffset === 0 ? "השבוע" :
    weekOffset === 1 ? "שבוע הבא" :
    weekOffset === -1 ? "שבוע שעבר" :
    weekOffset < 0 ? `לפני ${-weekOffset} שבועות` :
    `בעוד ${weekOffset} שבועות`;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/match-results");
      if (res.ok) setResults(await res.json());
    } catch {}
  }
  useEffect(() => { load(); }, [user?.uid]);
  useEffect(() => {
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, []);

  /* Resolve knockout placeholders */
  const resolved = useMemo(() => resolveAllStages(results), [results]);

  /* A prediction saved before its match's bracket slot resolved has
   * `predictedWinner` stored as the raw placeholder ("W R32-4" etc.) that
   * was on screen at the time. Resolve it here via the current bracket
   * state so a correct historical pick isn't shown/scored as wrong. */
  const resolvedEffectivePredictions = useMemo(() => {
    const out: typeof effectivePredictions = {};
    for (const [matchId, p] of Object.entries(effectivePredictions)) {
      const pw = (p as any)?.predictedWinner;
      out[matchId] = pw ? ({ ...p, predictedWinner: resolvePlaceholder(pw, results, resolved) || pw } as any) : p;
    }
    return out;
  }, [effectivePredictions, results, resolved]);

  /* Effective matches with sim overrides */
  const matches = useMemo(
    () => MATCHES.map(m => {
      const eff = applyOverride(m, overrides[m.id]);
      const base = { ...eff, utc: effectiveUtc(eff.utc, simConfig) };
      if (m.stage !== "GROUP") {
        const r = resolved[m.id];
        if (r) {
          const homeIsReal = !!TEAMS[r.home];
          const awayIsReal = !!TEAMS[r.away];
          if (homeIsReal || awayIsReal) {
            return {
              ...base,
              home: homeIsReal ? r.home : base.home,
              away: awayIsReal ? r.away : base.away,
              homeIsPlaceholder: !homeIsReal,
              awayIsPlaceholder: !awayIsReal,
            };
          }
        }
      }
      return base;
    }),
    [overrides, simConfig, resolved]
  );

  /* Filter to current week (by Israel date) */
  const weekMatches = useMemo(() => {
    const dateSet = new Set(weekDates);
    return matches
      .filter(m => dateSet.has(israelDateKey(m.utc)))
      .sort((a, b) => +new Date(a.utc) - +new Date(b.utc));
  }, [matches, weekDates]);

  /* Count how many matches in week have predictions filled */
  const filledCount = useMemo(
    () => weekMatches.filter(m => effectivePredictions[m.id]).length,
    [weekMatches, effectivePredictions]
  );
  const lockMs = 3 * 60 * 1000;
  const openCount = useMemo(
    () => weekMatches.filter(m => now < new Date(m.utc).getTime() - lockMs).length,
    [weekMatches, now]
  );

  /* Find earliest / latest match in tournament to bound week navigation */
  const tournamentDates = useMemo(
    () => MATCHES.map(m => israelDateKey(m.utc)).sort(),
    []
  );
  const firstDate = tournamentDates[0];
  const lastDate = tournamentDates[tournamentDates.length - 1];
  const canGoPrev = weekDates[6] >= firstDate;
  const canGoNext = weekDates[0] <= lastDate;

  /* Next-week reminder: show when:
   *  1. Currently viewing current week (weekOffset === 0)
   *  2. First match of next week is ≤ 48h away
   *  3. User has 0 predictions for any of next week's open matches
   *  4. User hasn't dismissed the reminder */
  const showNextWeekReminder = useMemo(() => {
    if (reminderDismissed || weekOffset !== 0) return false;
    const nextWeekDates = new Set(getWeekDates(1));
    const nextWeekMatches = matches.filter(m => nextWeekDates.has(israelDateKey(m.utc)));
    if (nextWeekMatches.length === 0) return false;
    const firstNextMatch = nextWeekMatches.reduce((a, b) =>
      new Date(a.utc) < new Date(b.utc) ? a : b
    );
    const hoursToFirst = (new Date(firstNextMatch.utc).getTime() - now) / 3_600_000;
    if (hoursToFirst > 48 || hoursToFirst < 0) return false;
    // Check if user has no predictions for open (not yet locked) next-week matches
    const LOCK_MS = 3 * 60 * 1000;
    const openNextMatches = nextWeekMatches.filter(
      m => now < new Date(m.utc).getTime() - LOCK_MS
    );
    const filledNext = openNextMatches.filter(m => predictions[m.id]).length;
    return filledNext === 0;
  }, [matches, now, predictions, reminderDismissed, weekOffset]);

  if (!user) {
    return (
      <section className="mypred-empty">
        <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
        <h2>ניחושי השבוע</h2>
        <p className="muted">היכנס כדי למלא ניחושים למשחקי השבוע.</p>
        <Link className="btn btn-primary" href="/login">כניסה</Link>
      </section>
    );
  }

  function dismissReminder() {
    setReminderDismissed(true);
    try { localStorage.setItem(NEXT_WEEK_REMIND_KEY, "1"); } catch {}
  }

  return (
    <section className="mypred">
      {/* ============ SUPER-ADMIN: pick whose week to view/edit ============ */}
      {isAdmin && (
        <div className="chip chip-soft" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 10px", width: "fit-content" }}>
          <span>🛡️ מצב אדמין — עריכה עבור:</span>
          <select
            value={targetUid}
            onChange={e => setTargetUid(e.target.value)}
            style={{ padding: 4, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }}
          >
            {user?.uid && (
              <option value={user.uid}>עצמי ({user.email || user.uid.slice(0, 8)})</option>
            )}
            {allProfiles
              .filter(p => p.uid !== user?.uid)
              .map(p => <option key={p.uid} value={p.uid}>{p.displayName || p.email || p.uid.slice(0, 8)}</option>)}
          </select>
        </div>
      )}

      {/* ============ NEXT WEEK REMINDER BANNER ============ */}
      {showNextWeekReminder && (
        <div className="weekly-reminder-banner">
          <span className="weekly-reminder-icon">⏰</span>
          <div className="weekly-reminder-text">
            <strong>כדאי למלא ניחושים לשבוע הבא!</strong>
            <span className="muted"> המשחקים יתחילו בקרוב — מלא עכשיו לפני שייסגר</span>
          </div>
          <div className="weekly-reminder-actions">
            <button
              className="btn btn-small btn-primary"
              onClick={() => { setWeekOffset(1); dismissReminder(); }}
            >
              מלא עכשיו ›
            </button>
            <button
              className="btn btn-small"
              onClick={dismissReminder}
              aria-label="סגור"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ============ WEEK NAV ============ */}
      <div className="weekly-nav">
        <button
          className="btn btn-small weekly-nav-arrow"
          onClick={() => setWeekOffset(o => o - 1)}
          disabled={!canGoPrev}
        >
          שבוע קודם
        </button>

        <div className="weekly-nav-center">
          <span className="weekly-nav-rel">{relLabel}</span>
          <span className="weekly-nav-dates">{weekLabel}</span>
        </div>

        <button
          className="btn btn-small weekly-nav-arrow"
          onClick={() => setWeekOffset(o => o + 1)}
          disabled={!canGoNext}
          aria-label="שבוע הבא"
        >
          שבוע הבא
        </button>
      </div>

      {/* ============ STATS ROW ============ */}
      {weekMatches.length > 0 && (
        <div className="weekly-stats">
          <span className="chip chip-soft">
            ⚽ {weekMatches.length} משחקים השבוע
          </span>
          {filledCount > 0 && (
            <span className="chip chip-soft">
              🔮 {filledCount} / {weekMatches.length} מולאו
            </span>
          )}
          {openCount > 0 && (
            <span className="chip chip-soft">
              ✏️ {openCount} פתוחים לניחוש
            </span>
          )}
        </div>
      )}

      {/* ============ MATCHES ============ */}
      <div className="mypred-list">
        {weekMatches.length === 0 ? (
          <div className="empty-state" style={{ padding: "40px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📅</div>
            <div>אין משחקים בשבוע {weekLabel}</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              {weekOffset < 0 ? "לחץ ›  לשבוע הבא" : "לחץ ‹ לשבוע הבא"}
            </div>
          </div>
        ) : (
          weekMatches.map(m => (
            <PredictionRow
              key={m.id}
              match={m}
              prediction={resolvedEffectivePredictions[m.id]}
              result={results[m.id]}
              now={now}
              onSaved={load}
              adminMode={isAdmin}
              onAdminSave={isAdmin ? saveAdminPrediction : undefined}
              onAdminClear={isAdmin ? clearAdminPrediction : undefined}
            />
          ))
        )}
      </div>
    </section>
  );
}
