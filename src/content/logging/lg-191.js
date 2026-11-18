import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-191',
  category: 'logging',
  title: "Batch Job Start and On Complete",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","batch","on-complete","job-log"],
  estMinutes: 25,
  quiz: fromLogging(["log-16001","log-16002","log-16003","log-16004","log-16005"]),
  description: `
Quayle Freight runs nightly batch jobs. Log the start and one honest summary from On Complete.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log total, successful and failed records.",
    "Set the status from the counts.",
    "Log a stop caused by the failure limit.",
  ],
}
