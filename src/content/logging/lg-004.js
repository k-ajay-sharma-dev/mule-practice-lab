import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-004',
  category: 'logging',
  title: "SAP Failure and the Dead-Letter Queue",
  level: 'INTERMEDIATE',
  tags: ["logging","error-handling","dlq"],
  estMinutes: 15,
  quiz: fromLogging(["log-003","log-024","log-042","log-062","log-307","log-224"]),
  description: `
Some orders can never reach SAP: the retries run out, or SAP rejects the data. Those orders go to a dead-letter queue for a person to fix. Log these failures so support can act on them.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A failure that needs a person is ERROR.",
    "The line names the order, the error type and the error description, and says where the order went.",
    "A rejection that a retry cannot fix is logged once, without retries.",
  ],
}
