import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-015',
  category: 'logging',
  title: "Receiving from Anypoint MQ",
  level: 'INTERMEDIATE',
  tags: ["logging","anypoint-mq","events"],
  estMinutes: 15,
  quiz: fromLogging(["log-202","log-325","log-401","log-225","log-402"]),
  description: `
Order events arrive from Anypoint MQ, and your flows publish shipment and order events. Log the messages so one event can be traced from publisher to consumer.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "The first line logs the message ID, the business key and the correlation ID.",
    "Log after a publish with the destination and the message ID.",
    "Log the acknowledgement once processing is done.",
  ],
}
