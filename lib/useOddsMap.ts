"use client";
import { useEffect, useState } from "react";
import type { Odds } from "./types";

/* Client hook: fetches the cached real 1X2 odds (footballdata.io, via
 * /api/cron/sync-odds -> live_data/match_odds -> /api/match-odds) and
 * returns a { [matchId]: Odds } map. Matches with no priced odds yet are
 * simply absent — never fabricated. */
export function useOddsMap(): Record<string, Odds> {
  const [oddsMap, setOddsMap] = useState<Record<string, Odds>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/match-odds")
      .then(r => (r.ok ? r.json() : {}))
      .then((data: Record<string, any>) => {
        if (cancelled) return;
        const map: Record<string, Odds> = {};
        for (const [id, v] of Object.entries(data || {})) {
          if (v && typeof v === "object" && v.home && v.draw && v.away) {
            map[id] = { home: v.home, draw: v.draw, away: v.away };
          }
        }
        setOddsMap(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return oddsMap;
}
