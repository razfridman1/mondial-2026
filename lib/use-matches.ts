"use client";
import { useMemo } from "react";
import { MATCHES } from "./data";
import { useStore } from "./store";
import { effMatch } from "./sim";
import type { Match } from "./types";

/* =====================================================================
 * Single source of truth for "what matches should the UI render".
 * Applies (1) broadcast overrides and (2) simulation time-warp.
 * Components should prefer this over importing MATCHES directly when
 * showing dates/status to users.
 * ===================================================================*/

export function useEffectiveMatches(): Match[] {
  const overrides = useStore(s => s.overrides);
  const simConfig = useStore(s => s.simConfig);
  return useMemo(
    () => MATCHES.map(m => effMatch(m, overrides[m.id], simConfig)),
    [overrides, simConfig]
  );
}

export function useEffectiveMatch(matchId: string): Match | undefined {
  const list = useEffectiveMatches();
  return useMemo(() => list.find(m => m.id === matchId), [list, matchId]);
}
