/* =====================================================================
 * Post-Match Summary — for a finished match, builds an ESPN-style
 * "summary & stats" (final score, goalscorers with minutes, cards,
 * referee) from REAL data (football-data.org /v4/matches/{id}, via
 * fetchExternalMatchDetails), then asks Claude (Haiku) to write a short
 * Hebrew recap from that data.
 *
 * No fabrication: every fact fed to the model is from the API. If a
 * field (e.g. referee, assists) is missing it's simply omitted.
 * ===================================================================*/
import { TEAMS } from "./data";
import type { ExternalMatchDetails } from "./football-data-api";

const CARD_LABEL: Record<string, string> = {
  YELLOW_CARD: "🟨",
  RED_CARD: "🟥",
  YELLOW_RED_CARD: "🟨🟥",
};

const GOAL_TYPE_LABEL: Record<string, string> = {
  PENALTY: " (פנדל)",
  OWN: " (שער עצמי)",
};

export interface SummaryContext {
  matchId: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  details: ExternalMatchDetails;
}

function teamName(code: string | null): string {
  if (!code) return "";
  return TEAMS[code]?.name || code;
}

/** Plain-text fact sheet — used both as the AI prompt input and as a
 * graceful no-AI-key fallback. */
function buildFactSheet(ctx: SummaryContext): string[] {
  const lines: string[] = [];
  lines.push(`תוצאה סופית: ${ctx.homeName} ${ctx.homeScore}:${ctx.awayScore} ${ctx.awayName}`);

  if (ctx.details.halfTimeHomeScore != null && ctx.details.halfTimeAwayScore != null) {
    lines.push(`תוצאת מחצית: ${ctx.details.halfTimeHomeScore}:${ctx.details.halfTimeAwayScore}`);
  }

  if (ctx.details.goals.length) {
    lines.push("שערים:");
    ctx.details.goals
      .slice()
      .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))
      .forEach(g => {
        const minute = g.minute != null ? `${g.minute}'` : "";
        const type = g.type && GOAL_TYPE_LABEL[g.type] ? GOAL_TYPE_LABEL[g.type] : "";
        const assist = g.assist ? ` (בישול: ${g.assist})` : "";
        lines.push(`- ${minute} ${g.scorer} (${teamName(g.teamCode) || "?"})${type}${assist}`);
      });
  }

  if (ctx.details.bookings.length) {
    lines.push("כרטיסים:");
    ctx.details.bookings
      .slice()
      .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))
      .forEach(b => {
        const minute = b.minute != null ? `${b.minute}'` : "";
        const card = CARD_LABEL[b.card] || b.card;
        lines.push(`- ${minute} ${card} ${b.player} (${teamName(b.teamCode) || "?"})`);
      });
  }

  if (ctx.details.referee) {
    lines.push(`שופט: ${ctx.details.referee}`);
  }

  return lines;
}

const SUMMARY_SYSTEM_PROMPT = `אתה כתב ספורט לאפליקציית מונדיאל 2026.
קיבלת נתונים אמיתיים על משחק שהסתיים: התוצאה הסופית, תוצאת המחצית, רשימת השערים (כולל דקה, מבקיע, קבוצה ובישול אם יש), כרטיסים צהובים/אדומים, ושם השופט.
כתוב סיכום משחק קצר וקולח בעברית (4-6 משפטים), בסגנון ESPN — מה היה הסיפור של המשחק, מי הבקיע ומתי, ורגעי מפתח (כרטיסים אדומים, פנדלים, שערים עצמיים אם היו).
התבסס אך ורק על הנתונים שניתנו. אם נתון מסוים חסר — דלג עליו, אל תנחש ואל תמציא.
אל תזכיר נתונים שלא ניתנו (כגון החזקת כדור, בעיטות לשער, וכו') אלא אם הם מופיעים בפירוש למעלה.
טון: ספורטיבי ותמציתי.`;

/** Generate the Hebrew post-match summary narrative. Falls back to the
 * plain fact sheet if no ANTHROPIC_API_KEY is configured or the call
 * fails. */
export async function generateMatchSummaryNarrative(ctx: SummaryContext): Promise<string> {
  const facts = buildFactSheet(ctx);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return facts.join("\n");

  const userMsg = facts.join("\n") + `\n\nכתוב סיכום למשחק.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: SUMMARY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!r.ok) return facts.join("\n");
    const data = await r.json();
    const text = (data.content?.[0]?.text || "").trim();
    return text || facts.join("\n");
  } catch {
    return facts.join("\n");
  }
}
