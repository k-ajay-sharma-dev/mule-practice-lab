import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-113',
  category: 'logging',
  title: "Flow References and Sub-flows",
  level: 'INTERMEDIATE',
  tags: ["logging","sub-flow","category"],
  estMinutes: 15,
  quiz: fromLogging(["log-6036","log-6037","log-6038","log-6039","log-6040"]),
  description: `
The Wrenfield Shipment Booking API is split into a main flow, sub-flows and private flows called with Flow Reference. Log each part once, with a category operations can turn up on its own.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A sub-flow keeps the correlation ID of the flow that calls it.",
    "Log one result once, or every count doubles.",
    "A category per area lets operations raise one area to DEBUG.",
  ],
}
