import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-155',
  category: 'logging',
  title: "Staging Loads with a One-by-One Fallback",
  level: 'ADVANCED',
  tags: ["logging","myproject","queues","batch","oracle","bulk-insert"],
  estMinutes: 25,
  quiz: fromLogging(["log-12021","log-12022","log-12023","log-12024","log-12025"]),
  description: `
Fenwick Supply loads records into staging tables with bulk inserts. When a bulk insert fails, it inserts rows one by one to find the bad row.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log a WARN when a batch falls back to one-by-one inserts.",
    "Log each rejected row with its key and the reason.",
    "Log one summary with loaded, successful and failed counts.",
  ],
}
