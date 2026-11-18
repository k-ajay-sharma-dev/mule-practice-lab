import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-159',
  category: 'logging',
  title: "The Job Run Summary",
  level: 'ADVANCED',
  tags: ["logging","myproject","azure-blob","job-log","reconciliation","planning-platform"],
  estMinutes: 25,
  quiz: fromLogging(["log-12041","log-12042","log-12043","log-12044","log-12045"]),
  description: `
Fenwick Supply’s hub writes one summary when a message is fully processed. Log it so it matches the job log table.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log records, loaded and rejected so they can be added up.",
    "Add the final ack and the duration.",
    "On failure, log how many rows loaded and where the message went.",
  ],
}
