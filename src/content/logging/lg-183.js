import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-183',
  category: 'logging',
  title: "Stored Procedures",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","oracle","stored-procedure","cursor"],
  estMinutes: 25,
  quiz: fromLogging(["log-15011","log-15012","log-15013","log-15014","log-15015"]),
  description: `
Fenwick Supply calls Oracle procedures for outbound extracts and async jobs. Log each call with its window and row count.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the procedure name, input window and rows.",
    "Warn on zero rows on a business day.",
    "Log failures with the job ID.",
  ],
}
