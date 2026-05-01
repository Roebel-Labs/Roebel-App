import { resend, EMAIL_CONFIG } from "../resend";

export interface CitizenConfirmationParams {
  email: string;
  firstName?: string | null;
  plz: string;
}

export async function sendCitizenInterestConfirmation(
  params: CitizenConfirmationParams,
): Promise<boolean> {
  if (!resend) {
    console.warn("⚠️ [Email] Resend not configured — skipping citizen confirmation");
    return false;
  }

  try {
    const greeting = params.firstName ? `Hallo ${params.firstName},` : "Hallo,";

    const { error } = await resend.emails.send({
      from: EMAIL_CONFIG.fromHello,
      to: params.email,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: "Danke! Wir melden uns, sobald die Röbel Card startet.",
      html: buildCitizenHtml({ greeting, plz: params.plz }),
    });

    if (error) {
      console.error("❌ [Email] Failed to send citizen confirmation:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("❌ [Email] Error sending citizen confirmation:", error);
    return false;
  }
}

function buildCitizenHtml({ greeting, plz }: { greeting: string; plz: string }): string {
  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Danke für Ihr Interesse</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f5f5f7;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" style="width:100%;max-width:520px;border-collapse:collapse;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#194383;padding:24px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;">Röbel Card</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px;">
              <h1 style="margin:0 0 16px;color:#0a0a0a;font-size:22px;font-weight:600;line-height:1.3;">
                Danke für Ihr Interesse!
              </h1>
              <p style="margin:0 0 16px;color:#3a3a3a;font-size:15px;line-height:1.6;">
                ${greeting}
              </p>
              <p style="margin:0 0 16px;color:#3a3a3a;font-size:15px;line-height:1.6;">
                Wir haben Sie auf die Interessenten-Liste für die Röbel Card gesetzt
                (PLZ ${plz}). Sobald wir den gemeinnützigen Verein gegründet und das
                Treuhandkonto eingerichtet haben, melden wir uns bei Ihnen — und Sie
                gehören zu den ersten, die die Karte nutzen können.
              </p>
              <p style="margin:0 0 24px;color:#3a3a3a;font-size:15px;line-height:1.6;">
                Bis dahin: Sie müssen nichts weiter tun. Kein Konto, keine Zahlung —
                nur ein Versprechen, dass wir Sie informieren.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 32px;">
              <div style="border-top:1px solid #eaeaea;padding-top:20px;">
                <p style="margin:0;color:#7a7a7a;font-size:13px;line-height:1.5;">
                  Fragen? Antworten Sie einfach auf diese E-Mail oder schreiben Sie uns
                  unter <a href="mailto:support@roebel.app" style="color:#194383;text-decoration:underline;">support@roebel.app</a>.
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
