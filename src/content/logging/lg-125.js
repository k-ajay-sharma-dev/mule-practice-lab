import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-125',
  category: 'logging',
  title: "The Nightly Reconciliation Job",
  level: 'BEGINNER',
  tags: ["logging","batch","reconciliation","metrics"],
  estMinutes: 20,
  quiz: fromLogging(["log-7021","log-7022","log-7023","log-7024","log-7025"]),
  description: `
Ashgrove Utilities runs a nightly job that compares meter readings between the head-end system and billing, and sends missing ones again. Keep the logs small: one line per problem and one summary per run.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "End each run with one INFO summary line of labelled counts and the duration.",
    "Log each missing reading at WARN with its IDs and what the job did about it.",
    "Put the run date on every line so two runs are never mixed up.",
  ],
}
