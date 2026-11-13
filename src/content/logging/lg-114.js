import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-114',
  category: 'logging',
  title: "Audit Lines for Claim Decisions",
  level: 'BEGINNER',
  tags: ["logging","audit"],
  estMinutes: 15,
  quiz: fromLogging(["log-6041","log-6042","log-6043","log-6044","log-6045"]),
  description: `
The Oakridge Claims Process API approves and denies health claims, some by rule and some by hand. The audit team needs a record of every decision without any health data.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "An audit line says what was decided, on which record, by whom and why.",
    "Audit lines are INFO, never DEBUG.",
    "Log IDs and reason codes, not patient data.",
  ],
}
