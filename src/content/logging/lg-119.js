import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-119',
  category: 'logging',
  title: "Log Sampling at High Volume",
  level: 'ADVANCED',
  tags: ["logging","sampling","volume"],
  estMinutes: 15,
  quiz: fromLogging(["log-6066","log-6067","log-6068","log-6069","log-6070"]),
  description: `
The Velo Fare Quote API takes 3000 requests a second, and the log bill is too high. The team keeps 1 in 100 success lines. Decide what can be sampled and how to mark it.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Sample only routine success lines, never warnings or errors.",
    "Mark sampled lines with the rate, so counts can be scaled.",
    "A sampled log may not hold the line for one complaint.",
  ],
}
