import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-200',
  category: 'logging',
  title: "Step Timelines for a Nightly Chain",
  level: 'EXPERT',
  tags: ["logging","myproject","large-files","timeline","monitoring","planning-platform"],
  estMinutes: 25,
  quiz: fromLogging(["log-16046","log-16047","log-16048","log-16049","log-16050"]),
  description: `
Thornbury Freight runs a nightly chain of large file steps before stores open. Log each step against its expected time.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log each step with rows and duration.",
    "Log late steps with the deadline.",
    "Trend step durations over weeks.",
  ],
}
