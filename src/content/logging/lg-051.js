import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-051',
  category: 'logging',
  title: "Messages That End Up in the DLQ",
  level: 'INTERMEDIATE',
  tags: ["logging","anypoint-mq","dlq","support"],
  estMinutes: 15,
  quiz: fromLogging(["log-2026","log-2027","log-2028","log-2029","log-2030"]),
  description: `
Corvane Pharmacy moves refill events that keep failing to a dead-letter queue, and a second flow raises a support ticket for each one. Log the last failure and the DLQ handler.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "The last failed delivery is ERROR, with where the message goes next.",
    "A DLQ handler logs what it read and what it did with it.",
    "Health data stays out of the log. Log the refill ID.",
  ],
}
