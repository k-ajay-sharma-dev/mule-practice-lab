import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-059',
  category: 'logging',
  title: "Kafka Consumer Lag and Commits",
  level: 'ADVANCED',
  tags: ["logging","kafka","lag","offsets"],
  estMinutes: 20,
  quiz: fromLogging(["log-2066","log-2067","log-2068","log-2069","log-2070"]),
  description: `
Marlow Ride reads scooter trips from Kafka. After a busy evening the consumers fall behind, and after a deployment some trips are processed twice. Log what you need to explain both.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log how late a record is next to the target.",
    "Log partition and offset on receive and on commit, at DEBUG.",
    "Records read twice are explained by offsets, not by the broker.",
  ],
}
