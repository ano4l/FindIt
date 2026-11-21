// Sends email through Resend when RESEND_API_KEY is set, or any SMTP server when SMTP_URL is set
// (e.g. smtps://user:pass@smtp.example.com). With neither, in local development messages are stored in
// the `outbox` table and printed to the console so verification and reset links can be tested; on the
// hosted site sending fails with a clear error instead.
let warned = false;

export async function sendMail(db, { to, subject, text, replyTo }) {
  const from = process.env.MAIL_FROM || "FindIt <no-reply@findit.local>";
  if (process.env.RESEND_API_KEY) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!r.ok) throw new Error(`Resend rejected the email (${r.status}): ${(await r.text()).slice(0, 300)}`);
    return;
  }
  if (process.env.SMTP_URL) {
    const { default: nodemailer } = await import("nodemailer");
    await nodemailer.createTransport(process.env.SMTP_URL).sendMail({ from, to, subject, text, ...(replyTo ? { replyTo } : {}) });
    return;
  }
  // On the hosted site a missing provider is a set-up mistake: fail, so the person sees "we couldn't send
  // the email" instead of waiting for a message that was only written to a table nobody reads.
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    if (!warned) console.error("[mail] No RESEND_API_KEY or SMTP_URL is set, so no email can be sent.");
    warned = true;
    throw new Error("No email provider is configured.");
  }
  await db.run("insert into outbox (to_email, subject, body) values (?,?,?)", to, subject, text);
  if (process.env.NODE_ENV !== "test") console.log(`\n[mail] to=${to}\n[mail] ${subject}\n${text}\n`);
}
