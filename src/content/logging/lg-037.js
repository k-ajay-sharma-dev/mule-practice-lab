import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-037',
  category: 'logging',
  title: "PATCH a Customer: Logging Partial Updates",
  level: 'INTERMEDIATE',
  tags: ["logging","patch","system-api"],
  estMinutes: 15,
  quiz: fromLogging(["log-1031","log-1032","log-1033","log-1034","log-1035"]),
  description: `
The Customer System API of an invented telecom company takes PATCH /customers/{customerId}. A patch can change an email, a phone number, or a read-only field it should not touch. Log the changes without the personal data.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the names of the changed fields, not their values.",
    "A change the API refuses with 422 is a WARN with error.errorType.",
    "The patch body can hold personal data, so it stays out of the log.",
  ],
}
