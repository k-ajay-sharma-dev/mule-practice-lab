import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-152',
  category: 'logging',
  title: "Acks, Nacks and the DLQ",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","queues","ack","dlq"],
  estMinutes: 25,
  quiz: fromLogging(["log-12006","log-12007","log-12008","log-12009","log-12010"]),
  description: `
A Harrow Parts consumer acks, nacks or dead letters every message. Log each outcome so you can tell where any message went.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log every message outcome: acked, nacked or sent to the DLQ.",
    "Add the delivery count and the limit on a nack.",
    "Log the DLQ at ERROR with the reason.",
  ],
}
