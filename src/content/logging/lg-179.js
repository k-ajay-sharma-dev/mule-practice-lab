import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-179',
  category: 'logging',
  title: "Delta Extracts",
  level: 'ADVANCED',
  tags: ["logging","myproject","sql-server","watermark","planning-platform"],
  estMinutes: 25,
  quiz: fromLogging(["log-14041","log-14042","log-14043","log-14044","log-14045"]),
  description: `
Larkfield Grocers sends item changes to the planning platform with delta extracts. Log each window so gaps can be proven.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log from, to and rows for every run.",
    "Stop and log when the watermark is ahead of the data.",
    "Keep row data out of the log.",
  ],
}
