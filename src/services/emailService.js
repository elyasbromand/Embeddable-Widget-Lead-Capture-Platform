// Confirmation email for one submission. Dependencies are injected so tests use fakes.
// Throws when sending fails: in the worker, a throw is what makes pg-boss retry the job.
export function createEmailService({ findSubmissionForEmail, mailer }) {
  return {
    async sendConfirmation(submissionId) {
      const submission = await findSubmissionForEmail(submissionId);
      if (!submission) {
        // Retrying cannot make a missing row appear (e.g. its widget was deleted). Not an error.
        return { status: "skipped", reason: "submission not found" };
      }

      // The recipient is the visitor's answer to the widget's first email-type field.
      const emailField = submission.widgetFields.find((field) => field.type === "email");
      const to = emailField ? submission.data[emailField.name] : undefined;
      if (!to) {
        return { status: "skipped", reason: "no email field answered" };
      }

      // Plain text only: the title is tenant-written text, so no HTML is built from it.
      const { messageId } = await mailer.send({
        to,
        subject: `We received your message: ${submission.widgetTitle}`,
        text: `Thanks! Your submission to "${submission.widgetTitle}" was received.\n\nReference: ${submission.id}`,
      });
      return { status: "sent", messageId };
    },
  };
}
