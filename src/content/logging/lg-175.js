import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-175',
  category: 'logging',
  title: "Reconciling Sales Across Transports",
  level: 'EXPERT',
  tags: ["logging","myproject","ftp","reconciliation","sftp","azure-file-share"],
  estMinutes: 25,
  quiz: fromLogging(["log-14021","log-14022","log-14023","log-14024","log-14025"]),
  description: `
Marrow & Pine Home receives store sales over FTP, SFTP and a file share. Log a daily reconciliation against finance.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log counts by source and both totals.",
    "Log the store with the biggest gap when totals differ.",
    "One line a day is enough when all is well.",
  ],
}
