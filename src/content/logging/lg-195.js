import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-195',
  category: 'logging',
  title: "Checkpoints and Restarts",
  level: 'EXPERT',
  tags: ["logging","myproject","batch","checkpoint","restart"],
  estMinutes: 25,
  quiz: fromLogging(["log-16021","log-16022","log-16023","log-16024","log-16025"]),
  description: `
Quayle Freight loads history in key ranges with checkpoints. Log restarts so you can prove nothing was skipped or repeated.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the restart key and the ranges left.",
    "Stop and log when no checkpoint exists for an unfinished run.",
    "Keep data out of the log.",
  ],
}
