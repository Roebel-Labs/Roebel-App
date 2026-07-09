import { resend, EMAIL_CONFIG } from "../resend";

// Bestätigungs-Mail nach erfolgreicher Sommer-Camp-Anmeldung (via Resend).
// Empfänger ist die thirdweb-Login-E-Mail des Teilnehmers, sonst die
// Newsletter-E-Mail aus dem Formular.

// PNG statt SVG: das App-Icon muss in Gmail/Outlook laden.
const ICON_URL = "https://roebel.app/apple-touch-icon.png";

export interface SommercampConfirmationParams {
  email: string;
  name?: string | null;
}

export async function sendSommercampConfirmation(
  params: SommercampConfirmationParams,
): Promise<boolean> {
  if (!resend) {
    console.warn(
      "⚠️ [Email] Resend not configured — skipping sommercamp confirmation",
    );
    return false;
  }

  try {
    const firstName = (params.name ?? "").trim().split(/\s+/)[0] || null;
    const greeting = firstName ? `Hallo ${firstName},` : "Hallo,";

    const { error } = await resend.emails.send({
      from: EMAIL_CONFIG.fromNewsletter,
      to: params.email,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: "Du bist dabei! Deine Sommer-Camp-Anmeldung ist bestätigt",
      html: buildHtml(greeting),
    });

    if (error) {
      console.error("❌ [Email] Failed to send sommercamp confirmation:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("❌ [Email] Error sending sommercamp confirmation:", error);
    return false;
  }
}

function buildHtml(greeting: string): string {
  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sommer Camp – Anmeldung bestätigt</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f5f5f7;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" style="width:100%;max-width:520px;border-collapse:collapse;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#00498B;padding:28px 24px;text-align:center;">
              <img src="${ICON_URL}" alt="Röbel App" width="64" height="64" style="display:block;margin:0 auto 12px;border-radius:14px;" />
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">Sommer Camp</p>
              <p style="margin:4px 0 0;color:#FDC705;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Mini-App Hackathon</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px;">
              <h1 style="margin:0 0 16px;color:#0a0a0a;font-size:22px;font-weight:600;line-height:1.3;">
                Du bist dabei! 🎉
              </h1>
              <p style="margin:0 0 16px;color:#3a3a3a;font-size:15px;line-height:1.6;">
                ${greeting}
              </p>
              <p style="margin:0 0 16px;color:#3a3a3a;font-size:15px;line-height:1.6;">
                deine Anmeldung zum Sommer Camp war erfolgreich. Deine
                Wochen-Runde startet offiziell am <strong>Freitag um
                18&nbsp;Uhr</strong> — dann öffnet sich der KI-Baukasten und du
                kannst deine eigene Mini-App für Röbel bauen.
              </p>
              <p style="margin:0 0 24px;color:#3a3a3a;font-size:15px;line-height:1.6;">
                Jede Woche kürt die Jury freitags die besten drei Apps —
                mitmachen lohnt sich also die ganzen Sommerferien lang.
              </p>
              <p style="margin:0 0 24px;text-align:center;">
                <a href="https://roebel.app/sommercamp" style="display:inline-block;background:#00498B;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:9999px;">Zum Sommer Camp</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 32px;">
              <div style="border-top:1px solid #eaeaea;padding-top:20px;">
                <p style="margin:0;color:#7a7a7a;font-size:13px;line-height:1.5;">
                  Fragen? Antworte einfach auf diese E-Mail oder schreib uns an
                  <a href="mailto:support@roebel.app" style="color:#00498B;text-decoration:underline;">support@roebel.app</a>.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px;background-color:#fafafa;text-align:center;border-top:1px solid #eaeaea;">
              <p style="margin:0;color:#9a9a9a;font-size:11px;">
                © ${new Date().getFullYear()} Röbel App · Hohe Straße 2, 17207 Röbel/Müritz
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
