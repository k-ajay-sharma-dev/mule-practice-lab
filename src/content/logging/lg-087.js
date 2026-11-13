import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-087',
  category: 'logging',
  title: "Salesforce Bulk API Jobs",
  level: 'ADVANCED',
  tags: ["logging","salesforce","bulk-api"],
  estMinutes: 20,
  quiz: fromLogging(["log-4056","log-4057","log-4058","log-4059","log-4060"]),
  description: `
Copperfield Wholesale loads 400,000 price book entries into Salesforce each night with Bulk API 2.0 jobs. Log the job, not the records.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the job ID when the job is created.",
    "Polls go at DEBUG and the final state at INFO, WARN or ERROR.",
    "JobComplete can still have failed records, so log the counts.",
  ],
}
