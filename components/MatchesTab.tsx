"use client";
/* =====================================================================
 * MatchesTab — modern live-results center.
 * Inspired by Sofascore / Flashscore / OneFootball.
 *
 * Sections (top pills):
 *   על פי שלב — all matches grouped by tournament stage (default)
 *   חי   — currently live matches (pregame + live)
 *   היום — all matches today (regardless of status)
 *
 * Designed mobile-first; dark glassmorphism aesthetic.
 * ===================================================================*/
import { useEffect, useMemo, useRef, useState } from "react";
import { MATCHES, TEAMS, VENUES, STAGES, CHANNELS } from "@/lib/data";
import { useStore } from "@/lib/store";
import {
  israelDateKey, todayKey, formatIsraelDate, formatIsraelTime,
  matchLiveStatus, relativeLabel,
} from "@/lib/utils";
import { effMatch } from "@/lib/sim";
import { useOddsMap } from "@/lib/useOddsMap";
import { resolveAllStages } from "@/lib/bracket";
import type { Match, StageId } from "@/lib/types";
import MatchModal from "./MatchModal";
import MatchCard from "./MatchCard";

type Section = "stages" | "live" | "today";

/* Stage display order + Hebrew titles used in the "by stage" view. */
const STAGE_ORDER: StageId[] = ["GROUP", "R32", "R16", "QF", "SF", "THIRD", "FINAL"];
const STAGE_TITLES: Record<StageId, string> = {
  GROUP: "שלב הבתים",
  R32:   "32 אחרונות",
  R16:   "שמינית גמר",
  QF:    "רבע גמר",
  SF:    "חצי גמר",
  THIRD: "משחק על המקום השלישי",
  FINAL: "הגמר",
};

