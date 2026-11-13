import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-078',
  category: 'logging',
  title: "ServiceNow Incidents",
  level: 'BEGINNER',
  tags: ["logging","servicenow","incidents"],
  estMinutes: 10,
  quiz: fromLogging(["log-4011","log-4012","log-4013","log-4014","log-4015"]),
  description: `
The Alerts System API of Harbourgate Logistics opens and updates ServiceNow incidents when warehouse devices fail. Log each ticket so people can find it.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the incident number, because people search ServiceNow by it.",
    "Add your own alert ID to tie the ticket to your system.",
    "Leave out callers and free-text notes.",
  ],
}
