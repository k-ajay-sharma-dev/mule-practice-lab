import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-184',
  category: 'logging',
  title: "Job Rows and the Outbound Console",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","oracle","job-log","outbound","blue-yonder"],
  estMinutes: 25,
  quiz: fromLogging(["log-15016","log-15017","log-15018","log-15019","log-15020"]),
  description: `
Support staff start outbound jobs from a console. Log who started what, and when a second start is refused.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log job ID, type, trigger and requester ID.",
    "Use a user ID, not an email address.",
    "Log refused starts with the running job ID.",
  ],
}
