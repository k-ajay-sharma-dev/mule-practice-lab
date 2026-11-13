import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-028',
  category: 'logging',
  title: "Audit and Reconciliation",
  level: 'INTERMEDIATE',
  tags: ["logging","audit","reconciliation"],
  estMinutes: 15,
  quiz: fromLogging(["log-120","log-119","log-215","log-424","log-413"]),
  description: `
The business needs a record of price changes and a nightly comparison of orders and payments between systems. Log these results so they stand up in an audit.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "An audit line says who did what, to which record, and when.",
    "A reconciliation logs the counts compared and the IDs that differ.",
    "Differences that someone must fix are WARN or ERROR, never DEBUG.",
  ],
}
