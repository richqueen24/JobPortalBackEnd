import nodemailer from 'nodemailer';

// Create and return a nodemailer transporter based on environment vars
export function createTransporter() {
  // Required credentials: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && port && user && pass) {
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: process.env.SMTP_REJECT_UNAUTHORIZED === 'false' ? { rejectUnauthorized: false } : undefined,
    });
    return transporter;
  }

  // No SMTP config provided in env
  return null;
}

export async function sendMail({ to, subject, text, html }) {
  const transporter = createTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || `no-reply@${process.env.APP_DOMAIN || 'example.com'}`;

  if (!transporter) {
    // Try SendGrid if configured
    if (process.env.SENDGRID_API_KEY) {
      try {
        const sgBody = {
          personalizations: [{ to: [{ email: to }] }],
          from: { email: process.env.SMTP_FROM || process.env.SENDGRID_FROM || `no-reply@${process.env.APP_DOMAIN || 'example.com'}` },
          subject,
          content: [
            { type: 'text/plain', value: text },
            { type: 'text/html', value: html },
          ],
        };
        const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(sgBody),
        });
        if (resp.ok) return { success: true, info: await resp.text() };
        const errText = await resp.text();
        console.error('SendGrid send failed:', resp.status, errText);
        return { success: false, reason: 'sendgrid-failed', status: resp.status, error: errText };
      } catch (err) {
        console.error('SendGrid exception:', err);
        return { success: false, reason: 'sendgrid-exception', error: err };
      }
    }

    // In non-production, log code to console for development convenience
    if (process.env.NODE_ENV !== 'production') {
      console.warn('No SMTP configuration found. Email not sent. Mail payload:', { to, subject, text, html });
      return { success: false, reason: 'no-smtp-config', info: null };
    }

    // In production environment, fail explicitly so the caller can act
    throw new Error('Missing SMTP configuration. Please set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS or SENDGRID_API_KEY.');
  }

  try {
    const info = await transporter.sendMail({ from, to, subject, text, html });
    return { success: true, info };
  } catch (error) {
    console.error('sendMail error:', error);
    return { success: false, reason: 'send-failed', error };
  }
}
