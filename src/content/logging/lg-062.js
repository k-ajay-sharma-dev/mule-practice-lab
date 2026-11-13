import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-062',
  category: 'logging',
  title: "A Scheduled Stock Export",
  level: 'BEGINNER',
  tags: ["logging","scheduler","files"],
  estMinutes: 15,
  quiz: fromLogging(["log-3006","log-3007","log-3008","log-3009","log-3010"]),
  description: `
A Scheduler at Brackenfield Tools runs a stock export every 10 minutes and writes a CSV for the warehouse. Most runs find nothing new. Decide what each run logs.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A run that finds nothing is DEBUG. A run that writes a file is INFO.",
    "Name the job and the file, and give the row count and the duration.",
    "A write that fails until someone fixes the rights is ERROR.",
  ],
}
