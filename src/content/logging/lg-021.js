import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-021',
  category: 'logging',
  title: "Slow Calls and Circuit Breakers",
  level: 'ADVANCED',
  tags: ["logging","performance","resilience"],
  estMinutes: 15,
  quiz: fromLogging(["log-011","log-121","log-403","log-116","log-210","log-406"]),
  description: `
Calls to pricing and inventory get slow, and a circuit breaker stops calling them for a while. Log slowness and the breaker state so trouble shows before customers complain.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A call that worked but came close to its limit is WARN with the duration and the limit.",
    "Log when the circuit opens and when it closes, not every skipped call.",
    "Durations in milliseconds, labelled, let you search for slow calls.",
  ],
}
