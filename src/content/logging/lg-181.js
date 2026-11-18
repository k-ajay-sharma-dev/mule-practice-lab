import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-181',
  category: 'logging',
  title: "Staging and MERGE in Oracle",
  level: 'ADVANCED',
  tags: ["logging","myproject","oracle","merge","reconciliation","planning-platform"],
  estMinutes: 25,
  quiz: fromLogging(["log-15001","log-15002","log-15003","log-15004","log-15005"]),
  description: `
Fenwick Supply merges staged records into Oracle tables. Log counts that add up, and catch records that go missing.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log staged, inserted, updated and rejected.",
    "Check the counts add up before the final ack.",
    "Keep SQL text out of the log.",
  ],
}
