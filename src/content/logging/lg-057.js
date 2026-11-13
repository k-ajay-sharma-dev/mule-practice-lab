import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-057',
  category: 'logging',
  title: "Order Matters: Anypoint MQ FIFO Queues",
  level: 'ADVANCED',
  tags: ["logging","anypoint-mq","fifo","ordering"],
  estMinutes: 20,
  quiz: fromLogging(["log-2056","log-2057","log-2058","log-2059","log-2060"]),
  description: `
Juniper Air applies seat changes from an Anypoint MQ FIFO queue, with the booking reference as the message group. Order matters, and one bad message can hold up every message in its group. Log enough to prove the order and to find a blocked group fast.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log a sequence number to prove the order of events.",
    "A gap in the sequence is WARN when the flow holds the event.",
    "On a FIFO queue a failing message blocks its message group: ERROR, and say so.",
  ],
}
