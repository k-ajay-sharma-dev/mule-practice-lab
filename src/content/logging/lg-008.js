import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-008',
  category: 'logging',
  title: "What Must Never Reach a Log",
  level: 'INTERMEDIATE',
  tags: ["logging","security","pii"],
  estMinutes: 15,
  quiz: fromLogging(["log-328","log-320","log-041","log-068","log-323"]),
  description: `
A security review is coming. Go through the loggers of a customer portal and a payment flow and find everything that must never be written to a log.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Passwords, tokens, card numbers and CVVs never appear in a log, at any level.",
    "Personal data such as names, emails and addresses stay out. Log an ID instead.",
    "A leftover DEBUG setting in production can leak what DEBUG lines print.",
  ],
}
