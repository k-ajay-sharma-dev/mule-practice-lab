import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-157',
  category: 'logging',
  title: "Downloading and Validating Blob Messages",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","azure-blob","download","validation"],
  estMinutes: 25,
  quiz: fromLogging(["log-12031","log-12032","log-12033","log-12034","log-12035"]),
  description: `
Kestrel Logistics downloads JSON messages from blob storage and validates them against a schema. Log enough for the sender to fix a bad message.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the message ID, the blob and the record count.",
    "On a schema failure, log the error count and the first error path.",
    "Keep the message content out of the line.",
  ],
}
