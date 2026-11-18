import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-186',
  category: 'logging',
  title: "Async Notification Emails",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","email","async","smtp"],
  estMinutes: 25,
  quiz: fromLogging(["log-15026","log-15027","log-15028","log-15029","log-15030"]),
  description: `
Marrow & Pine Home sends job report emails after each job. Log sends and failures without exposing addresses.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the template, job ID and a recipient count.",
    "Never log addresses or bodies.",
    "Say the job status is unchanged when only the email failed.",
  ],
}
