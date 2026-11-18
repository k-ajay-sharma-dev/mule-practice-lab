import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-174',
  category: 'logging',
  title: "Fixed Width Exports",
  level: 'ADVANCED',
  tags: ["logging","myproject","ftp","fixed-width","master-data","planning-platform"],
  estMinutes: 25,
  quiz: fromLogging(["log-14016","log-14017","log-14018","log-14019","log-14020"]),
  description: `
Marrow & Pine Home sends fixed width master data files. Log truncated fields and stop files with wrong record lengths.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the record, field, width and original length when a value is cut.",
    "Stop and log when record lengths are wrong.",
    "Keep values out of the log.",
  ],
}
