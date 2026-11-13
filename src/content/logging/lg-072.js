import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-072',
  category: 'logging',
  title: "Max Failed Records in a Batch Job",
  level: 'ADVANCED',
  tags: ["logging","batch","max-failed-records"],
  estMinutes: 20,
  quiz: fromLogging(["log-3056","log-3057","log-3058","log-3059","log-3060"]),
  description: `
Summit Payroll calculates pay for 12,000 employees in a Batch Job with maxFailedRecords set to 50. Log failed records, a stopped job and a run whose load phase failed.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A job stopped by max failed records is ERROR, with processed against total.",
    "Failed payroll records are logged by employee ID, never name, salary or bank data.",
    "In On Complete the payload is the BatchJobResult. Pick its fields, never write it whole.",
  ],
}
