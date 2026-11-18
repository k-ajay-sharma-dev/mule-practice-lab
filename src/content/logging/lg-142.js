import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-142',
  category: 'logging',
  title: "Stock Holds That Expire",
  level: 'INTERMEDIATE',
  tags: ["logging","inventory","ecommerce","timeouts"],
  estMinutes: 20,
  quiz: fromLogging(["log-11006","log-11007","log-11008","log-11009","log-11010"]),
  description: `
Copperleaf Electronics holds stock while a customer pays. Log holds that start, end and run out, so the team can explain stock that shows as sold out.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the start and end of each hold with one hold ID.",
    "Say whether a hold was paid, expired or cancelled.",
    "When a release fails, say what will retry it.",
  ],
}
