import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-121',
  category: 'logging',
  title: "Retries That Give Up",
  level: 'INTERMEDIATE',
  tags: ["logging","until-successful","retries","errors"],
  estMinutes: 20,
  quiz: fromLogging(["log-7001","log-7002","log-7003","log-7004","log-7005"]),
  description: `
Copperfield Freight books loads with carriers through an Until Successful scope. When a carrier is slow, bookings retry, and some end up on the manual booking queue. Log each failed attempt and the final failure so support can follow one shipment from first try to last.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log each failed attempt at WARN, with the attempt number and the error.",
    "When the retries run out, log at ERROR and say where the work went next.",
    "Keep the shipment ID and correlation ID on every line.",
  ],
}
