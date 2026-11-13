import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-010',
  category: 'logging',
  title: "Batch Jobs: One Summary, Not a Line per Record",
  level: 'INTERMEDIATE',
  tags: ["logging","batch"],
  estMinutes: 15,
  quiz: fromLogging(["log-007","log-204","log-226","log-065","log-304","log-433"]),
  description: `
A nightly batch job loads thousands of accounts and workers. Operations want to know how each run went without reading thousands of lines.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log one line when the job starts with the record count, and one in On Complete with the totals.",
    "Lines for each record belong at DEBUG at most.",
    "Failed records are counted, and the IDs that failed are listed where someone can act on them.",
  ],
}
