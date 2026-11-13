import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-053',
  category: 'logging',
  title: "Kafka Keys and Partitions",
  level: 'INTERMEDIATE',
  tags: ["logging","kafka","keys","ordering"],
  estMinutes: 15,
  quiz: fromLogging(["log-2036","log-2037","log-2038","log-2039","log-2040"]),
  description: `
Redfern Logistics publishes parcel status events to Kafka with the parcel ID as the key, and a Tracking app reads them. Log the key, so the order of one parcel can be checked.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "The key is the business key. Log it on both sides.",
    "An event published with no key loses its order: WARN.",
    "When an event is ignored, log both the old and the new value.",
  ],
}
