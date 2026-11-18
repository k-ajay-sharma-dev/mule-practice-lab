import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-189',
  category: 'logging',
  title: "The Daily Integration Report",
  level: 'ADVANCED',
  tags: ["logging","myproject","email","job-log","monitoring","planning-platform"],
  estMinutes: 25,
  quiz: fromLogging(["log-15041","log-15042","log-15043","log-15044","log-15045"]),
  description: `
Marrow & Pine Home emails a daily integration report. Log expected against completed so missing runs show.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log expected, completed, failed and missing.",
    "Log each expected job that did not run.",
    "Absence of errors is not success.",
  ],
}
