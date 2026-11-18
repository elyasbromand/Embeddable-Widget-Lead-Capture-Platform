import nodemailer from "nodemailer";

// Thin wrapper around nodemailer so services get a mailer injected (tests pass a fake).
// send() resolves when the SMTP server accepted the message, and throws otherwise.
export function createMailer({ host, port, from, forceFailure = false }) {
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: false, // Mailpit speaks plain SMTP locally; production would use TLS and auth
    connectionTimeout: 5_000, // a hung SMTP server fails the attempt, and pg-boss retries it
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });

  return {
    async send({ to, subject, text }) {
      if (forceFailure) {
        throw new Error("Email sending forced to fail (FORCE_EMAIL_FAILURE)");
      }
      const info = await transport.sendMail({ from, to, subject, text });
      return { messageId: info.messageId };
    },
  };
}
