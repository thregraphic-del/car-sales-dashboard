// ✉️ Email (password reset codes) — sent from the owner's Gmail with an app password.
// Netlify env: GMAIL_USER, GMAIL_APP_PASSWORD. Nothing is sent unless a learner asks for a code.
import nodemailer from 'nodemailer';

let transport = null;
export const mailConfigured = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

export async function sendMail({ to, subject, text, html }) {
  if (!mailConfigured()) throw new Error('mail not configured');
  transport ??= nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.GMAIL_USER, pass: String(process.env.GMAIL_APP_PASSWORD).replace(/\s+/g, '') },
  });
  await transport.sendMail({ from: `3Goal <${process.env.GMAIL_USER}>`, to, subject, text, html });
}
