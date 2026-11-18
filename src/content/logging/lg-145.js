import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-145',
  category: 'logging',
  title: "Order Status Changes",
  level: 'ADVANCED',
  tags: ["logging","state","orders","validation"],
  estMinutes: 25,
  quiz: fromLogging(["log-11021","log-11022","log-11023","log-11024","log-11025"]),
  description: `
Northgate Furniture orders move through a fixed set of statuses. Log every change and every refused change, so the life of an order can be rebuilt from the logs.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log each change with from, to and the source.",
    "Log a refused change at WARN with the reason and where it went.",
    "Put the order ID on every line.",
  ],
}
