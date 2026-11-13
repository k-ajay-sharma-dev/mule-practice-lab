import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-050',
  category: 'logging',
  title: "Manual Ack and Nack in Anypoint MQ",
  level: 'INTERMEDIATE',
  tags: ["logging","anypoint-mq","acknowledgement","redelivery"],
  estMinutes: 15,
  quiz: fromLogging(["log-2021","log-2022","log-2023","log-2024","log-2025"]),
  description: `
Bramblewood Insurance stores claim events from Anypoint MQ with MANUAL acknowledgement. The flow acks a claim when it is stored and nacks it when the database is down for a moment. Log both paths.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A nack that leads to redelivery is WARN, with the delivery count.",
    "Save the MQ attributes in variables before other operations replace them.",
    "Work that takes longer than the ack timeout can be delivered twice. Log it.",
  ],
}
