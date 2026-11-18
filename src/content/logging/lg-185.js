import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-185',
  category: 'logging',
  title: "Locks and Long Transactions",
  level: 'ADVANCED',
  tags: ["logging","myproject","oracle","locks","transactions"],
  estMinutes: 25,
  quiz: fromLogging(["log-15021","log-15022","log-15023","log-15024","log-15025"]),
  description: `
Fenwick Supply claims job rows with locks. Log lock waits and rollbacks so a session left open can be found.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the table, wait and Oracle code on lock timeouts.",
    "Log every rollback with what was claimed.",
    "Keep SQL text out.",
  ],
}
