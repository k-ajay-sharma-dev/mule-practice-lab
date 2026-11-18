import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-182',
  category: 'logging',
  title: "Rejects and Constraint Errors",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","oracle","reject-table","constraints"],
  estMinutes: 25,
  quiz: fromLogging(["log-15006","log-15007","log-15008","log-15009","log-15010"]),
  description: `
Fenwick Supply sends bad rows to a reject table. Log each one with the Oracle code and the column.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log table, key, Oracle code and column.",
    "Never log the statement with its values.",
    "Log blocks retried as MERGE.",
  ],
}
