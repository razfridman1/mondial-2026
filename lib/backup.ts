/* =====================================================================
 * Full-site backup & restore (server-only).
 *
 * Every collection listed in BACKUP_COLLECTIONS is dumped to Firestore
 * under  backups/{dateKey}  (summary doc) +  backups/{dateKey}/chunks/*
 * (the actual documents, split into <1MB chunks so they fit Firestore's
 * per-document size limit). Old backups are pruned automatically
 * (RETENTION_DAYS).
 *
 * Restoring writes the real, previously-backed-up documents back into
 * their live collection (set, merge:false per doc) — nothing fictional
 * is ever generated. "Exact" restore additionally deletes any live docs
 * that didn't exist in the backup, fully reverting the collection to
 * that point in time.
 * ===================================================================*/
import { getAdmin } from "./firebase-admin";

export const BACKUP_COLLECTIONS = [
  "profiles",
  "managed_users",
  "username_lookup",
  "predictions",
  "predictions_backup",
  "match_results",
  "match_results_history",
  "groups",
  "group_memberships",
  "deleted_groups",
  "joker_usage",
  "broadcast_overrides",
  "sim_config",
  "activity",
  "roasts",
  "bonus_awards",
  "leaderboard_snapshots",
  "live_data",
  "stats",
  "user_favorites",
];

export const RETENTION_DAYS = 21;

/* Max chars per chunk doc — well under Firestore's 1MiB/doc limit. */
const CHUNK_CHAR_LIMIT = 700_000;

function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export interface BackupSummary {
  dateKey: string;
  exportedAt: number;
  exportedBy: string | null;
  version: number;
  counts: Record<string, number>;
  chunkCounts: Record<string, number>;
}

/* ---------------------------------------------------------------------
 * Run a full backup "now" — writes backups/{dateKey} + chunks, prunes
 * old backups beyond RETENTION_DAYS. Re-running on the same day
 * overwrites that day's backup.
 * ------------------------------------------------------------------- */
export async function runFullBackup(triggeredBy: string | null): Promise<BackupSummary> {
  const { db } = getAdmin();
  const dateKey = todayKey();
  const counts: Record<string, number> = {};
  const chunkCounts: Record<string, number> = {};

  for (const coll of BACKUP_COLLECTIONS) {
    let docs: Array<{ id: string; data: any }> = [];
    try {
      const snap = await db.collection(coll).get();
      docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
    } catch {
      docs = [];
    }
    counts[coll] = docs.length;

    // Clear any existing chunks for this collection (re-running same day).
    const existing = await db.collection("backups").doc(dateKey).collection("chunks")
      .where("collection", "==", coll).get();
    if (!existing.empty) {
      let delBatch = db.batch();
      let n = 0;
      for (const d of existing.docs) {
        delBatch.delete(d.ref);
        if (++n >= 450) { await delBatch.commit(); delBatch = db.batch(); n = 0; }
      }
      if (n > 0) await delBatch.commit();
    }

    // Split into <1MB chunks.
    const chunks: Array<{ id: string; data: any }[]> = [];
    let current: Array<{ id: string; data: any }> = [];
    let currentLen = 2;
    for (const doc of docs) {
      const len = JSON.stringify(doc).length + 1;
      if (current.length > 0 && currentLen + len > CHUNK_CHAR_LIMIT) {
        chunks.push(current);
        current = [];
        currentLen = 2;
      }
      current.push(doc);
      currentLen += len;
    }
    if (current.length > 0 || docs.length === 0) chunks.push(current);
    chunkCounts[coll] = chunks.length;

    let writeBatch = db.batch();
    let ops = 0;
    chunks.forEach((chunkDocs, i) => {
      const ref = db.collection("backups").doc(dateKey).collection("chunks").doc(`${coll}__${i}`);
      writeBatch.set(ref, { collection: coll, chunkIndex: i, docs: chunkDocs });
      ops++;
    });
    if (ops > 0) await writeBatch.commit();
  }

  const summary: BackupSummary = {
    dateKey,
    exportedAt: Date.now(),
    exportedBy: triggeredBy,
    version: 1,
    counts,
    chunkCounts,
  };
  await db.collection("backups").doc(dateKey).set(summary);

  await pruneOldBackups();
  return summary;
}

