import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-060',
  category: 'logging',
  title: "A Poison Record on a Kafka Topic",
  level: 'ADVANCED',
  tags: ["logging","kafka","poison-message","dead-letter"],
  estMinutes: 15,
  quiz: fromLogging(["log-2071","log-2072","log-2073","log-2074","log-2075"]),
  description: `
Brightmoor Stores reads loyalty points from Kafka. One record is not valid JSON and stops its partition. Log the stuck record, the copy sent to a dead-letter topic, and the replay.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Kafka has no dead-letter topic of its own. Your flow sends the record there.",
    "Log the partition, offset and key of the poison record, never its body.",
    "A replay logs the original offset, so the story of one record joins up.",
  ],
}
