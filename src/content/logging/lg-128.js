import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-128',
  category: 'logging',
  title: "One App, Many Tenants",
  level: 'INTERMEDIATE',
  tags: ["logging","multi-tenant","saas","privacy"],
  estMinutes: 20,
  quiz: fromLogging(["log-8011","log-8012","log-8013","log-8014","log-8015"]),
  description: `
Tallis Payroll Cloud runs one Mule app for 400 client companies, and all of them share one log store. Log so support can follow one client, while no client data leaks into lines other teams can read.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Put tenantId on every line, with the same field names for every tenant.",
    "Name the missing setting or failing part, never employee data.",
    "Request lines with tenantId and durationMs show which client is slow or busy.",
  ],
}
