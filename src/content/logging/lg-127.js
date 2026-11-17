import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-127',
  category: 'logging',
  title: "Shadow Mode for a New Pricing Engine",
  level: 'ADVANCED',
  tags: ["logging","shadow-mode","migration","metrics"],
  estMinutes: 20,
  quiz: fromLogging(["log-8006","log-8007","log-8008","log-8009","log-8010"]),
  description: `
Orrin Hardware is testing a new pricing engine. Both engines price every quote, and customers still get the old price. Log the differences and the shadow failures so the team can decide, with numbers, when to switch.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log both prices and the difference as labelled numbers.",
    "Say which engine served the customer on every line.",
    "A failing shadow call is a WARN, because no customer was affected.",
  ],
}
