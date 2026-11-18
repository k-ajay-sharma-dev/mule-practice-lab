import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-151',
  category: 'logging',
  title: "Publishing Orders to a Queue",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","queues","publish","outbox"],
  estMinutes: 25,
  quiz: fromLogging(["log-12001","log-12002","log-12003","log-12004","log-12005"]),
  description: `
Harrow Parts publishes each new order to a queue for the warehouse. Log each publish so an order can be followed from the API to the warehouse.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the queue, the broker message ID and the order ID.",
    "Keep the order body out of the line.",
    "When a publish fails, say where the order is kept and what happens next.",
  ],
}
