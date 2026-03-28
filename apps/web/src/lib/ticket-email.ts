import { resend, EMAIL_CONFIG } from "./resend";
import type { EventTicket } from "@/types/ticket-types";
import { TICKET_CONFIG } from "./stripe";

/**
 * Send ticket confirmation email with QR code
 */
export async function sendTicketEmail(ticket: EventTicket): Promise<boolean> {
  if (!resend) {
    console.warn("⚠️ [Email] Resend not configured - skipping email");
    return false;
  }

  console.log("📧 [Email] Sending ticket email to:", ticket.buyer_email);

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://roebel.app";
    const ticketUrl = `${baseUrl}/ticket/${ticket.ticket_code}`;

    // Get day label (Samstag/Sonntag)
    const dayConfig = ticket.event_day ? TICKET_CONFIG.days[ticket.event_day] : null;
    const dayLabel = dayConfig?.label || "";

    // Generate QR code URL (using API instead of data URL, since email clients block data URLs)
    const qrCodeDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(ticketUrl)}`;

    // Format purchase date
    const purchaseDate = new Date(ticket.created_at).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Format price
    const price = (ticket.amount_paid / 100).toFixed(2).replace(".", ",");

    // Build subject with day if available
    const subject = dayLabel
      ? `Ihr Ticket für ${dayLabel}, ${ticket.event_date}`
      : `Ihr Ticket für ${ticket.event_name}`;

    // Send email with HTML template
    const { error } = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: ticket.buyer_email,
      replyTo: EMAIL_CONFIG.replyTo,
      subject,
      html: generateTicketEmailHtml({
        ticketCode: ticket.ticket_code,
        eventName: ticket.event_name,
        eventDayLabel: dayLabel,
        eventDate: ticket.event_date,
        eventLocation: ticket.event_location,
        buyerName: ticket.buyer_name,
        buyerEmail: ticket.buyer_email,
        price: `${price} €`,
        purchaseDate,
        qrCodeDataUrl,
        ticketUrl,
      }),
    });

    if (error) {
      console.error("❌ [Email] Failed to send:", error);
      return false;
    }

    console.log("✅ [Email] Ticket email sent successfully");
    return true;
  } catch (error) {
    console.error("❌ [Email] Error sending email:", error);
    return false;
  }
}

interface TicketEmailParams {
  ticketCode: string;
  eventName: string;
  eventDayLabel: string;
  eventDate: string;
  eventLocation: string;
  buyerName: string | null;
  buyerEmail: string;
  price: string;
  purchaseDate: string;
  qrCodeDataUrl: string;
  ticketUrl: string;
}

function generateTicketEmailHtml(params: TicketEmailParams): string {
  const {
    ticketCode,
    eventName,
    eventDayLabel,
    eventDate,
    eventLocation,
    buyerName,
    price,
    purchaseDate,
    qrCodeDataUrl,
    ticketUrl,
  } = params;

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ihr Ticket</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Main Container -->
        <table role="presentation" style="width: 100%; max-width: 500px; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a1a 0%, #333333 100%); padding: 30px 20px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: bold;">
                🥊 ${eventName}
              </h1>
              <p style="margin: 10px 0 0; color: #cccccc; font-size: 16px;">
                ${eventDayLabel ? `${eventDayLabel}, ` : ''}${eventDate}
              </p>
            </td>
          </tr>

          <!-- QR Code Section -->
          <tr>
            <td style="padding: 30px 20px; text-align: center; background-color: #ffffff;">
              <p style="margin: 0 0 20px; color: #666666; font-size: 14px;">
                Zeigen Sie diesen QR-Code am Eingang vor:
              </p>
              <div style="display: inline-block; padding: 15px; background-color: #ffffff; border: 2px solid #e0e0e0; border-radius: 12px;">
                <img src="${qrCodeDataUrl}" alt="Ticket QR Code" style="width: 180px; height: 180px; display: block;">
              </div>
              <p style="margin: 20px 0 0; font-family: monospace; font-size: 18px; font-weight: bold; color: #1a1a1a; letter-spacing: 2px;">
                ${ticketCode}
              </p>
            </td>
          </tr>

          <!-- Ticket Details -->
          <tr>
            <td style="padding: 0 20px 30px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8f8f8; border-radius: 12px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
                          <span style="color: #888888; font-size: 12px; text-transform: uppercase;">Veranstaltungsort</span><br>
                          <span style="color: #333333; font-size: 14px; font-weight: 500;">${eventLocation}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
                          <span style="color: #888888; font-size: 12px; text-transform: uppercase;">Beginn</span><br>
                          <span style="color: #333333; font-size: 14px; font-weight: 500;">12:00 Uhr</span>
                        </td>
                      </tr>
                      ${buyerName ? `
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
                          <span style="color: #888888; font-size: 12px; text-transform: uppercase;">Name</span><br>
                          <span style="color: #333333; font-size: 14px; font-weight: 500;">${buyerName}</span>
                        </td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
                          <span style="color: #888888; font-size: 12px; text-transform: uppercase;">Kaufdatum</span><br>
                          <span style="color: #333333; font-size: 14px; font-weight: 500;">${purchaseDate}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #888888; font-size: 12px; text-transform: uppercase;">Preis</span><br>
                          <span style="color: #333333; font-size: 14px; font-weight: 500;">${price}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 20px 30px; text-align: center;">
              <a href="${ticketUrl}" style="display: inline-block; padding: 14px 32px; background-color: #1a1a1a; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 8px;">
                Ticket online ansehen
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px; background-color: #f8f8f8; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #888888; font-size: 12px;">
                Bei Fragen kontaktieren Sie uns unter<br>
                <a href="mailto:support@roebel.app" style="color: #1a1a1a;">support@roebel.app</a>
              </p>
              <p style="margin: 15px 0 0; color: #aaaaaa; font-size: 11px;">
                © ${new Date().getFullYear()} Röbel App
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
