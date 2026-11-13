import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-049',
  category: 'logging',
  title: "A First Kafka Consumer",
  level: 'BEGINNER',
  tags: ["logging","kafka","consumer","volume"],
  estMinutes: 10,
  quiz: fromLogging(["log-2016","log-2017","log-2018","log-2019","log-2020"]),
  description: `
Kestrel Energy reads thousands of meter readings a second from a Kafka topic. Decide what to log for each record, and at which level.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Topic, partition and offset point to one exact record.",
    "At high volume, the per-record line is DEBUG.",
    "Log the meter ID, not the household.",
  ],
}
