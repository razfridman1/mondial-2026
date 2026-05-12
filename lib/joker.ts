/* =====================================================================
 * Joker System
 * - Each user gets ONE Joker per knockout stage and 2 Jokers in group stage.
 * - When applied to a prediction, points for that match are multiplied ×2.
 * - Cooldown: 24 hours between jokers (in addition to per-stage cap).
 * - Joker is locked together with the prediction (3 min before kickoff).
 *
 * State persists in Firestore: `joker_usage/{uid}` →
 *   { perStage: { GROUP: number, R32: number, ... }, lastUsedAt: number }
 * Per-prediction flag stored on the prediction doc as `joker: true`.
 * ===================================================================*/
import type { StageId } from "./types";

export const JOKER_LIMITS: Record<StageId, number> = {
  GROUP: 2,
  R32:   1,
  R16:   1,
  QF:    1,
  SF:    1,
  THIRD: 1,
  FINAL: 1,
};

export const JOKER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface JokerUsage {
  perStage: Partial<Record<StageId, number>>;
  lastUsedAt: number;
}

export function canUseJoker(usage: JokerUsage | null, stage: StageId, now = Date.now()): { ok: boolean; reason?: string; remaining: number } {
  const used = usage?.perStage?.[stage] || 0;
  const limit = JOKER_LIMITS[stage] || 1;
  const remaining = Math.max(0, limit - used);
  if (remaining <= 0) return { ok: false, reason: `ניצלת את כל הג'וקרים לשלב ${stage}.`, remaining: 0 };
  const last = usage?.lastUsedAt || 0;
  const wait = JOKER_COOLDOWN_MS - (now - last);
  if (last && wait > 0) {
    const hrs = Math.ceil(wait / 3600000);
    return { ok: false, reason: `קולדאון פעיל — נסה שוב בעוד ${hrs} שעות.`, remaining };
  }
  return { ok: true, remaining };
}

export function recordJokerUsage(usage: JokerUsage | null, stage: StageId, now = Date.now()): JokerUsage {
  const next: JokerUsage = {
    perStage: { ...(usage?.perStage || {}) },
    lastUsedAt: now,
  };
  next.perStage[stage] = (next.perStage[stage] || 0) + 1;
  return next;
}
