import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-019',
  category: 'logging',
  title: "Scatter-Gather",
  level: 'ADVANCED',
  tags: ["logging","scatter-gather"],
  estMinutes: 15,
  quiz: fromLogging(["log-106","log-107","log-216","log-407","log-408"]),
  description: `
A Scatter-Gather calls three systems at once. Sometimes one route fails. Log the result so you can tell which route failed and what the caller got.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "When one route fails, the error holds each route result. Log which route failed and why.",
    "A failed optional route that the flow handles is WARN.",
    "One line after the Scatter-Gather sums up what came back.",
  ],
}
