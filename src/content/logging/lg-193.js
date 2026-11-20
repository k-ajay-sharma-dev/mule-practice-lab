import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-193',
  category: 'logging',
  title: "Aggregator Groups and Fallback",
  level: 'ADVANCED',
  tags: ["logging","myproject","batch","aggregator","bulk-insert"],
  estMinutes: 25,
  quiz: fromLogging(["log-16011","log-16012","log-16013","log-16014","log-16015"]),
  description: `
Quayle Freight loads shipments with a Batch Job. A Batch Aggregator collects the records into groups, and each group is written with one bulk insert. When a bulk insert fails, the flow inserts that group's rows one by one. Log the right detail at the right level.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log each group at DEBUG.",
    "Log fallbacks at WARN with inserted and rejected.",
    "Rows should equal inserted plus rejected.",
  ],
}
