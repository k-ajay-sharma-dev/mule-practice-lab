import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-196',
  category: 'logging',
  title: "Large File Intake",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","large-files","streaming","memory"],
  estMinutes: 25,
  quiz: fromLogging(["log-16026","log-16027","log-16028","log-16029","log-16030"]),
  description: `
Thornbury Freight receives multi gigabyte files. Log them without reading the content.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Use attributes.size, never sizeOf on the payload.",
    "Log streaming mode.",
    "Move files above the limit aside and say so.",
  ],
}
