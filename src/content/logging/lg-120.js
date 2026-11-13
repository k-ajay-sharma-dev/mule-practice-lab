import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-120',
  category: 'logging',
  title: "One Order Through Four Apps",
  level: 'ADVANCED',
  tags: ["logging","elk","correlation-id","structured-logging"],
  estMinutes: 20,
  quiz: fromLogging(["log-6071","log-6072","log-6073","log-6074","log-6075"]),
  description: `
A Saltmarsh order passes through the Order Process API and three System APIs. The team traces orders in Kibana. Keep one correlation ID and one set of field names across all four apps.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Pass X-Correlation-ID on every call, and set the ID as a user property on a message you publish.",
    "Use the same field names and number types in every app.",
    "Log the time of each call, so a slow order shows where the time went.",
  ],
}
