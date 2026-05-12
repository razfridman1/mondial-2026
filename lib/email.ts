/* =====================================================================
 * Email sender — uses Resend REST API directly (no SDK dependency).
 * https://resend.com/docs/api-reference/emails/send-email
 * ===================================================================*/

const RESEND_URL = "https://api.resend.com/emails";

export interface MailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: MailParams): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };
  const from = process.env.MAIL_FROM || "Mondial 2026 <reminders@mondial-2026.app>";

  const r = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text: text || stripHtml(html) }),
  });

  if (!r.ok) {
    const err = await r.text();
    return { ok: false, error: err };
  }
  const data = await r.json();
  return { ok: true, id: data.id };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/* Build a friendly Hebrew reminder email body */
export function reminderEmailHtml(args: {
  homeName: string;
  homeFlag: string;
  awayName: string;
  awayFlag: string;
  dateLabel: string;
  timeLabel: string;
  channels: string[];
  whenLabel: string;       // "בעוד שעה" / "בעוד 15 דקות" / "ההימורים נסגרים"
  matchUrl: string;
  whatsappUrl: string;
}): string {
  return `
<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>מונדיאל 2026 — תזכורת</title>
</head>
<body style="margin:0;padding:0;background:#0b1020;font-family:'Heebo','Rubik','Segoe UI',sans-serif;color:#eef1ff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0b1020;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"
               style="max-width:600px;background:#131a2f;border:1px solid #2a3354;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:24px;background:linear-gradient(135deg,#2e6bff,#1a4dd6);text-align:center;">
              <div style="font-size:32px;">⚽</div>
              <div style="font-size:20px;font-weight:800;color:#fff;margin-top:8px;">מונדיאל 2026</div>
              <div style="font-size:13px;color:#dbeafe;margin-top:4px;">תזכורת משחק — ${args.whenLabel}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;text-align:center;">
              <div style="font-size:48px;font-weight:900;color:#ffd24a;margin-bottom:4px;">${args.timeLabel}</div>
              <div style="font-size:14px;color:#9aa3c7;">${args.dateLabel} · שעון ישראל</div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px;text-align:center;">
              <table role="presentation" width="100%"><tr>
                <td align="center" style="font-size:18px;font-weight:700;">
                  <div style="font-size:42px;">${args.homeFlag}</div>
                  <div>${args.homeName}</div>
                </td>
                <td align="center" style="font-size:14px;color:#9aa3c7;font-weight:600;">VS</td>
                <td align="center" style="font-size:18px;font-weight:700;">
                  <div style="font-size:42px;">${args.awayFlag}</div>
                  <div>${args.awayName}</div>
                </td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px;border-top:1px solid #2a3354;">
              <div style="font-size:12px;color:#9aa3c7;margin-bottom:6px;">📺 שידור בישראל</div>
              <div style="font-size:14px;color:#eef1ff;font-weight:600;">${args.channels.join(" · ") || "טרם נקבע"}</div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 24px;">
              <a href="${args.matchUrl}" style="display:inline-block;background:linear-gradient(135deg,#2e6bff,#1a4dd6);color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">
                פתח עמוד משחק
              </a>
              <a href="${args.whatsappUrl}" style="display:inline-block;background:#25d366;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;margin-right:8px;">
                💬 שתף בווטסאפ
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:18px 24px 26px;font-size:11px;color:#6b7396;">
              קיבלת מייל זה בגלל שביקשת תזכורות במונדיאל 2026.<br/>
              ניתן לבטל מההגדרות באפליקציה.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
