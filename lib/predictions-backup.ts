/* =====================================================================
 * predictions-backup — write-through mirror of every prediction.
 *
 * Architecture:
 *   • Collection `predictions_backup` mirrors `predictions`, same doc IDs
 *     ({uid}_{matchId}). On every prediction save we ALSO write to backup.
 *   • Backup docs are NEVER deleted by the application — they survive any
 *     user delete, admin clear-stage, or full-reset.
 *   • Each backup doc carries metadata:
 *        backedUpAt   — when the backup was written (ms epoch)
 *        sourceAction — "save" | "pre-delete-single" | "pre-delete-stage"
 *                       | "pre-delete-full" | "seed"
 *        deletedAt    — ms epoch when the live prediction was deleted
 *                       (null/undefined while it still exists)
 *
 * Restore: copy the doc body (minus backup metadata) from
 * `predictions_backup` back into `predictions`.
 * ===================================================================*/
import { getAdmin } from "./firebase-admin";

export interface PredictionDoc {
  uid: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
  joker?: boolean;
  predictedWinner?: string;
  updatedAt: number;
}

export type BackupSource =
  | "save"
  | "pre-delete-single"
  | "pre-delete-stage"
  | "pre-delete-full"
  | "seed";

/** Write/upsert a single prediction's backup. Called on every save. */
export async function backupPrediction(
  doc: PredictionDoc,
  source: BackupSource = "save",
): Promise<void> {
  const { db } = getAdmin();
  const docId = `${doc.uid}_${doc.matchId}`;
  const payload: any = {
    ...doc,
    backedUpAt: Date.now(),
    sourceAction: source,
  };
  /* If we're snapshotting because of a delete, mark deletedAt. */
  if (source.startsWith("pre-delete")) {
    payload.deletedAt = Date.now();
  }
  await db.collection("predictions_backup").doc(docId).set(payload, { merge: true });
}

/** Snapshot many predictions to backup before they're deleted.
 *  Used by clear-stage / full-reset before they wipe the live collection. */
export async function snapshotPredictionsToBackup(
  predictions: PredictionDoc[],
  source: BackupSource = "pre-delete-stage",
): Promise<number> {
  if (!predictions.length) return 0;
  const { db } = getAdmin();
  let batch = db.batch();
  let ops = 0;
  const now = Date.now();
  for (const p of predictions) {
    const docId = `${p.uid}_${p.matchId}`;
    const payload: any = {
      ...p,
      backedUpAt: now,
      sourceAction: source,
      deletedAt: now,
    };
    batch.set(db.collection("predictions_backup").doc(docId), payload, { merge: true });
    ops++;
    if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();
  return predictions.length;
}

/** Mark a previously-backed-up doc as "live again" after restore. */
export async function markBackupRestored(uid: string, matchId: string): Promise<void> {
  const { db } = getAdmin();
  const docId = `${uid}_${matchId}`;
  await db.collection("predictions_backup").doc(docId).set({
    restoredAt: Date.now(),
    deletedAt: null,
  }, { merge: true });
}

/** Look up a backup by uid+matchId. Returns null if not present. */
export async function getBackupPrediction(uid: string, matchId: string): Promise<PredictionDoc | null> {
  const { db } = getAdmin();
  const docId = `${uid}_${matchId}`;
  const snap = await db.collection("predictions_backup").doc(docId).get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  return {
    uid: data.uid,
    matchId: data.matchId,
    homeScore: data.homeScore,
    awayScore: data.awayScore,
    joker: data.joker,
    predictedWinner: data.predictedWinner,
    updatedAt: data.updatedAt,
  };
}
