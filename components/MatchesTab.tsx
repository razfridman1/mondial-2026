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
    /* Clearance for the sticky section-pills row + sticky stage title above. */
    const OFFSET = 120;
    function jumpTo(el: HTMLElement) {
      const rect = el.getBoundingClientRect();
      const y = window.scrollY + rect.top - OFFSET;
      window.scrollTo({ top: Math.max(0, y), behavior });
    }
    const el = root.querySelector<HTMLElement>(`[data-date="${t}"]`);
    if (el) { jumpTo(el); return true; }
    /* No matches today → jump to the nearest upcoming day. */
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-date]"));
    for (const node of nodes) {
      const d = node.getAttribute("data-date") || "";
      if (d >= t) { jumpTo(node); return true; }
    }
    /* Otherwise (no future day either — tournament finished), jump to the last day. */
    const last = nodes[nodes.length - 1];
    if (last) { jumpTo(last); return true; }
    return false;
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

  /* All effective matches — with knockout placeholders swapped for real codes when known. */
  const matches = useMemo(
    () => MATCHES.map(m => {
      const eff = effMatch(m, overrides[m.id], simConfig);
      if (m.stage === "GROUP") return eff;
      const r = resolved[m.id];
      if (!r) return eff;
      return {
        ...eff,
        home: r.home || eff.home,
        away: r.away || eff.away,
        homeIsPlaceholder: !r.home,
        awayIsPlaceholder: !r.away,
      };
    }).sort((a, b) => +new Date(a.utc) - +new Date(b.utc)),
    [overrides, simConfig, resolved]
  );

  /* Bucketed lists */
  const buckets = useMemo(() => {
    const today = todayKey();
    const live: Match[] = [];
    const todays: Match[] = [];
    for (const m of matches) {
      const st = matchLiveStatus(m);
      const key = israelDateKey(m.utc);
      if (st === "live" || st === "pregame") live.push(m);
      if (key === today) todays.push(m);
    }
    return { live, today: todays };
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

  /* After the stages view renders, scroll to today's section ONCE on mount. */
  useEffect(() => {
    if (section !== "stages") return;
    if (didInitialScroll.current) return;
    /* Wait one tick so the layout finishes painting (sticky pills get a height). */
    const t = setTimeout(() => {
      const ok = scrollToToday("auto"); // auto (instant) on first load
      if (ok) didInitialScroll.current = true;
    }, 80);
    return () => clearTimeout(t);
  }, [section, matches]);

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
          <AllStagesSchedule matches={matches} onOpen={setOpenId} />
        ) : visible.length === 0 ? (
          <EmptyState section={section} />
        ) : (
          <GroupedList list={visible} section={section} results={matchResults}
                       onOpen={setOpenId} />
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
function AllStagesSchedule({ matches, onOpen }: {
  matches: Match[];
  onOpen: (id: string) => void;
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
      return { stage: sid, byDay: [...byDay.entries()], count: list.length };
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
      {stageBlocks.map(block => (
        <section key={block.stage} className="mt-stage-block">
          <h2 className="mt-stage-title">
            <span className="mt-stage-title-text">{STAGE_TITLES[block.stage]}</span>
            <span className="mt-stage-title-count">{block.count} משחקים</span>
          </h2>
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
                {ms.map(m => <MatchCard key={m.id} match={m} onOpen={onOpen} />)}
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

function GroupedList({ list, section, results, onOpen }: {
  list: Match[]; section: Section;
  results: Record<string, { home: number; away: number; finishedAt: number }>;
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
              <MatchCardModern key={m.id} match={m} result={results[m.id]}
                onOpen={() => onOpen(m.id)} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/* ---------------------- Modern Match Card ------------------------- */

function MatchCardModern({ match, result, onOpen }: {
  match: Match;
  result?: { home: number; away: number; finishedAt: number };
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

  /* Live minute estimate (approx, since we don't have a real live feed):
   * minutes since kickoff capped at 90 + ET. */
  const liveMinute = useMemo(() => {
    if (status !== "live") return null;
    const m = Math.floor((Date.now() - +new Date(match.utc)) / 60000);
    if (m >= 105) return "FT?";
    if (m >= 90)  return `90+${m - 90}`;
    if (m >= 60 && m < 65) return "HT";
    if (m >= 45 && m < 50) return "HT";
    return `${m}'`;
  }, [status, match.utc]);

  return (
    <article className={`mt-card status-${status}`}
             onClick={onOpen}
             onKeyDown={(e) => e.key === "Enter" && onOpen()}
             role="button" tabIndex={0}>
      <header className="mt-card-head">
        <div className="mt-card-stage">
          <span className="mt-stage-chip">{stage?.name}{match.group ? ` · בית ${match.group}` : ""}</span>
        </div>
        <div className="mt-card-status">
          {status === "live" && (
            <span className="mt-live-pill">
              <span className="mt-live-dot" aria-hidden /> חי · {liveMinute}
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
        </div>

        {/* Score / vs */}
        <div className="mt-score-wrap">
          {result ? (
            <div className="mt-score">
              <span className="mt-score-num">{result.home}</span>
              <span className="mt-score-sep">:</span>
              <span className="mt-score-num">{result.away}</span>
            </div>
          ) : status === "live" ? (
            <div className="mt-score live">
              <span className="mt-score-num">–</span>
              <span className="mt-score-sep">:</span>
              <span className="mt-score-num">–</span>
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
