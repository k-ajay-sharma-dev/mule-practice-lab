import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-085',
  category: 'logging',
  title: "Points Ledger Transactions",
  level: 'INTERMEDIATE',
  tags: ["logging","database","transactions"],
  estMinutes: 15,
  quiz: fromLogging(["log-4046","log-4047","log-4048","log-4049","log-4050"]),
  description: `
The Points API of Bluewater Rewards moves points between members with two inserts in one database transaction. Log commits, rollbacks and refusals truthfully.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Nothing is committed until the Try scope ends.",
    "In the error handler, say that the transaction rolls back.",
    "A refused request is a WARN, not an ERROR.",
  ],
}
