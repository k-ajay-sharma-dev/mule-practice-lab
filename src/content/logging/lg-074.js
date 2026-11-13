import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-074',
  category: 'logging',
  title: "Fixed-Width Statement Files",
  level: 'ADVANCED',
  tags: ["logging","flat-file","files"],
  estMinutes: 20,
  quiz: fromLogging(["log-3066","log-3067","log-3068","log-3069","log-3070"]),
  description: `
Harbourview Building Society loads a fixed-width statement file each night. Records hold account numbers and names. Log the parse results and errors without copying account data.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Compare the record count with the trailer count in the parsed line.",
    "Point to a bad record by file and line number, never by its text.",
    "With streaming off, one bad record fails the whole parse and leaves members without statements. That is ERROR.",
  ],
}
