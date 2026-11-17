import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-135',
  category: 'logging',
  title: "Queue Backlog Warnings",
  level: 'INTERMEDIATE',
  tags: ["logging","queues","backlog","metrics"],
  estMinutes: 20,
  quiz: fromLogging(["log-9021","log-9022","log-9023","log-9024","log-9025"]),
  description: `
Grayling Distribution receives orders on a queue. On busy days the queue falls behind. Log the backlog so the team knows when orders are late, how late, and whether more consumers would help.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log one WARN when the oldest message passes its target, with depth, age and target.",
    "Log one INFO when the backlog clears, with how long it lasted.",
    "Depth, oldest age and consume rate tell you whether to add consumers.",
  ],
}
