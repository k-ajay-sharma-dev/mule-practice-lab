import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-030',
  category: 'logging',
  title: "Customer and Shipment APIs",
  level: 'INTERMEDIATE',
  tags: ["logging","experience-api","carriers"],
  estMinutes: 15,
  quiz: fromLogging(["log-301","log-046","log-308","log-431","log-436"]),
  description: `
A Customer Experience API looks up customers, and a Shipment Process API calls one of three carriers and creates labels. Review and write their loggers.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log IDs, not names or addresses.",
    "After a carrier call, log the carrier and the tracking number.",
    "A line before a call only helps when the line after it gives the result and the time.",
  ],
}
