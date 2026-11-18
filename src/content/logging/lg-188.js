import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-188',
  category: 'logging',
  title: "Report Emails With Summaries",
  level: 'ADVANCED',
  tags: ["logging","myproject","email","reports","azure-blob"],
  estMinutes: 25,
  quiz: fromLogging(["log-15036","log-15037","log-15038","log-15039","log-15040"]),
  description: `
Large reports are stored and a summary email is sent. Log where the report is, and warn on unusual reject rates.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the container and blob name, not the signed link.",
    "Log the reject count and size.",
    "Warn when the reject rate is far above normal.",
  ],
}
