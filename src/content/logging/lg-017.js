import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-017',
  category: 'logging',
  title: "Duplicates and Replays",
  level: 'INTERMEDIATE',
  tags: ["logging","idempotency","dlq"],
  estMinutes: 10,
  quiz: fromLogging(["log-103","log-201","log-421","log-223"]),
  description: `
The same payment notification arrives twice, and an operator replays an order from the dead-letter queue. Log duplicates and replays so they can be counted and explained.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A duplicate stopped by the Idempotent Message Validator is expected: INFO or WARN, not ERROR.",
    "Log the key that was found to be a duplicate.",
    "A replay says it is a replay and what the outcome was.",
  ],
}
