import nodemailer from "nodemailer";

/**
 * Operational email (alerts, nightly backups) for the instance owner.
 *
 * Uses the same transport as the magic links: EMAIL_SERVER (SMTP) when set,
 * otherwise Resend. The recipient is ALERT_EMAIL, falling back to the first
 * address in ALLOWED_EMAILS, so a single-owner instance needs no extra setup.
 */

export interface OpsAttachment {
  filename: string;
  content: Buffer;
}

export function getOpsRecipient(): string | null {
  const explicit = process.env.ALERT_EMAIL?.trim();
  if (explicit) return explicit;
  const firstAllowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .find(Boolean);
  return firstAllowed ?? null;
}

export async function sendOpsEmail({
  subject,
  text,
  attachments = [],
}: {
  subject: string;
  text: string;
  attachments?: OpsAttachment[];
}): Promise<{ sent: boolean; reason?: string }> {
  const to = getOpsRecipient();
  if (!to) return { sent: false, reason: "no ALERT_EMAIL or ALLOWED_EMAILS" };

  const from = process.env.EMAIL_FROM ?? "OpenReply <login@example.com>";
  const fullSubject = `[OpenReply] ${subject}`;

  if (process.env.EMAIL_SERVER) {
    const transport = nodemailer.createTransport(process.env.EMAIL_SERVER);
    await transport.sendMail({ from, to, subject: fullSubject, text, attachments });
    return { sent: true };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "no EMAIL_SERVER or RESEND_API_KEY" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: fullSubject,
      text,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
      })),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status}: ${body.slice(0, 300)}`);
  }
  return { sent: true };
}
