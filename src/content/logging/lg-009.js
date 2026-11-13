import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-009',
  category: 'logging',
  title: "Payments",
  level: 'INTERMEDIATE',
  tags: ["logging","payments","json"],
  estMinutes: 15,
  quiz: fromLogging(["log-026","log-070","log-310","log-426","log-427"]),
  description: `
The payment flow charges cards, and sometimes the provider declines or the refund fails. Log each outcome with what support needs and nothing a fraudster could use.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the payment reference and the outcome, never the card number.",
    "A declined card is a normal answer: INFO or WARN. A failed refund that needs a person is ERROR.",
    "When logs go to Splunk as JSON, write one object on one line with named fields.",
  ],
}
