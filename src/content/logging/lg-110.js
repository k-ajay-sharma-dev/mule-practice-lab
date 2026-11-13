import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-110',
  category: 'logging',
  title: "Fare Search With Scatter-Gather",
  level: 'INTERMEDIATE',
  tags: ["logging","scatter-gather","elk"],
  estMinutes: 15,
  quiz: fromLogging(["log-6021","log-6022","log-6023","log-6024","log-6025"]),
  description: `
The Skyline Fare Search API asks three airline APIs at once with a Scatter-Gather and merges the fares. Log the result of each search, and the searches where one airline failed.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "After a Scatter-Gather, payload has one key per route: \"0\", \"1\" and so on.",
    "On a MULE:COMPOSITE_ROUTING, the failed routes are in error.errorMessage.payload.failures.",
    "A partial result that the caller still gets is WARN.",
  ],
}
