import { resend, EMAIL_CONFIG } from "../resend";

export interface MerchantConfirmationParams {
  email: string;
  contactName: string;
  businessName: string;
  branche: string;
}

export async function sendMerchantInterestConfirmation(
  params: MerchantConfirmationParams,
): Promise<boolean> {
  if (!resend) {
    console.warn("⚠️ [Email] Resend not configured — skipping merchant confirmation");
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: EMAIL_CONFIG.fromHello,
      to: params.email,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: "Danke für Ihr Interesse an der Röbel Card für Geschäfte.",
      html: buildMerchantHtml(params),
    });

    if (error) {
      console.error("❌ [Email] Failed to send merchant confirmation:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("❌ [Email] Error sending merchant confirmation:", error);
    return false;
  }
}

function buildMerchantHtml({
  contactName,
  businessName,
  branche,
}: MerchantConfirmationParams): string {
  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Willkommen an Bord</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f5f5f7;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" style="width:100%;max-width:520px;border-collapse:collapse;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#194383;padding:24px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;">Röbel Card · Für Geschäfte</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px;">
              <h1 style="margin:0 0 16px;color:#0a0a0a;font-size:22px;font-weight:600;line-height:1.3;">
                Vielen Dank, ${contactName}!
              </h1>
              <p style="margin:0 0 16px;color:#3a3a3a;font-size:15px;line-height:1.6;">
                Wir haben <strong>${businessName}</strong> (${branche}) als interessiertes
                Partner-Geschäft für die Röbel Card vorgemerkt.
              </p>
              <p style="margin:0 0 16px;color:#3a3a3a;font-size:15px;line-height:1.6;">
                Sobald der gemeinnützige Verein gegründet und das Treuhandkonto
                eingerichtet ist, kontaktieren wir Sie persönlich, um die Anbindung
                Ihres Geschäfts zu besprechen — Konditionen, Aufladeprozess und
                Ablauf am Tresen.
              </p>
              <p style="margin:0 0 24px;color:#3a3a3a;font-size:15px;line-height:1.6;">
                Sie erhalten dabei keine versteckten Kosten und keine Verpflichtungen —
                der erste Schritt ist nur ein unverbindliches Gespräch.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 32px;">
              <div style="border-top:1px solid #eaeaea;padding-top:20px;">
                <p style="margin:0;color:#7a7a7a;font-size:13px;line-height:1.5;">
                  Fragen vorab? Antworten Sie auf diese E-Mail oder schreiben Sie an
                  <a href="mailto:support@roebel.app" style="color:#194383;text-decoration:underline;">support@roebel.app</a>.
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