/* Delete backups (and their chunk subcollections) older than RETENTION_DAYS. */
async function pruneOldBackups() {
  const { db } = getAdmin();
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const snap = await db.collection("backups").get();
  for (const d of snap.docs) {
    const data = d.data() as any;
    if ((data.exportedAt || 0) < cutoff) {
      const chunks = await d.ref.collection("chunks").get();
      let batch = db.batch();
      let n = 0;
      for (const c of chunks.docs) {
        batch.delete(c.ref);
        if (++n >= 450) { await batch.commit(); batch = db.batch(); n = 0; }
      }
      if (n > 0) await batch.commit();
      await d.ref.delete();
    }
  }
}

/* List all backup summaries, newest first. */
export async function listBackups(): Promise<BackupSummary[]> {
  const { db } = getAdmin();
  const snap = await db.collection("backups").get();
  return snap.docs
    .map(d => d.data() as BackupSummary)
    .sort((a, b) => (b.exportedAt || 0) - (a.exportedAt || 0));
}

/* Reassemble one collection's docs from a backup's chunks. */
export async function loadBackupCollection(dateKey: string, collection: string): Promise<Array<{ id: string; data: any }>> {
  const { db } = getAdmin();
  const snap = await db.collection("backups").doc(dateKey).collection("chunks")
    .where("collection", "==", collection).get();
  const chunks = snap.docs.map(d => d.data() as any).sort((a, b) => a.chunkIndex - b.chunkIndex);
  const out: Array<{ id: string; data: any }> = [];
  for (const c of chunks) out.push(...(c.docs || []));
  return out;
}

/* Reassemble the FULL backup (all collections) for download. */
export async function loadFullBackup(dateKey: string): Promise<{ summary: BackupSummary | null; data: Record<string, any[]> }> {
  const { db } = getAdmin();
  const summarySnap = await db.collection("backups").doc(dateKey).get();
  const summary = summarySnap.exists ? (summarySnap.data() as BackupSummary) : null;
  const data: Record<string, any[]> = {};
  for (const coll of BACKUP_COLLECTIONS) {
    const docs = await loadBackupCollection(dateKey, coll);
    data[coll] = docs.map(d => ({ id: d.id, ...d.data }));
  }
  return { summary, data };
}

export interface RestoreResult {
  collection: string;
  restored: number;
  deleted: number;
}

/* Restore ONE collection from a backup.
 *  - default ("merge"): writes back every doc from the backup (set, merge:false
 *    per-doc — i.e. each doc is replaced with its backed-up version), without
 *    touching live docs that aren't in the backup.
 *  - exact: also deletes live docs that are NOT present in the backup, fully
 *    reverting the collection to the backed-up point in time. */
export async function restoreCollection(dateKey: string, collection: string, exact: boolean): Promise<RestoreResult> {
  const { db } = getAdmin();
  const backupDocs = await loadBackupCollection(dateKey, collection);
  const backupIds = new Set(backupDocs.map(d => d.id));

  let restored = 0;
  let writeBatch = db.batch();
  let ops = 0;
  for (const doc of backupDocs) {
    const ref = db.collection(collection).doc(doc.id);
    writeBatch.set(ref, doc.data);
    restored++;
    if (++ops >= 450) { await writeBatch.commit(); writeBatch = db.batch(); ops = 0; }
  }
  if (ops > 0) await writeBatch.commit();

  let deleted = 0;
  if (exact) {
    const liveSnap = await db.collection(collection).get();
    let delBatch = db.batch();
    let dops = 0;
    for (const d of liveSnap.docs) {
      if (!backupIds.has(d.id)) {
        delBatch.delete(d.ref);
        deleted++;
        if (++dops >= 450) { await delBatch.commit(); delBatch = db.batch(); dops = 0; }
      }
    }
    if (dops > 0) await delBatch.commit();
  }

  return { collection, restored, deleted };
}
