import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-194',
  category: 'logging',
  title: "Run Locks and Overlapping Runs",
  level: 'ADVANCED',
  tags: ["logging","myproject","batch","scheduler","locks"],
  estMinutes: 25,
  quiz: fromLogging(["log-16016","log-16017","log-16018","log-16019","log-16020"]),
  description: `
Quayle Freight guards nightly jobs with a run lock. Log taken, released and skipped runs.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log a skipped run with the lock holder.",
    "Log the lock release with the duration.",
    "A taken line with no release means a stuck lock.",
  ],
}
