/**
 * Emails for the optional passkey warning address: the verification code and the recovery alert.
 * Sent via Resend from konto@roebel.app (roebel.app is a verified Resend domain).
 * Never logs the address or the code.
 */
import { Resend } from "resend";

export type OutgoingMail = { to: string; subject: string; text: string };

export interface Mailer {
  send(mail: OutgoingMail): Promise<void>;
}

export const PASSKEY_MAIL_FROM = "Röbel App <konto@roebel.app>";
export const PASSKEY_MAIL_REPLY_TO = "support@roebel.app";

export class MailSendError extends Error {
  constructor() {
    super("passkey mail could not be sent");
    this.name = "MailSendError";
  }
}

export function createResendMailer(apiKey: string): Mailer {
  const resend = new Resend(apiKey);
  return {
    async send(mail) {
      const { error } = await resend.emails.send({
        from: PASSKEY_MAIL_FROM,
        replyTo: PASSKEY_MAIL_REPLY_TO,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      });
      if (error) throw new MailSendError();
    },
  };
}

export function verificationCodeMail(to: string, code: string): OutgoingMail {
  return {
    to,
    subject: `${code} ist dein Bestätigungscode`,
    text: [
      "Hallo,",
      "",
      `dein Bestätigungscode lautet: ${code}`,
      "",
      "Er gilt 10 Minuten. Gib ihn in der Röbel App unter „Passkey & Wiederherstellung“ ein.",
      "",
      "Wofür wir diese Adresse nutzen: Wir warnen dich, falls jemand dein Konto wiederherstellt, damit du es rechtzeitig abbrechen kannst. Sie ist keine Anmeldung und kein Schlüssel zu deinem Konto. Einen Newsletter bekommst du dadurch nicht.",
      "",
      "Hast du das nicht angefordert? Dann ignoriere diese E-Mail einfach.",
      "",
      "Deine Röbel App",
    ].join("\n"),
  };
}

const DATE_FMT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "Mittwoch, 30. September 2026 um 14:05" (Europe/Berlin). */
export function formatDeadline(unixSec: bigint | number): string {
  return DATE_FMT.format(new Date(Number(unixSec) * 1000));
}

export function recoveryAlertMail(to: string, executeAfter: bigint): OutgoingMail {
  const deadline = formatDeadline(executeAfter);
  return {
    to,
    subject: "Jemand stellt dein Konto wieder her",
    text: [
      "Hallo,",
      "",
      `Jemand stellt dein Konto wieder her. Du hast bis ${deadline} Uhr Zeit, das abzubrechen: öffne die App → Passkey & Wiederherstellung.`,
      "",
      "Warst du das selbst, zum Beispiel mit einem neuen Telefon? Dann musst du nichts tun.",
      "",
      "Nicht du? Dann brich die Wiederherstellung vor diesem Zeitpunkt ab. Danach gehört dein Konto dem neuen Passkey.",
      "",
      "Du bekommst diese Warnung, weil du diese Adresse in der Röbel App für Warnungen hinterlegt hast.",
      "",
      "Deine Röbel App",
    ].join("\n"),
  };
}
