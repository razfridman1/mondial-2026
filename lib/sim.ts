/* =====================================================================
 * Simulation engine — time-warp the whole 2026 World Cup into a short
 * test window so you and your friends can validate the system.
 *
 *   When `enabled = true`, every match.utc is mapped from its real time
 *   to a "simulated" time using an anchor and a speed multiplier:
 *
 *      effective = startedAt + (realUtc - anchorRealUtc) / speedMultiplier
 *
 *   The anchor is the original UTC of the match you want to start "now"
 *   (typically M001 — the opening match Mexico–Poland 11.6.26 19:00 IST).
 *
 *   Examples:
 *     speedMultiplier = 1      → real time (39 days)
 *     speedMultiplier = 60     → 60× faster (39 days → 15.6 hours)
 *     speedMultiplier = 360    → 6× per hour (39 days → 2.6 hours)
 *     speedMultiplier = 1440   → 1 day → 1 minute (39 days → 39 minutes)
 *     speedMultiplier = 5760   → 1 day → 15 seconds (39 days → 10 minutes)
 *
 *   When `enabled = false` everything reverts to original times.
 *
 *   Config lives in Firestore: `sim_config/global`. Both client and
 *   server read the same doc.
 * ===================================================================*/

import type { Match } from "./types";

export interface SimConfig {
  enabled: boolean;
  startedAt: number;        // wall-clock ms when simulation activated
  anchorRealUtc: number;    // ms of the original match that maps to startedAt
  speedMultiplier: number;  // > 0
  resultsAuto: boolean;     // auto-generate random results when sim match ends
  updatedAt: number;
  updatedBy?: string;
  label?: string;           // optional human description (e.g. "10 min full WC")
}

export const SIM_DOC = "sim_config/global";
export const SIM_DOC_ID = "global";
export const SIM_COLLECTION = "sim_config";

/** Convert a match's original UTC to its effective UTC under the current simulation. */
export function effectiveUtc(originalUtc: string, cfg: SimConfig | null | undefined): string {
  if (!cfg?.enabled) return originalUtc;
  const realMs = new Date(originalUtc).getTime();
  const offsetMs = realMs - cfg.anchorRealUtc;
  const compressed = offsetMs / Math.max(0.0001, cfg.speedMultiplier);
  return new Date(cfg.startedAt + compressed).toISOString();
}

/** Returns the same match object but with `utc` replaced by its effective time. */
export function applySim(match: Match, cfg: SimConfig | null | undefined): Match {
  if (!cfg?.enabled) return match;
  return { ...match, utc: effectiveUtc(match.utc, cfg) };
}

/** Convenience: a one-stop "apply override + sim" that the whole UI uses. */
export function effMatch(
  match: Match,
  override: any | undefined,
  sim: SimConfig | null | undefined,
): Match {
  let m = match;
  if (override) {
    m = {
      ...m,
      ...(override.utc       ? { utc: override.utc }                : {}),
      ...(override.channels  ? { channels: override.channels }      : {}),
      ...(override.studioShow !== undefined ? { studioShow: override.studioShow ?? null } : {}),
      ...(override.status    ? { status: override.status }          : {}),
    };
  }
  return applySim(m, sim);
}

/** Helper for the admin UI — preset configurations. */
export const SIM_PRESETS: { id: string; label: string; speedMultiplier: number; minutesUntilFirstMatch: number }[] = [
  { id: "10m",  label: "כל המונדיאל ב-10 דק׳",  speedMultiplier: 5616,  minutesUntilFirstMatch: 1 },
  { id: "1h",   label: "כל המונדיאל בשעה",       speedMultiplier: 936,   minutesUntilFirstMatch: 2 },
  { id: "3h",   label: "כל המונדיאל ב-3 שעות",   speedMultiplier: 312,   minutesUntilFirstMatch: 3 },
  { id: "1d",   label: "כל המונדיאל ביום",       speedMultiplier: 39,    minutesUntilFirstMatch: 5 },
  { id: "1w",   label: "כל המונדיאל בשבוע",      speedMultiplier: 5.57,  minutesUntilFirstMatch: 10 },
  { id: "real", label: "זמן אמת (לא מומלץ)",      speedMultiplier: 1,     minutesUntilFirstMatch: 5 },
];

/** Build a SimConfig that activates now with the given preset and anchor. */
export function buildSimConfig(opts: {
  preset?: typeof SIM_PRESETS[number];
  speedMultiplier?: number;
  minutesUntilFirstMatch?: number;
  anchorRealUtc: number;
  resultsAuto?: boolean;
  label?: string;
  updatedBy?: string;
}): SimConfig {
  const speed = opts.preset?.speedMultiplier ?? opts.speedMultiplier ?? 360;
  const mins  = opts.preset?.minutesUntilFirstMatch ?? opts.minutesUntilFirstMatch ?? 2;
  return {
    enabled: true,
    startedAt: Date.now() + mins * 60 * 1000,
    anchorRealUtc: opts.anchorRealUtc,
    speedMultiplier: speed,
    resultsAuto: opts.resultsAuto ?? true,
    updatedAt: Date.now(),
    updatedBy: opts.updatedBy,
    label: opts.label || opts.preset?.label,
  };
}

/** Helper: generate a plausible random result for a finished simulated match. */
export function randomResult(): { home: number; away: number } {
  // bias toward typical football scorelines
  const weights = [
    { score: [0, 0], w: 6 },
    { score: [1, 0], w: 10 },
    { score: [0, 1], w: 10 },
    { score: [1, 1], w: 12 },
    { score: [2, 0], w: 9 },
    { score: [0, 2], w: 9 },
    { score: [2, 1], w: 11 },
    { score: [1, 2], w: 11 },
    { score: [2, 2], w: 6 },
    { score: [3, 0], w: 4 },
    { score: [0, 3], w: 4 },
    { score: [3, 1], w: 5 },
    { score: [1, 3], w: 5 },
    { score: [3, 2], w: 3 },
    { score: [2, 3], w: 3 },
    { score: [4, 1], w: 1 },
    { score: [1, 4], w: 1 },
  ];
  const total = weights.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const w of weights) { if ((r -= w.w) <= 0) return { home: w.score[0], away: w.score[1] }; }
  return { home: 1, away: 1 };
}
