// Sends real email when SMTP_URL is set (e.g. smtps://user:pass@smtp.example.com).
// Without it, messages are stored in the `outbox` table and printed to the console
// so verification and reset links can be tested locally.
export async function sendMail(db, { to, subject, text }) {
  const from = process.env.MAIL_FROM || "FindIt <no-reply@findit.local>";
  if (process.env.SMTP_URL) {
    const { default: nodemailer } = await import("nodemailer");
    await nodemailer.createTransport(process.env.SMTP_URL).sendMail({ from, to, subject, text });
    return;
  }
  db.prepare("INSERT INTO outbox (to_email, subject, body) VALUES (?,?,?)").run(to, subject, text);
  if (process.env.NODE_ENV !== "test") console.log(`\n[mail] to=${to}\n[mail] ${subject}\n${text}\n`);
}