export default function MatchesTab() {
  const overrides    = useStore(s => s.overrides);
  const simConfig    = useStore(s => s.simConfig);
  const matchResults = useStore(s => s.matchResults);
  const refreshMatchResults = useStore(s => s.refreshMatchResults);
  const liveScores   = useStore(s => s.liveScores);
  const refreshLiveScores = useStore(s => s.refreshLiveScores);

  const [section, setSection] = useState<Section>("stages");
  const [openId, setOpenId]   = useState<string | null>(null);
  const [now, setNow]         = useState(() => Date.now());

  /* Scroll-to-today plumbing. We render an invisible anchor at the current
   * Israel-date inside the stage view; on first mount (and whenever the user
   * presses the floating button) we scroll it into view. */
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const didInitialScroll = useRef(false);
  const [todayVisible, setTodayVisible] = useState(true);

  function scrollToToday(behavior: ScrollBehavior = "smooth") {
    const root = bodyRef.current;
    if (!root) return false;
    const t = todayKey();
    /* Pick the target DAY first (today / closest upcoming / earliest). */
    let dayEl: HTMLElement | null = root.querySelector<HTMLElement>(`[data-date="${t}"]`);
    if (!dayEl) {
      const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-date]"));
      dayEl = nodes.find(n => (n.getAttribute("data-date") || "") >= t) || nodes[0] || null;
    }
    if (!dayEl) return false;

    /* Target the day SECTION itself (not just the first card) so its
     * heading — "יום שישי, 12 יוני 2026 · היום · X משחקים" — stays visible
     * above the cards instead of being scrolled past. */

    /* OFFSET clears whatever sticky element covers the top of the
     * viewport: mobile browser URL bar (~60px) or desktop sticky pills
     * bar (~56px) — using 70-90px gives a small breathing buffer. */
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
    const OFFSET = isMobile ? 70 : 90;
    const rect = dayEl.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - OFFSET;
    window.scrollTo({ top: Math.max(0, targetY), behavior });
    return true;
  }

  /* Scroll-to-finished plumbing. Lets users jump straight to the cards of
   * matches that have already ended (real result entered manually or
   * synced) — these can otherwise sit far down the list, after the
   * today/upcoming days for the same stage. */
  function scrollToFinished(behavior: ScrollBehavior = "smooth") {
    const root = bodyRef.current;
    if (!root) return false;
    const card = root.querySelector<HTMLElement>('[data-finished="true"]');
    if (!card) return false;

    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
    const OFFSET = isMobile ? 70 : 90;
    const rect = card.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - OFFSET;
    window.scrollTo({ top: Math.max(0, targetY), behavior });
    return true;
  }

  /* Live tick — faster during active simulation so that match cards
   * transition through scheduled→pregame→live→finished as sim time
   * advances. 1s during sim, 10s otherwise. */
  useEffect(() => {
    const fast = !!simConfig?.enabled;
    const interval = fast ? 1000 : 10_000;
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [simConfig?.enabled]);

  /* Fetch results — faster during simulation since results land rapidly.
   * Also refresh whenever the tab becomes visible (user switching back). */
  useEffect(() => {
    refreshMatchResults?.();
    const fast = !!simConfig?.enabled;
    const interval = fast ? 3_000 : 10_000;
    const id = setInterval(() => refreshMatchResults?.(), interval);
    const onVisible = () => { if (document.visibilityState === "visible") refreshMatchResults?.(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [simConfig?.enabled, refreshMatchResults]);

  /* Live score ticker — same cadence as results polling. Informational
   * only (live_data/live_scores); never affects predictions. */
  useEffect(() => {
    refreshLiveScores?.();
    const fast = !!simConfig?.enabled;
    const interval = fast ? 3_000 : 10_000;
    const id = setInterval(() => refreshLiveScores?.(), interval);
    const onVisible = () => { if (document.visibilityState === "visible") refreshLiveScores?.(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [simConfig?.enabled, refreshLiveScores]);

  /* While simulation is active, drive the server-side tick worker from the
   * client every 3s. The tick endpoint is idempotent and scans for matches
   * whose simulated 115-minute window has elapsed and writes a random result.
   * Vercel cron also runs this once a minute, but for fast sims we need
   * more granular ticks so users see results appear in near real-time. */
  useEffect(() => {
    if (!simConfig?.enabled) return;
    let cancelled = false;
    async function pump() {
      try { await fetch("/api/admin/simulation/tick", { cache: "no-store" }); } catch {}
    }
    pump();
    const id = setInterval(() => { if (!cancelled) pump(); }, 3_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [simConfig?.enabled]);

  /* Resolve knockout placeholders to real team codes once previous stages finish. */
  const resolved = useMemo(() => resolveAllStages(matchResults), [matchResults]);

  /* Real 1X2 odds (footballdata.io), keyed by match id. Only group-stage
   * matches close to kickoff have priced odds — others are simply absent. */
  const oddsMap = useOddsMap();

  /* All effective matches — with knockout placeholders swapped for real codes when known.
   * Knockout matches are HIDDEN from the schedule list until football-data.org
   * populates real teams (i.e., until the bracket resolver fills them in from
   * actual match results). The bracket tab still shows the bracket structure
   * for users who want to see the format. */
  const matches = useMemo(
    () => MATCHES
      .map(m => {
        const eff = effMatch(m, overrides[m.id], simConfig);
        const odds = oddsMap[m.id] || eff.odds;
        if (m.stage === "GROUP") return { ...eff, odds };
        const r = resolved[m.id];
        if (!r) return { ...eff, odds };
        return {
          ...eff,
          odds,
          home: r.home || eff.home,
          away: r.away || eff.away,
          homeIsPlaceholder: !r.home,
          awayIsPlaceholder: !r.away,
        };
      })
      .filter(m => {
        if (m.stage === "GROUP") return true;
        /* Knockout: only show once both teams are resolved (real, not placeholder). */
        return !m.homeIsPlaceholder && !m.awayIsPlaceholder;
      })
      .sort((a, b) => +new Date(a.utc) - +new Date(b.utc)),
    [overrides, simConfig, resolved, oddsMap]
  );

  /* Bucketed lists. "live"/"today" put currently-live matches FIRST so
   * users land on them without scrolling. */
  const buckets = useMemo(() => {
    const today = todayKey();
    const live: Match[] = [];
    const todays: Match[] = [];
    const liveOnly: Match[] = [];
    for (const m of matches) {
      const st = matchLiveStatus(m);
      const key = israelDateKey(m.utc);
      if (st === "live" || st === "pregame") live.push(m);
      if (st === "live") liveOnly.push(m);
      if (key === today) todays.push(m);
    }
    const byLiveFirst = (a: Match, b: Match) => {
      const aLive = matchLiveStatus(a) === "live";
      const bLive = matchLiveStatus(b) === "live";
      if (aLive !== bLive) return aLive ? -1 : 1;
      return 0; // keep existing chronological order otherwise
    };
    return {
      live: [...live].sort(byLiveFirst),
      today: [...todays].sort(byLiveFirst),
      liveOnly,
    };
  }, [matches, now]);

  const visible: Match[] = useMemo(() => {
    switch (section) {
      case "live":  return buckets.live;
      case "today": return buckets.today;
      default:      return buckets.today;
    }
  }, [section, buckets]);

  const counts = {
    live: buckets.live.length,
    today: buckets.today.length,
  };

  /* On entering the Matches tab (stages view), land directly on today's
   * matches — but keep the chronological list intact above/below so users
   * can still scroll BACK to finished matches or FORWARD to upcoming ones.
   * Uses an instant ("auto") jump, not a smooth animated scroll, so there's
   * no visible jumpiness — the page simply opens already positioned at
   * today. Runs once per mount (i.e. once per visit to the tab). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { (history as any).scrollRestoration = "manual"; } catch {}
    if (section !== "stages" || didInitialScroll.current) return;
    /* If a match is live right now, the pinned "חי כרגע" block at the very
     * top of the page already shows it — stay at the top instead of
     * jumping to today's section, so the live card needs no scrolling. */
    if (buckets.liveOnly.length > 0) { didInitialScroll.current = true; return; }
    const id = requestAnimationFrame(() => {
      scrollToToday("auto");
      didInitialScroll.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [section, matches, buckets.liveOnly.length]);

  /* Hide the floating "back to today" button when today's section is already
   * in view. Falls back to "any matches at all" check otherwise. */
  useEffect(() => {
    if (section !== "stages") { setTodayVisible(true); return; }
    const root = bodyRef.current;
    if (!root) { setTodayVisible(true); return; }
    const t = todayKey();
    /* Find the element to watch: today's section, else closest upcoming. */
    const exact = root.querySelector<HTMLElement>(`[data-date="${t}"]`);
    let target: HTMLElement | null = exact;
    if (!target) {
      const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-date]"));
      target = nodes.find(n => (n.getAttribute("data-date") || "") >= t) || null;
    }
    if (!target) { setTodayVisible(true); return; }
    const io = new IntersectionObserver(
      entries => { for (const e of entries) setTodayVisible(e.isIntersecting); },
      { rootMargin: "-100px 0px -40% 0px", threshold: 0 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [section, matches]);

  const showBackToToday = section === "stages" && !todayVisible;

  /* "Jump to results" — shown whenever at least one match (in the by-stage
   * view) already has a real result, so users can scroll straight to
   * finished-match cards regardless of where they sit in the list. */
  const hasFinished = useMemo(
    () => matches.some(m => !!matchResults[m.id]),
    [matches, matchResults]
  );
  const showJumpToFinished = section === "stages" && hasFinished;

  return (
    <section className="matches-tab">
      {/* Section pills */}
      <nav className="mt-sections" role="tablist" aria-label="קטגוריות">
        <PillBtn active={section === "stages"} onClick={() => setSection("stages")}
                 icon="📋" label="משחקים על פי שלב" />
        <PillBtn active={section === "live"}   onClick={() => setSection("live")}
                 icon={<LiveDot />} label="חי" badge={counts.live} highlight />
        <PillBtn active={section === "today"}  onClick={() => setSection("today")}
                 icon="📅" label="היום"        badge={counts.today} />
      </nav>

      {/* List body */}
      <div className="mt-body" ref={bodyRef}>
        {section === "stages" ? (
          <AllStagesSchedule matches={matches} onOpen={setOpenId} liveScores={liveScores} liveNow={buckets.liveOnly} />
        ) : visible.length === 0 ? (
          <EmptyState section={section} />
        ) : (
          <GroupedList list={visible} section={section} results={matchResults}
                       liveScores={liveScores} onOpen={setOpenId} />
        )}
      </div>

      {/* Floating "back to today" button — visible only when today's section
       * exists but is currently off-screen. */}
      {showBackToToday && (
        <button className="mt-back-to-today" onClick={() => scrollToToday("smooth")}
                aria-label="חזור להיום">
          🎯 חזור להיום
        </button>
      )}

      {/* Floating "jump to results" button — scrolls to the first
       * finished-match card so users can find results without manually
       * scrolling past today/upcoming days. */}
      {showJumpToFinished && (
        <button className="mt-back-to-today mt-jump-to-results" onClick={() => scrollToFinished("smooth")}
                aria-label="עבור לתוצאות">
          🏁 לתוצאות
        </button>
      )}

      {openId && <MatchModal matchId={openId} onClose={() => setOpenId(null)} />}
    </section>
  );
}

/* -------------------------- sub-components ------------------------- */

function PillBtn({ active, onClick, icon, label, badge, highlight }: {
  active: boolean; onClick: () => void;
  icon: React.ReactNode; label: string; badge?: number; highlight?: boolean;
}) {
  return (
    <button role="tab" aria-selected={active}
            className={`mt-pill ${active ? "on" : ""} ${highlight ? "is-live" : ""}`}
            onClick={onClick}>
      <span className="mt-pill-icon" aria-hidden>{icon}</span>
      <span className="mt-pill-label">{label}</span>
      {typeof badge === "number" && badge > 0 && <span className="mt-pill-badge">{badge}</span>}
    </button>
  );
}

function LiveDot() { return <span className="mt-live-dot" aria-hidden /> ; }

/* ----------- All-stages schedule (classic MatchCard view) ----------- */
function AllStagesSchedule({ matches, onOpen, liveScores, liveNow }: {
  matches: Match[];
  onOpen: (id: string) => void;
  liveScores: Record<string, any>;
  /** Matches currently live (status === "live") — pinned at the very top
   *  of the page so users see them immediately, without scrolling. */
  liveNow: Match[];
}) {
  /* Group matches by stage, then by day (within each stage). */
  const stageBlocks = useMemo(() => {
    return STAGE_ORDER.map(sid => {
      const list = matches.filter(m => m.stage === sid)
        .sort((a, b) => +new Date(a.utc) - +new Date(b.utc));
      const byDay = new Map<string, Match[]>();
      for (const m of list) {
        const k = israelDateKey(m.utc);
        if (!byDay.has(k)) byDay.set(k, []);
        byDay.get(k)!.push(m);
      }
      /* Plain chronological order (past → today → future) so users can
       * scroll BACK to see finished matches' cards (and forward for
       * upcoming ones). The "🎯 חזור להיום" floating button jumps straight
       * to today's section, giving the "today first" effect on demand
       * without hiding past days from normal scrolling. */
      const entries = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return { stage: sid, byDay: entries, count: list.length };
    }).filter(b => b.count > 0);
  }, [matches]);

  if (stageBlocks.length === 0) {
    return (
      <div className="mt-empty">
        <div className="mt-empty-icon" aria-hidden>⚽</div>
        <div>אין משחקים</div>
      </div>
    );
  }

  return (
    <>
      {/* Pinned "live now" block — shown at the very top of the page when a
       * match is currently live, so users see it immediately with no
       * scrolling. The same match still appears in its normal chronological
       * spot below for browsing. */}
      {liveNow.length > 0 && (
        <section className="mt-stage-block mt-live-pinned">
          <h3 className="day-heading mt-live-pinned-heading">
            <span className="mt-live-dot" aria-hidden />
            <span>חי כרגע</span>
          </h3>
          <div className="card-grid">
            {liveNow.map(m => <MatchCard key={`live-${m.id}`} match={m} onOpen={onOpen} live={liveScores[m.id]} />)}
          </div>
        </section>
      )}
      {stageBlocks.map(block => (
        <section key={block.stage} className="mt-stage-block">
          {/* Stage title removed — each MatchCard shows its own stage chip. */}
          {block.byDay.map(([day, ms]) => (
            <section key={day} className="day-section" data-date={day}>
              <h3 className="day-heading hide-on-mobile">
                <span>{formatIsraelDate(ms[0].utc)}</span>
                {relativeLabel(ms[0].utc) && (
                  <span className="chip chip-strong">{relativeLabel(ms[0].utc)}</span>
                )}
                <span className="muted">{ms.length} משחקים</span>
              </h3>
              <div className="card-grid">
                {ms.map(m => <MatchCard key={m.id} match={m} onOpen={onOpen} live={liveScores[m.id]} />)}
              </div>
            </section>
          ))}
        </section>
      ))}
    </>
  );
}

function EmptyState({ section }: { section: Section }) {
  const msg = section === "live"  ? "אין משחקים חיים כרגע"
            : section === "today" ? "אין משחקים היום"
            :                       "אין משחקים";
  return (
    <div className="mt-empty">
      <div className="mt-empty-icon" aria-hidden>⚽</div>
      <div>{msg}</div>
    </div>
  );
}

function GroupedList({ list, section, results, liveScores, onOpen }: {
  list: Match[]; section: Section;
  results: Record<string, { home: number; away: number; finishedAt: number }>;
  liveScores: Record<string, any>;
  onOpen: (id: string) => void;
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of list) {
      const k = israelDateKey(m.utc);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    }
    return [...map.entries()];
  }, [list]);

  return (
    <>
      {byDay.map(([day, ms]) => (
        <div key={day} className="mt-day">
          <div className="mt-day-header">
            <span className="mt-day-label">{formatIsraelDate(ms[0].utc)}</span>
            {relativeLabel(ms[0].utc) && <span className="mt-day-rel">{relativeLabel(ms[0].utc)}</span>}
            <span className="mt-day-count">{ms.length} משחקים</span>
          </div>
          <div className="mt-cards">
            {ms.map(m => (
              <MatchCardModern key={m.id} match={m} result={results[m.id]} live={liveScores[m.id]}
                onOpen={() => onOpen(m.id)} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/* ---------------------- Modern Match Card ------------------------- */

function MatchCardModern({ match, result, live, onOpen }: {
  match: Match;
  result?: { home: number; away: number; finishedAt: number };
  live?: import("@/lib/store").LiveScore;
  onOpen: () => void;
}) {
  const home = TEAMS[match.home] || { code: match.home, name: match.home, flag: "❓" };
  const away = TEAMS[match.away] || { code: match.away, name: match.away, flag: "❓" };
  const venue = VENUES[match.venue] || { name: match.venue, city: "", country: "", flag: "" };
  const stage = STAGES[match.stage];
  /* If a result exists in DB (e.g. via "instant results" in sim), treat the
   * match as finished regardless of clock. */
  const baseStatus = matchLiveStatus(match);
  const status = result ? "finished" : baseStatus;
  const channels = (match.channels || []).map(c => CHANNELS[c]).filter(Boolean);

  /* A result existing in DB is the source of truth for "finished". */
  const isFinished = !!result;

  /* Show the live ticker (score / clock / goals) while the match is
   * actually live, OR once it's presumed over but the result hasn't
   * landed yet — the live ticker then doubles as a provisional result. */
  const showLiveTicker = status === "live" || (status === "finished" && !isFinished);

  /* Live minute estimate (approx, since we don't have a real live feed):
   * minutes since kickoff capped at 90 + ET. Used as a fallback when the
   * AI live ticker (lib/sync-results-core.ts → live_data/live_scores)
   * hasn't produced a minuteLabel yet. First half ~45', then a ~15' halftime
   * break before the second half kicks off, so wall-clock minute 45-60 is
   * shown as "HT". */
  const liveMinuteFallback = useMemo(() => {
    if (status !== "live") return null;
    const m = Math.floor((Date.now() - +new Date(match.utc)) / 60000);
    if (m < 45) return `${m}'`;
    if (m < 63) return "HT"; // 45' + ~3' stoppage + 15' HT break
    const second = m - 18; // second-half game minute (wall-clock - ~3' stoppage - 15' HT)
    if (second >= 105) return "FT?";
    if (second >= 90) return `90+${second - 90}`;
    return `${second}'`;
  }, [status, match.utc]);

  /* Live ticker clock label. Prefers the AI-sourced minuteLabel — but
   * guards against a stale "HT": halftime breaks don't realistically run
   * past ~20 minutes of wall-clock time, so if the AI still says "HT" well
   * after that, fall back to our own estimate instead. */
  const clockLabel = useMemo(() => {
    if (status === "finished") return "הסתיים";
    if (status !== "live") return null;
    const m = Math.floor((Date.now() - +new Date(match.utc)) / 60000);
    const aiLabel = live?.minuteLabel;
    if (aiLabel && !(aiLabel === "HT" && m > 65)) return aiLabel;
    return liveMinuteFallback;
  }, [status, match.utc, live?.minuteLabel, liveMinuteFallback]);

  /* Goals scored so far, sorted by minute and split by team so each list
   * can render under that team's own flag. */
  const { homeGoals, awayGoals } = useMemo(() => {
    const goals = live?.goals;
    if (!showLiveTicker || !goals || goals.length === 0) return { homeGoals: [], awayGoals: [] };
    const sorted = [...goals].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
    return {
      homeGoals: sorted.filter(g => g.team !== "away"),
      awayGoals: sorted.filter(g => g.team === "away"),
    };
  }, [showLiveTicker, live]);

  return (
    <article className={`mt-card status-${status}`}
             onClick={onOpen}
             onKeyDown={(e) => e.key === "Enter" && onOpen()}
             role="button" tabIndex={0}>
      <header className="mt-card-head">
        <div className="mt-card-stage">
          <span className="chip chip-stage">{stage?.name}{match.group ? ` · בית ${match.group}` : ""}</span>
        </div>
        <div className="mt-card-status">
          {status === "live" && (
            <span className="mt-live-pill">
              <span className="mt-live-dot" aria-hidden /> חי · {clockLabel}
            </span>
          )}
          {status === "pregame"  && <span className="mt-status-pill pregame">קדם-משחק</span>}
          {status === "finished" && <span className="mt-status-pill finished">הסתיים</span>}
          {status === "scheduled" && (
            <span className="mt-status-pill scheduled">
              {formatIsraelTime(match.utc)}
            </span>
          )}
        </div>
      </header>

      <div className="mt-card-body">
        {/* Home team */}
        <div className="mt-team home">
          <span className="mt-flag">{home.flag}</span>
          <span className="mt-team-name">{home.name}</span>
          {homeGoals.length > 0 && (
            <div className="mc-team-goals">
              {homeGoals.map((g, i) => (
                <span key={i} className="mt-live-goal">
                  ⚽ {g.minute != null ? `${g.minute}'` : ""} {g.player || ""}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Score / vs */}
        <div className="mt-score-wrap">
          {result ? (
            <div className="mt-score">
              <span className="mt-score-num">{result.home}</span>
              <span className="mt-score-sep">:</span>
              <span className="mt-score-num">{result.away}</span>
            </div>
          ) : showLiveTicker ? (
            <div className="mt-score live">
              <span className="mt-score-num">{live ? live.home : "–"}</span>
              <span className="mt-score-sep">:</span>
              <span className="mt-score-num">{live ? live.away : "–"}</span>
            </div>
          ) : (
            <div className="mt-vs">
              <div className="mt-vs-time">{formatIsraelTime(match.utc)}</div>
              <div className="mt-vs-date">{formatIsraelDate(match.utc, { short: true })}</div>
            </div>
          )}
        </div>

        {/* Away team */}
        <div className="mt-team away">
          <span className="mt-team-name">{away.name}</span>
          <span className="mt-flag">{away.flag}</span>
          {awayGoals.length > 0 && (
            <div className="mc-team-goals">
              {awayGoals.map((g, i) => (
                <span key={i} className="mt-live-goal">
                  ⚽ {g.minute != null ? `${g.minute}'` : ""} {g.player || ""}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="mt-card-foot">
        <span className="mt-venue">🏟 {venue.name}{venue.city ? ` · ${venue.city}` : ""}</span>
        {channels.length > 0 && (
          <span className="mt-broadcast">
            📺 {channels.slice(0, 2).map(c => c.name).join(" · ")}
            {channels.length > 2 ? ` +${channels.length - 2}` : ""}
          </span>
        )}
      </footer>
    </article>
  );
}
