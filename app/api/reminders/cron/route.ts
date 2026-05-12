import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { MATCHES, TEAMS, CHANNELS } from "@/lib/data";
import { formatIsraelDate, formatIsraelTime, applyOverride } from "@/lib/utils";
import { sendEmail, reminderEmailHtml } from "@/lib/email";
import { effectiveUtc, type SimConfig } from "@/lib/sim";

export const runtime = "nodejs";
export const maxDuration = 60;

/* =====================================================================
 * Vercel Cron handler. Configured in vercel.json to run every 5 minutes.
 * Scans pending email reminders and sends those whose trigger time has
 * arrived. De-dupes via the `email_log` collection.
 * ===================================================================*/

const SECRET = process.env.CRON_SECRET || "";

interface ReminderRow {
  uid: string;
  email: string;
  matchId: string;
  kind: "h60" | "m15" | "betsClose";
}

const WINDOW_MS = 6 * 60 * 1000; // 6-minute window — slightly larger than cron interval (5 min)

export async function GET(req: Request) {
  // Optional shared-secret protection
  if (SECRET) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.endsWith(SECRET)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { db } = getAdmin();
  const now = Date.now();

  /* 1. Load all overrides once for accurate match times */
  const ovSnap = await db.collection("broadcast_overrides").get();
  const overrides: Record<string, any> = {};
  ovSnap.forEach(d => { overrides[d.id] = d.data(); });
  const simSnap = await db.collection("sim_config").doc("global").get();
  const sim = simSnap.exists ? (simSnap.data() as SimConfig) : null;
  const matchesEff = MATCHES.map(m => {
    const withOverride = applyOverride(m, overrides[m.id]);
    return { ...withOverride, utc: effectiveUtc(withOverride.utc, sim) };
  });

  /* 2. Load email prefs (only users with enabled=true) */
  const prefsSnap = await db.collection("email_prefs").where("enabled", "==", true).get();
  const usersWithPrefs = prefsSnap.docs.map(d => d.data());

  if (!usersWithPrefs.length) {
    return NextResponse.json({ sent: 0, reason: "no enabled users" });
  }

  /* 3. Load all per-user reminder toggles (h60 / m15 / betsClose) and favorites */
  const remindersSnap = await db.collection("user_reminders").get();
  const favSnap = await db.collection("user_favorites").get();
  const remindersByUid: Record<string, any> = {};
  remindersSnap.forEach(d => { remindersByUid[d.id] = d.data()?.reminders || {}; });
  const favsByUid: Record<string, string[]> = {};
  favSnap.forEach(d => { favsByUid[d.id] = d.data()?.teams || []; });

  /* 4. Build list of pending sends */
  const pending: ReminderRow[] = [];
  for (const u of usersWithPrefs) {
    if (!u.email) continue;
    const userReminders = remindersByUid[u.uid] || {};
    const favs = new Set(favsByUid[u.uid] || []);

    for (const m of matchesEff) {
      const start = new Date(m.utc).getTime();
      if (start <= now) continue;                    // past kickoff
      if (start - now > 24 * 60 * 60 * 1000) continue; // skip more than 24h ahead

      if (u.favoritesOnly && !(favs.has(m.home) || favs.has(m.away))) continue;

      const checks: Array<[ "h60" | "m15" | "betsClose", number ]> = [
        ["h60",      start - 60 * 60 * 1000],
        ["m15",      start - 15 * 60 * 1000],
        ["betsClose",start - 10 * 60 * 1000],
      ];

      for (const [kind, when] of checks) {
        if (!u[kind]) continue;                   // user disabled this kind
        if (!userReminders[m.id]?.[kind]) continue; // and didn't subscribe per-match
        if (now >= when && now < when + WINDOW_MS) {
          pending.push({ uid: u.uid, email: u.email, matchId: m.id, kind });
        }
      }
    }
  }

  /* 5. De-dupe against `email_log` */
  const sent: string[] = [];
  for (const row of pending) {
    const logId = `${row.uid}_${row.matchId}_${row.kind}`;
    const logRef = db.collection("email_log").doc(logId);
    const existing = await logRef.get();
    if (existing.exists) continue;

    const m = matchesEff.find(x => x.id === row.matchId)!;
    const home = TEAMS[m.home] || { name: m.home, flag: "" };
    const away = TEAMS[m.away] || { name: m.away, flag: "" };
    const channels = (m.channels || []).map(c => CHANNELS[c]?.name).filter(Boolean) as string[];
    const when =
      row.kind === "h60"      ? "המשחק מתחיל בעוד שעה"
    : row.kind === "m15"      ? "המשחק מתחיל בעוד 15 דקות"
    :                           "ההימורים נסגרים בקרוב";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mondial-2026.vercel.app";
    const matchUrl = `${baseUrl}/?match=${m.id}`;
    const shareText = `⚽ מונדיאל 2026: ${home.name} נגד ${away.name} — ${formatIsraelDate(m.utc)} ${formatIsraelTime(m.utc)} ${matchUrl}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

    const html = reminderEmailHtml({
      homeName: home.name,
      homeFlag: home.flag,
      awayName: away.name,
      awayFlag: away.flag,
      dateLabel: formatIsraelDate(m.utc),
      timeLabel: formatIsraelTime(m.utc),
      channels,
      whenLabel: when,
      matchUrl,
      whatsappUrl: waUrl,
    });

    const result = await sendEmail({
      to: row.email,
      subject: `⚽ ${home.name} – ${away.name} · ${when}`,
      html,
    });

    await logRef.set({
      uid: row.uid,
      matchId: row.matchId,
      kind: row.kind,
      sentAt: now,
      ok: result.ok,
      error: result.error || null,
      providerId: result.id || null,
    });

    if (result.ok) sent.push(logId);
  }

  return NextResponse.json({ scanned: pending.length, sent: sent.length, ids: sent });
}
