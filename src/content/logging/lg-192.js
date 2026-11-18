import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-192',
  category: 'logging',
  title: "Failed Records in a Batch",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","batch","reject-table","accept-policy"],
  estMinutes: 25,
  quiz: fromLogging(["log-16006","log-16007","log-16008","log-16009","log-16010"]),
  description: `
Quayle Freight collects failed records with an ONLY_FAILURES step. Log each failure and the reject summary.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the step, the key and the reason.",
    "Never log the whole record.",
    "The reject count should match failedRecords.",
  ],
}
