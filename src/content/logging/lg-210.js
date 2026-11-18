import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-210',
  category: 'logging',
  title: "Bad Rows in a Large CSV",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","large-files","csv","validation"],
  estMinutes: 25,
  quiz: fromLogging(["log-17046","log-17047","log-17048","log-17049","log-17050"]),
  description: `
Thornbury Freight checks the field count of every row in large CSV files. Log bad rows and a summary.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log file, line and field counts for a bad row.",
    "Never log the row content.",
    "read should equal loaded plus rejected.",
  ],
}
