import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-071',
  category: 'logging',
  title: "Nightly Load Reconciliation",
  level: 'BEGINNER',
  tags: ["logging","reconciliation","files"],
  estMinutes: 10,
  quiz: fromLogging(["log-3051","log-3052","log-3053","log-3054","log-3055"]),
  description: `
Willowdene Pharmacy loads stock moves each night from a file with a trailer count. Log the counts so anyone can see if the night is whole.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log expected, read, loaded and rejected counts in one line.",
    "Counts that agree are INFO. A mismatch that stops the load is ERROR.",
    "Counts prove the data is whole without logging the data.",
  ],
}
